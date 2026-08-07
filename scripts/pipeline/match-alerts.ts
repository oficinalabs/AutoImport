/**
 * Matching de alertas: liga as oportunidades do dia aos alertas ativos dos
 * stands. Por cada match novo cria uma linha em `alert_events` (que alimenta o
 * sino da topbar) e envia um email ao dono do stand — ambos com link direto
 * para o anúncio.
 *
 *   pnpm exec tsx scripts/pipeline/match-alerts.ts
 *
 * Corre no fim do run-daily, DEPOIS do flag-opportunities: parte da tabela
 * `opportunities`, que já garante veredito "compensa", confiança `normal` na
 * estimativa PT e dedupe por carro físico. Não repetimos esses filtros aqui —
 * se a regra do que "compensa" mudar, muda num sítio só.
 *
 * Idempotente: `alert_events` tem unique(alert_id, listing_id) e inserimos com
 * `on conflict do nothing`, portanto o mesmo anúncio nunca notifica duas vezes
 * o mesmo alerta, por muitas vezes que o pipeline corra.
 */
// Só tipos — apagado na compilação, portanto não corre antes do loadEnvFile
// abaixo (que é a razão de tudo o resto aqui ser `await import`).
import type { AlertCriteria, ModelFamily } from "../../lib/alert-criteria";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

// ⚠️ CORRER SEMPRE VIA `pnpm pipeline:alerts` (ou `pipeline:daily`), nunca
// `tsx scripts/pipeline/match-alerts.ts` à seca.
//
// Este é o único passo do pipeline que renderiza JSX (o email do match). O
// tsconfig principal usa `"jsx": "preserve"` — o bundler do Next trata disso,
// mas o `tsx`/esbuild não, e o React fica fora de escopo dentro dos componentes
// de email: "React is not defined", só em runtime e só no envio (o matching em
// si funciona, o email é que falha em silêncio para o utilizador).
// Os scripts do package.json passam TSX_TSCONFIG_PATH=tsconfig.scripts.json,
// que activa o JSX automático. Não dá para forçar daqui: o tsx lê a variável no
// arranque, antes deste ficheiro correr.

/** Linha de match nova, já com tudo o que o email precisa. */
interface NewMatch {
  alertId: string;
  alertName: string;
  listingId: string;
  listingTitle: string;
  country: string;
  totalPt: number;
  savings: number;
  ownerName: string | null;
  ownerEmail: string;
}

