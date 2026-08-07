/**
 * Alarme de frescura — falha quando os dados que a app serve ficam velhos.
 *
 * A landing promete "todos os dias recalculamos". Em 3 ago 2026 dizia
 * "atualizado a 27 de julho" e ninguém deu por isso: a recolha vive num daemon
 * na máquina do operador e a publicação é um comando à mão, portanto **basta
 * ninguém ligar o portátil para a produção envelhecer em silêncio**. Este script
 * é o que transforma esse silêncio num vermelho.
 *
 *   pnpm pipeline:frescura                 # contra a base do ambiente
 *   pnpm pipeline:frescura --horas 48      # outro limiar
 *
 * Sai com 1 (falha) se a leitura mais recente for mais velha do que o limiar.
 * É de LEITURA — não chama `assertWritable`, e por isso corre contra a Supabase
 * no workflow sem precisar de `DB_TARGET`.
 */
import postgres from "postgres";
import { appDbUrl } from "../../lib/db-url";

/**
 * 36 horas, não 24. O pipeline corre uma vez por dia: com 24 h, qualquer atraso
 * normal (uma corrida que começa duas horas mais tarde) dava alarme falso — e um
 * alarme que toca sem motivo é um alarme que se aprende a ignorar. 36 h dá uma
 * corrida de folga e ainda apanha "não corre há dois dias".
 */
const HORAS_LIMITE = 36;

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

export async function checkFreshness(url: string, horasLimite: number) {
  const sql = postgres(url, { prepare: false, max: 1, onnotice: () => {} });
  try {
    const [row] = await sql`
      select
        max(last_seen_at) as ultima,
        extract(epoch from (now() - max(last_seen_at))) / 3600 as horas,
        count(*)::int as vivos
      from listings
      where deleted_at is null`;

    const horas = row.horas === null ? null : Number(row.horas);
    return {
      ultima: row.ultima as Date | null,
      horas,
      vivos: row.vivos as number,
      fresco: horas !== null && horas <= horasLimite,
    };
  } finally {
    await sql.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("check-freshness.ts")) {
  for (const file of [".env.production.local", ".env.local"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* ausente: as variáveis vêm do ambiente */
    }
  }

  const url = appDbUrl();
  if (!url) {
    console.error("frescura: sem DATABASE_URL — não há o que medir.");
    process.exit(1);
  }

  const horasLimite = Number(arg("--horas") ?? HORAS_LIMITE);

  checkFreshness(url, horasLimite)
    .then(({ ultima, horas, vivos, fresco }) => {
      if (horas === null) {
        console.error("frescura: a base não tem um único anúncio vivo.");
        process.exit(1);
      }
      const quando = ultima?.toISOString().slice(0, 16).replace("T", " ");
      const resumo = `${vivos.toLocaleString("pt-PT")} anúncios vivos · última leitura ${quando} (há ${horas.toFixed(1)} h)`;
      if (fresco) {
        console.log(`frescura: OK — ${resumo}`);
        process.exit(0);
      }
      // ::error:: para o GitHub Actions destacar isto no resumo da corrida.
      console.error(`::error::Dados velhos: ${resumo}. Limite: ${horasLimite} h.`);
      process.exit(1);
    })
    .catch((err) => {
      console.error("frescura: falha ao ler a base.", err);
      process.exit(1);
    });
}
