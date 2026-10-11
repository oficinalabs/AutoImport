/**
 * Matching de alertas: liga as oportunidades do dia aos alertas ativos dos
 * stands. Por cada match novo cria uma linha em `alert_events` (que alimenta o
 * sino da topbar) e, por cada STAND com matches novos, envia UM email de resumo
 * ao dono (emails/digest.tsx) — no máximo um por dia, com link direto para cada
 * anúncio.
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

/** Máximo de carros listados no email; o resto fica no sino. */
export const DIGEST_MAX_ITEMS = 20;

/** Um carro do resumo de um stand, já com tudo o que o email precisa. */
interface DigestRow {
  listingId: string;
  alertName: string;
  makeRaw: string | null;
  modelRaw: string | null;
  year: number | null;
  country: string;
  totalPt: number;
  savings: number;
  grossMargin: number | null;
}

/** Dia (UTC) do resumo — é a chave `digest:<yyyy-mm-dd>` do trial_email_log. */
export function digestKind(now: Date = new Date()): string {
  return `digest:${now.toISOString().slice(0, 10)}`;
}

export async function matchAlerts({
  send,
}: {
  /** Injetável para os testes contarem envios sem falar com o Resend. */
  send?: typeof import("../../lib/email").sendEmail;
} = {}) {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const { alertModelKeys } = await import("../../lib/alert-criteria");
  const { DigestEmail } = await import("../../emails/digest");
  const sendEmail = send ?? (await import("../../lib/email")).sendEmail;
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
    select a.stand_id as "standId"
    from novos n
    join alerts a on a.id = n.alert_id
  `)) as unknown as { standId: string }[];

  if (inserted.length === 0) {
    console.log("match-alerts: 0 matches novos");
    return { matched: 0, emailed: 0, failed: 0 };
  }

  // Uma linha por evento novo (o que o sino ganhou); os emails são por stand.
  const matched = inserted.length;
  const stands = [...new Set(inserted.map((r) => r.standId))];

  // Sem chave o lib/email.ts só avisa e volta, e o resumo do dia ficava dado
  // como enviado. O sino já tem tudo; o email fica para quando houver chave.
  if (!send && !process.env.RESEND_API_KEY) {
    console.warn(`match-alerts: ${matched} matches novos · RESEND_API_KEY em falta, sem resumos`);
    return { matched, emailed: 0, failed: 0 };
  }

  // 2. Um RESUMO por stand, no máximo um por dia (trial_email_log com
  //    unique(stand_id, kind) e kind = 'digest:<dia>'). Reserva-se a linha ANTES
  //    de enviar: duas corridas no mesmo dia não mandam dois emails. Se o envio
  //    falhar, a reserva sai, e a próxima corrida tenta outra vez.
  //
  //    O resumo leva tudo o que apareceu desde o resumo ANTERIOR, não só o desta
  //    corrida: um match que chegue numa segunda corrida do mesmo dia (já sem
  //    direito a email) entra no de amanhã. Sem resumo anterior, as últimas 24 h
  //    (um stand antigo não recebe o histórico todo de uma vez).
  //
  //    Um envio que falhe NÃO trava os outros stands — os eventos já estão
  //    criados, portanto as notificações aparecem no sino de qualquer forma.
  const base = process.env.BETTER_AUTH_URL ?? "https://autoimport.arestadigital.pt";
  const kind = digestKind();
  let emailed = 0;
  let failed = 0;

  for (const standId of stands) {
    const [owner] = (await db.execute(sql`
      select u.name, u.email
      from member m join "user" u on u.id = m.user_id
      where m.organization_id = ${standId} and m.role = 'owner'
      limit 1
    `)) as unknown as { name: string | null; email: string }[];
    if (!owner) continue;

    const reserved = (await db.execute(sql`
      insert into trial_email_log (stand_id, kind) values (${standId}, ${kind})
      on conflict (stand_id, kind) do nothing
      returning id
    `)) as unknown as { id: string }[];
    if (reserved.length === 0) continue; // já houve resumo hoje

    // Um carro que case com dois alertas do mesmo stand aparece uma vez, e um
    // carro que já foi num resumo anterior (por outro alerta) não volta.
    const rows = (await db.execute(sql`
      with desde as (
        select coalesce(
          (select max(t.sent_at) from trial_email_log t
            where t.stand_id = ${standId} and t.kind like 'digest:%'
              and t.id <> ${reserved[0].id}),  -- o de hoje, acabado de reservar, não conta
          now() - interval '1 day'
        ) as t
      )
      select distinct on (ae.listing_id)
        ae.listing_id   as "listingId",
        a.name          as "alertName",
        l.make_raw      as "makeRaw",
        l.model_raw     as "modelRaw",
        l.year          as "year",
        l.country       as "country",
        e.total_pt      as "totalPt",
        e.savings       as "savings",
        e.gross_margin  as "grossMargin",
        ae.sent_at      as "sentAt"
      from desde, alert_events ae
      join alerts a on a.id = ae.alert_id
      join listings l on l.id = ae.listing_id and l.deleted_at is null
      join import_cost_estimates e on e.listing_id = ae.listing_id
      where a.stand_id = ${standId}
        and ae.sent_at > desde.t
        and not exists (
          select 1 from alert_events ae2
          join alerts a2 on a2.id = ae2.alert_id
          where a2.stand_id = ${standId}
            and ae2.listing_id = ae.listing_id
            and ae2.sent_at <= desde.t
        )
      order by ae.listing_id, ae.sent_at
    `)) as unknown as (DigestRow & { sentAt: Date })[];

    if (rows.length === 0) {
      await db.execute(sql`delete from trial_email_log where id = ${reserved[0].id}`);
      continue;
    }

    // Os mais recentes primeiro; o corte do email fica com os mais novos.
    rows.sort((x, y) => new Date(y.sentAt).getTime() - new Date(x.sentAt).getTime());
    const items = rows.slice(0, DIGEST_MAX_ITEMS).map((m) => {
      const title = [m.makeRaw, m.modelRaw, m.year].filter(Boolean).join(" ") || "Anúncio";
      const countryName = country(m.country as Parameters<typeof country>[0])?.name ?? m.country;
      // A margem bruta (P06) é o número principal quando já existe; até lá, a
      // poupança que a montra ainda mostra.
      const highlight =
        m.grossMargin != null
          ? `margem estimada ${formatEuro(m.grossMargin)}`
          : `poupa cerca de ${formatEuro(m.savings)}`;
      return {
        title,
        country: countryName,
        alertName: m.alertName,
        totalPt: formatEuro(m.totalPt),
        highlight,
        url: `${base}/anuncio/${m.listingId}`,
      };
    });
    const moreCount = rows.length - items.length;
    const subject =
      rows.length === 1
        ? `Apareceu um ${items[0].title} que encaixa nos teus alertas`
        : `${rows.length} carros novos para os teus alertas`;

    try {
      await sendEmail({
        to: owner.email,
        subject,
        react: DigestEmail({
          name: owner.name ?? undefined,
          items,
          moreCount,
          alertsUrl: `${base}/alertas`,
        }),
        text: [
          `Carros novos para os teus alertas (${rows.length}):`,
          ...items.map(
            (i) =>
              `- ${i.title} (${i.country}): custo final ${i.totalPt}, ${i.highlight}. ${i.url}`,
          ),
          ...(moreCount > 0 ? [`E mais ${moreCount} no sino da aplicação.`] : []),
          `Gerir alertas: ${base}/alertas`,
        ].join("\n"),
      });
      emailed++;
    } catch (error) {
      failed++;
      await db.execute(sql`delete from trial_email_log where id = ${reserved[0].id}`);
      console.error(`[match-alerts] falha ao enviar o resumo do stand ${standId}:`, error);
    }
  }

  console.log(
    `match-alerts: ${matched} matches novos · ${emailed} resumos enviados${failed ? ` · ${failed} falharam` : ""}`,
  );
  return { matched, emailed, failed };
}

if (process.argv[1]?.endsWith("match-alerts.ts")) {
  matchAlerts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