export async function matchAlerts() {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const { alertModelKeys } = await import("../../lib/alert-criteria");
  const { AlertMatchEmail } = await import("../../emails/alert-match");
  const { sendEmail } = await import("../../lib/email");
  const { formatEuro } = await import("../../lib/format");
  const { country } = await import("../../lib/countries");

  // 0. Que MODELO vigia cada alerta ativo. Resolvido aqui, em TypeScript, com o
  //    mesmo normalizador do pipeline (lib/engine/normalize-vehicle.ts) — é o
  //    que põe os alertas antigos, gravados com texto cru ("VOLKSWAGEN"/"Golf
  //    VII"), a falar a mesma língua que os novos, sem migração nenhuma.
  //    Um alerta cujos critérios não dêem um modelo NUNCA poderá casar; conta-se
  //    e diz-se, em vez de correr uma query que dá sempre zero.
  const ativos = (await db.execute(sql`
    select id, criteria from alerts where active = true
  `)) as unknown as { id: string; criteria: AlertCriteria | null }[];

  const vigiados: { id: string; family: ModelFamily }[] = [];
  for (const a of ativos) {
    const family = alertModelKeys(a.criteria ?? {});
    if (family) vigiados.push({ id: a.id, family });
  }
  const semModelo = ativos.length - vigiados.length;
  if (semModelo > 0) {
    console.warn(
      `match-alerts: ${semModelo} alerta(s) ativos sem modelo reconhecido — não casam com nada`,
    );
  }
  if (vigiados.length === 0) {
    console.log("match-alerts: 0 matches novos");
    return { matched: 0, emailed: 0, failed: 0 };
  }

  const familias = sql.join(
    vigiados.map(
      (v) => sql`(${v.id}::uuid, ${v.family.makeKey}::text, ${v.family.modelKey}::text)`,
    ),
    sql`, `,
  );

  // 1. Criar os eventos novos. O `returning` só devolve as linhas realmente
  //    inseridas (o `on conflict do nothing` cala as repetidas) — é sobre essas,
  //    e só essas, que enviamos email.
  //
  //    O casamento é pela FAMÍLIA normalizada do anúncio (vehicle_models, via
  //    listings.model_id), não por igualdade de texto cru: `VOLKSWAGEN` e
  //    `Volkswagen`, `Golf` e `Golf VII` são o mesmo carro para quem compra.
  const inserted = (await db.execute(sql`
    with familia(alert_id, make_key, model_key) as (values ${familias}),
    novos as (
      insert into alert_events (alert_id, listing_id)
      select a.id, o.listing_id
      from alerts a
      join familia f on f.alert_id = a.id
      join opportunities o on o.deleted_at is null
      join listings l
        on l.id = o.listing_id
       and l.deleted_at is null
      join vehicle_models vm on vm.id = l.model_id
      where a.active = true
        and vm.make = f.make_key
        and vm.model = f.model_key
        -- sem países escolhidos = todos. Era o contrário, em silêncio:
        -- l.country = any('{}') nunca é verdade e o alerta nascia morto.
        and (coalesce(array_length(a.countries, 1), 0) = 0 or l.country = any(a.countries))
        and (
          a.criteria->>'maxPrice' is null
          or exists (
            select 1 from import_cost_estimates e
            where e.listing_id = o.listing_id
              and e.total_pt <= (a.criteria->>'maxPrice')::int
          )
        )
      on conflict (alert_id, listing_id) do nothing
      returning alert_id, listing_id
    )
    select
      n.alert_id      as "alertId",
      a.name          as "alertName",
      n.listing_id    as "listingId",
      l.make_raw      as "makeRaw",
      l.model_raw     as "modelRaw",
      l.year          as "year",
      l.country       as "country",
      e.total_pt      as "totalPt",
      e.savings       as "savings",
      u.name          as "ownerName",
      u.email         as "ownerEmail"
    from novos n
    join alerts a on a.id = n.alert_id
    join listings l on l.id = n.listing_id
    join import_cost_estimates e on e.listing_id = n.listing_id
    join member m on m.organization_id = a.stand_id and m.role = 'owner'
    join "user" u on u.id = m.user_id
  `)) as unknown as (Omit<NewMatch, "listingTitle" | "country"> & {
    makeRaw: string | null;
    modelRaw: string | null;
    year: number | null;
    country: string;
  })[];

  if (inserted.length === 0) {
    console.log("match-alerts: 0 matches novos");
    return { matched: 0, emailed: 0, failed: 0 };
  }

  // 2. Um email por match novo. Um envio que falhe NÃO trava o pipeline nem os
  //    outros emails — o evento já está criado, portanto a notificação aparece
  //    no sino de qualquer forma.
  const base = process.env.BETTER_AUTH_URL ?? "https://autoimport.arestadigital.pt";
  let emailed = 0;
  let failed = 0;

  for (const m of inserted) {
    const title = [m.makeRaw, m.modelRaw, m.year].filter(Boolean).join(" ") || "Anúncio";
    const countryName = country(m.country as Parameters<typeof country>[0])?.name ?? m.country;
    const url = `${base}/anuncio/${m.listingId}`;
    try {
      await sendEmail({
        to: m.ownerEmail,
        subject: `Apareceu um ${title} que encaixa no teu alerta`,
        react: AlertMatchEmail({
          name: m.ownerName ?? undefined,
          alertName: m.alertName,
          listingTitle: title,
          country: countryName,
          totalPt: formatEuro(m.totalPt),
          savings: formatEuro(m.savings),
          listingUrl: url,
        }),
        text:
          `O teu alerta "${m.alertName}" encontrou: ${title} (${countryName}). ` +
          `Custo final estimado ${formatEuro(m.totalPt)}, poupa cerca de ${formatEuro(m.savings)}. ` +
          `Ver: ${url}`,
      });
      emailed++;
    } catch (error) {
      failed++;
      console.error(`[match-alerts] falha ao enviar email do alerta ${m.alertId}:`, error);
    }
  }

  console.log(
    `match-alerts: ${inserted.length} matches novos · ${emailed} emails enviados${failed ? ` · ${failed} falharam` : ""}`,
  );
  return { matched: inserted.length, emailed, failed };
}

if (process.argv[1]?.endsWith("match-alerts.ts")) {
  matchAlerts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
