/**
 * Enriquecimento NL (P04): veredito oficial dos km pela RDW.
 *
 * Nos Países Baixos a RDW regista as leituras do conta-quilómetros desde 2014 e publica,
 * em dados abertos e grátis, o veredito por matrícula (`tellerstandoordeel`): Logisch,
 * Onlogisch ou Geen oordeel. Os coletores NL guardam a matrícula (`listings.plate`) quando
 * o anúncio a mostra; este script consulta a RDW e grava `listings.km_check`.
 *   pnpm exec tsx scripts/pipeline/enrich-nl-rdw.ts [--limit N]
 * Corre todos os dias no `run-daily` (passo 5, antes do compute-costs, com o limite
 * RDW_DAILY_LIMIT); à mão só para recuperar atrasos.
 *
 * Fonte: https://opendata.rdw.nl/resource/m9d7-ebf2.json (Gekentekende voertuigen; estudo
 * NL §6.1 e §7.2, 10/10/2026). Sem chave; ritmo baixo de propósito.
 *
 * Só corre contra o WAREHOUSE local (a matrícula não sai do warehouse: o publish não a leva).
 * Cache: uma matrícula verificada há menos de RECHECK_DAYS não volta a ser pedida, e na
 * mesma corrida cada matrícula é pedida uma vez.
 */
import { assertWritable, warehouseUrl } from "../../lib/db-url";
import type { KmCheck } from "../../lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

export const RDW_URL = "https://opendata.rdw.nl/resource/m9d7-ebf2.json";
/** DEFAULT: 1 pedido por segundo (a RDW não pede chave; não abusar). */
export const RATE_MS = 1000;
/** DEFAULT: o veredito muda pouco; re-verificar ao fim de 90 dias. */
export const RECHECK_DAYS = 90;

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** `tellerstandoordeel` da RDW → veredito do contrato (P01). Desconhecido → null. */
export function kmVerdictFromRdw(oordeel: unknown): KmCheck["verdict"] | null {
  const s = String(oordeel ?? "")
    .trim()
    .toLowerCase();
  if (s === "logisch") return "coerente";
  if (s === "onlogisch") return "incoerente";
  // "Geen oordeel": dados insuficientes (importado, contador trocado…); "Niet geregistreerd":
  // sem leituras. Nenhum dos dois é um juízo sobre o carro (estudo NL §6.1).
  if (s === "geen oordeel" || s === "niet geregistreerd") return "sem_juizo";
  return null;
}

/** Resposta da RDW (array de veículos) → `km_check`, ou null se a matrícula não existe/sem veredito. */
export function kmCheckFromRdw(rows: unknown, checkedAt: string): KmCheck | null {
  if (!Array.isArray(rows) || rows.length === 0) return null;
  const verdict = kmVerdictFromRdw((rows[0] as Record<string, unknown>)?.tellerstandoordeel);
  return verdict ? { source: "RDW", verdict, checkedAt } : null;
}

/** Matrícula como a RDW a pede: maiúsculas, sem hífens nem espaços. */
export function rdwPlate(plate: string): string {
  return plate.toUpperCase().replace(/[^A-Z0-9]/g, "");
}

type Fetch = (url: string, init?: RequestInit) => Promise<Response>;

export async function enrichNlRdw(
  opts: { limit?: number; fetchImpl?: Fetch; rateMs?: number; now?: () => Date } = {},
) {
  // Guarda: só o warehouse local. Sem WAREHOUSE_URL não corre (nem contra a DATABASE_URL).
  const url = warehouseUrl();
  if (!url) {
    throw new Error(
      "enrich-nl-rdw só corre contra o warehouse local: define WAREHOUSE_URL (ver .env.example).",
    );
  }
  assertWritable(url);
  const fetchImpl = opts.fetchImpl ?? fetch;
  const rateMs = opts.rateMs ?? RATE_MS;
  const now = opts.now ?? (() => new Date());
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");

  // Pendentes: NL com matrícula, ativos, nunca verificados ou verificados há mais de
  // RECHECK_DAYS (no km_check, ou no raw quando a RDW não conhecia a matrícula).
  const pending = (await db.execute(sql`
    select id, plate
    from listings
    where country = 'NL'
      and plate is not null
      and deleted_at is null
      and coalesce((km_check->>'checkedAt')::timestamptz, (raw->>'rdw_checked_at')::timestamptz, 'epoch')
          < now() - make_interval(days => ${RECHECK_DAYS})
    order by last_seen_at desc nulls last
    ${opts.limit != null ? sql`limit ${opts.limit}` : sql``}
  `)) as unknown as { id: string; plate: string }[];

  const cache = new Map<string, KmCheck | null>();
  let gravados = 0;
  let semVeredito = 0;
  let falhas = 0;

  for (const l of pending) {
    const kenteken = rdwPlate(l.plate);
    const checkedAt = now().toISOString();
    let km: KmCheck | null | undefined = cache.get(kenteken);
    if (km === undefined) {
      try {
        const res = await fetchImpl(`${RDW_URL}?kenteken=${encodeURIComponent(kenteken)}`, {
          headers: { accept: "application/json" },
        });
        if (!res.ok) {
          falhas++;
          await sleep(rateMs);
          continue;
        }
        km = kmCheckFromRdw(await res.json(), checkedAt);
        cache.set(kenteken, km);
      } catch {
        falhas++;
        await sleep(rateMs);
        continue;
      }
      await sleep(rateMs);
    }

    if (km) {
      await db.execute(sql`
        update listings set km_check = ${JSON.stringify(km)}::jsonb, updated_at = now()
        where id = ${l.id}
      `);
      gravados++;
    } else {
      // Matrícula desconhecida ou sem veredito: marca no raw para não voltar a pedir todos os dias.
      await db.execute(sql`
        update listings set raw = coalesce(raw, '{}'::jsonb) || jsonb_build_object('rdw_checked_at', ${checkedAt}::text)
        where id = ${l.id}
      `);
      semVeredito++;
    }
  }

  console.log(
    `enrich-nl-rdw: ${pending.length} verificados · ${gravados} com veredito · ${semVeredito} sem veredito/desconhecidos · ${falhas} falhas de fetch`,
  );
  return { checked: pending.length, gravados, semVeredito, falhas };
}

if (process.argv[1]?.endsWith("enrich-nl-rdw.ts")) {
  const i = process.argv.indexOf("--limit");
  const limit = i >= 0 ? Number(process.argv[i + 1]) : undefined;
  enrichNlRdw(Number.isFinite(limit) ? { limit } : {})
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
