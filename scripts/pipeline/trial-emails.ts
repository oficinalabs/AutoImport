/**
 * Emails do período experimental: três ao longo do mês grátis, ao dono de cada
 * stand que ainda não subscreveu.
 *
 *   pnpm exec tsx scripts/pipeline/trial-emails.ts   (com TSX_TSCONFIG_PATH, ver abaixo)
 *
 * - dia 1: boas-vindas e por onde começar (emails/trial-day1.tsx)
 * - dia 7: alertas — o hábito que segura o stand (emails/trial-day7.tsx)
 * - dia 25: o mês grátis está a acabar, link para subscrever (emails/trial-day25.tsx)
 *
 * "Dia N" conta a partir do registo do stand (organization.created_at), como o
 * fim do trial em lib/queries.ts (getStandQuery). Cada email tem uma JANELA de
 * dias: se o job falhar um dia, o email sai no seguinte; fora da janela já não
 * sai (um stand registado antes deste job existir não recebe as boas-vindas ao
 * dia 20).
 *
 * Quem tem linha em `subscriptions` já passou pela Polar (pagou, ou está a
 * pagar): não recebe nada daqui.
 *
 * Idempotente: `trial_email_log` tem unique(stand_id, kind). A linha é
 * reservada ANTES do envio, portanto duas corridas no mesmo dia (ou em dias
 * seguidos dentro da janela) não mandam o mesmo email duas vezes; se o envio
 * falhar, a reserva sai e a corrida seguinte tenta outra vez.
 *
 * ⚠️ Renderiza JSX: correr com TSX_TSCONFIG_PATH=tsconfig.scripts.json (ver o
 * aviso em match-alerts.ts), como faz o .github/workflows/alerts.yml.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

export type TrialEmailKind = "dia1" | "dia7" | "dia25";

/**
 * Quando sai cada email: no dia `day` do trial (dia 1 = as primeiras 24 h) e
 * nos `windowDays - 1` dias seguintes, se ainda não saiu.
 */
export const TRIAL_EMAILS: { kind: TrialEmailKind; day: number; windowDays: number }[] = [
  { kind: "dia1", day: 1, windowDays: 3 },
  { kind: "dia7", day: 7, windowDays: 3 },
  { kind: "dia25", day: 25, windowDays: 3 },
];

/** O email que toca a um stand no dia `trialDay` do trial, ou null. */
export function trialEmailFor(trialDay: number): TrialEmailKind | null {
  const due = TRIAL_EMAILS.find((e) => trialDay >= e.day && trialDay < e.day + e.windowDays);
  return due?.kind ?? null;
}

const dataPt = new Intl.DateTimeFormat("pt-PT", {
  day: "numeric",
  month: "long",
  timeZone: "UTC",
});

export async function sendTrialEmails({
  send,
}: {
  /** Injetável para os testes contarem envios sem falar com o Resend. */
  send?: typeof import("../../lib/email").sendEmail;
} = {}) {
  // Sem chave o lib/email.ts só avisa e volta — mas a linha do trial_email_log
  // ficava gravada e esse email nunca mais saía. Melhor não fazer nada.
  if (!send && !process.env.RESEND_API_KEY) {
    console.warn("trial-emails: RESEND_API_KEY em falta — nada enviado");
    return { sent: 0, failed: 0 };
  }
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const sendEmail = send ?? (await import("../../lib/email")).sendEmail;
  const { CONDICOES } = await import("../../lib/legal");
  const { formatEuro } = await import("../../lib/format");
  const { TrialDay1Email } = await import("../../emails/trial-day1");
  const { TrialDay7Email } = await import("../../emails/trial-day7");
  const { TrialDay25Email } = await import("../../emails/trial-day25");

  // Stands em trial: sem linha em subscriptions e ainda dentro do mês grátis.
  const stands = (await db.execute(sql`
    select
      o.id                                                   as "standId",
      floor(extract(epoch from now() - o.created_at) / 86400)::int + 1 as "trialDay",
      (o.created_at + make_interval(days => ${CONDICOES.trialDias}))::date::text as "trialEnds",
      u.name                                                 as "ownerName",
      u.email                                                as "ownerEmail",
      (select count(*)::int from alerts a
        where a.stand_id = o.id and a.active = true)         as "alertCount"
    from organization o
    join member m on m.organization_id = o.id and m.role = 'owner'
    join "user" u on u.id = m.user_id
    where not exists (select 1 from subscriptions s where s.stand_id = o.id)
      and o.created_at > now() - make_interval(days => ${CONDICOES.trialDias})
  `)) as unknown as {
    standId: string;
    trialDay: number;
    trialEnds: string;
    ownerName: string | null;
    ownerEmail: string;
    alertCount: number;
  }[];

  const base = process.env.BETTER_AUTH_URL ?? "https://autoimport.arestadigital.pt";
  let sent = 0;
  let failed = 0;

  for (const s of stands) {
    const kind = trialEmailFor(s.trialDay);
    if (!kind) continue;

    const reserved = (await db.execute(sql`
      insert into trial_email_log (stand_id, kind) values (${s.standId}, ${kind})
      on conflict (stand_id, kind) do nothing
      returning id
    `)) as unknown as { id: string }[];
    if (reserved.length === 0) continue; // já saiu

    const name = s.ownerName ?? undefined;
    const trialEnds = dataPt.format(new Date(`${s.trialEnds}T12:00:00Z`));
    const price = formatEuro(CONDICOES.precoMensalEuros);
    // TODO(P10): quando houver checkout Polar, apontar para ele; até lá, a
    // página do stand é onde a subscrição se vê e se gere.
    const manageUrl = `${base}/stand`;

    const email =
      kind === "dia1"
        ? {
            subject: "Bem-vindo ao AutoImport: por onde começar",
            react: TrialDay1Email({ name, appUrl: base, trialEnds }),
            text: `O teu stand tem acesso completo até ${trialEnds}, sem cartão. Pesquisa, abre a ficha para veres a conta linha a linha e cria alertas para os modelos que vendes. Começar: ${base}/pesquisar`,
          }
        : kind === "dia7"
          ? {
              subject:
                s.alertCount === 0
                  ? "Uma semana de AutoImport: já tens alertas?"
                  : "Uma semana de AutoImport: os teus alertas",
              react: TrialDay7Email({ name, appUrl: base, alertCount: s.alertCount }),
              text: `Com alertas ativos recebes um resumo por email quando aparecer um carro que compense importar. Alertas: ${base}/alertas`,
            }
          : {
              subject: `O teu mês grátis acaba a ${trialEnds}`,
              react: TrialDay25Email({
                name,
                trialEnds,
                price,
                manageUrl,
                termsUrl: `${base}/legal/subscricao`,
              }),
              text:
                `O período experimental do teu stand acaba a ${trialEnds}. Para continuar: ` +
                `${price} por mês + IVA, para toda a equipa. Gerir subscrição: ${manageUrl}`,
            };

    try {
      await sendEmail({ to: s.ownerEmail, ...email });
      sent++;
    } catch (error) {
      failed++;
      await db.execute(sql`delete from trial_email_log where id = ${reserved[0].id}`);
      console.error(`[trial-emails] falha ao enviar ${kind} ao stand ${s.standId}:`, error);
    }
  }

  console.log(`trial-emails: ${sent} enviados${failed ? ` · ${failed} falharam` : ""}`);
  return { sent, failed };
}

if (process.argv[1]?.endsWith("trial-emails.ts")) {
  sendTrialEmails()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
