/**
 * prune-stale — remove anúncios que desapareceram do feed E cujo URL já não existe.
 *
 * Regra (decisão do dono do produto, 2026-07-22): um anúncio que deixou de aparecer nas
 * recolhas recentes (`last_seen_at` antigo) é candidato a VENDIDO. Antes de apagar, faz-se um
 * check ao `detail_url` guardado (HEAD, fallback GET — a mesma sonda do check-gone): SÓ um
 * 404/410 inequívoco confirma que o carro já não existe → HARD delete. Timeout/rede/403/5xx
 * NÃO apagam (podem ser bloqueio/anti-bot temporário).
 *
 * ⚠️ HARD delete é IRREVERSÍVEL. Por isso o default é DRY-RUN (só conta e mostra). `--apply`
 * apaga a sério. Futuramente, quando o espaço da BD permitir, trocar por soft delete
 * (deleted_at) para manter o histórico — ver a flag SOFT abaixo.
 *
 *   pnpm exec tsx scripts/pipeline/prune-stale.ts                 # DRY-RUN (não apaga)
 *   pnpm exec tsx scripts/pipeline/prune-stale.ts --apply         # apaga a sério (hard)
 *   pnpm exec tsx scripts/pipeline/prune-stale.ts --apply --soft  # marca deleted_at (não apaga)
 *   flags: --stale-days N (default 5) · --limit N · --rate-ms N (default 1000)
 */
import { assertWritable, dbUrl } from "../../lib/db-url";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
const TIMEOUT_MS = 10_000;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}
function opt(name: string, fallback: number): number {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? Number(process.argv[i + 1]) : fallback;
}

/** "gone" = 404/410 · "alive" = existe ou ambíguo · "error" = rede/timeout (não apaga). */
async function probe(url: string): Promise<"gone" | "alive" | "error"> {
  try {
    let res = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: "GET",
        headers: { "user-agent": UA },
        redirect: "follow",
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    }
    return res.status === 404 || res.status === 410 ? "gone" : "alive";
  } catch {
    return "error";
  }
}

export async function pruneStale(
  opts: {
    staleDays?: number;
    limit?: number;
    rateMs?: number;
    apply?: boolean;
    soft?: boolean;
  } = {},
) {
  const staleDays = opts.staleDays ?? 5;
  const rateMs = opts.rateMs ?? 1000;
  const apply = opts.apply ?? false;
  const soft = opts.soft ?? false;
  assertWritable(dbUrl());
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");

  const rows = (await db.execute(sql`
    select id, detail_url from listings
    where deleted_at is null
      and detail_url is not null
      and last_seen_at < now() - make_interval(days => ${staleDays})
    ${opts.limit != null ? sql`limit ${opts.limit}` : sql``}
  `)) as unknown as { id: string; detail_url: string }[];

  console.log(
    `prune-stale: ${rows.length} candidatos (sem sinal há ${staleDays}+ dias) · modo=${apply ? (soft ? "SOFT delete" : "HARD delete") : "DRY-RUN"}`,
  );

  let gone = 0;
  let alive = 0;
  let errors = 0;
  for (const l of rows) {
    const state = await probe(l.detail_url);
    if (state === "gone") {
      gone++;
      if (apply) {
        if (soft) {
          await db.execute(sql`update listings set deleted_at = now() where id = ${l.id}`);
        } else {
          await db.execute(sql`delete from listings where id = ${l.id}`);
        }
      }
    } else if (state === "alive") {
      alive++;
    } else {
      errors++;
    }
    await sleep(rateMs);
  }

  const verbo = apply ? (soft ? "marcados deleted_at" : "APAGADOS") : "seriam removidos";
  console.log(
    `prune-stale: ${gone} ${verbo} (404/410) · ${alive} ainda vivos (mantidos) · ${errors} falhas de rede (mantidos)`,
  );
  return { candidates: rows.length, gone, alive, errors, applied: apply };
}

if (process.argv[1]?.endsWith("prune-stale.ts")) {
  pruneStale({
    staleDays: opt("stale-days", 5),
    limit: process.argv.includes("--limit") ? opt("limit", 0) : undefined,
    rateMs: opt("rate-ms", 1000),
    apply: flag("apply"),
    soft: flag("soft"),
  })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
