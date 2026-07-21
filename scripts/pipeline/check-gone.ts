/**
 * Verificação leve de oportunidades mortas: um HEAD ao `detail_url` de cada
 * oportunidade ativa (~200 pedidos). SÓ um 404/410 inequívoco ⇒ soft-delete
 * imediato (`deleted_at = now()`) — não esperar pelo sweep de 14 dias, que
 * deixava "compensa" verde sobre um carro que já não existe. Timeouts, rede,
 * 403 e 5xx NÃO apagam (podem ser bloqueio/anti-bot temporário). Alguns sites
 * não suportam HEAD (405/501) → tenta um GET antes de decidir.
 *   pnpm exec tsx scripts/pipeline/check-gone.ts [--limit N]
 * O flag-opportunities a seguir cai as oportunidades cujos listings ficaram
 * apagados (o winners exige deleted_at is null).
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const RATE_MS = 1000;
const TIMEOUT_MS = 10_000;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** "gone" = 404/410; "alive" = existe ou resposta ambígua; "error" = rede/timeout. */
async function probe(url: string): Promise<"gone" | "alive" | "error"> {
  try {
    let res = await fetch(url, {
      method: "HEAD",
      headers: { "user-agent": UA },
      redirect: "follow",
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // Site sem suporte a HEAD → confirma com um GET antes de concluir.
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

export async function checkGone(opts: { limit?: number } = {}) {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");

  const rows = (await db.execute(sql`
    select l.id, l.detail_url
    from opportunities o
    join listings l on l.id = o.listing_id
    where o.deleted_at is null
      and l.deleted_at is null
      and l.detail_url is not null
    ${opts.limit != null ? sql`limit ${opts.limit}` : sql``}
  `)) as unknown as { id: string; detail_url: string }[];

  let mortos = 0;
  let falhas = 0;

  for (const l of rows) {
    const state = await probe(l.detail_url);
    if (state === "gone") {
      await db.execute(sql`update listings set deleted_at = now() where id = ${l.id}`);
      mortos++;
    } else if (state === "error") {
      falhas++;
    }
    await sleep(RATE_MS);
  }

  console.log(
    `check-gone: ${rows.length} verificados · ${mortos} mortos (404/410) · ${falhas} falhas de rede`,
  );
  return { checked: rows.length, mortos, falhas };
}

if (process.argv[1]?.endsWith("check-gone.ts")) {
  const i = process.argv.indexOf("--limit");
  const limit = i >= 0 ? Number(process.argv[i + 1]) : undefined;
  checkGone(Number.isFinite(limit) ? { limit } : {})
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
