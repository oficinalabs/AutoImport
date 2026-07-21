/**
 * Estimativa do preço de mercado PT para um modelo canónico.
 * Amostra primária: mesmo model_id, year±1, km_band±1, observações dos
 * últimos 60 dias (a mais recente por CARRO físico) → MEDIANA (robusta a
 * outliers), com mínimo de 5 anúncios e dispersão mínima de preços/vendedores.
 * Fallback `alargada`: alarga SÓ a banda de km para ±2 (o ANO fica ±1, como a
 * primária — esticar o ano puxa gerações/facelifts vizinhos), mínimo 3, com as
 * MESMAS guardas de dispersão mais um teto de spread relativo (a amostra tem de
 * ser coerente, não um par de outliers). Sem amostra que passe as guardas →
 * null (o anúncio não recebe veredito — nunca adivinhar, nunca comparar fraco).
 */
import { sql } from "drizzle-orm";
import type { db as Db } from "../../db";
import { carIdentitySql } from "./car-identity";

export type PtConfidence = "normal" | "alargada";

export interface PtEstimate {
  estimatedPrice: number;
  sampleSize: number;
  confidence: PtConfidence;
}

/**
 * Janela de geração do carro estrangeiro (derivada da versão confirmada do
 * catálogo). Quando presente, as observações PT ficam confinadas à interseção
 * de `year±spread` com [start, end] — impede que a mediana de um anúncio da
 * geração nova seja contaminada por carros PT da geração velha de anos vizinhos
 * (fronteira de geração). `end` null = geração aberta (sem limite superior).
 */
export interface GenWindow {
  start: number;
  end: number | null;
}

const MIN_SAMPLE_NORMAL = 5;
const MIN_SAMPLE_WIDE = 3;
const WINDOW_DAYS = 60;
// Guarda anti-frota (auditoria): amostras de um único stand a preço de tabela
// (ex.: 6× "La Prima" santogal a 23.490 €) não são mercado — TODA a estimativa
// (normal e alargada) exige dispersão mínima de preços e de vendedores.
const MIN_DISTINCT_PRICES = 3;
const MIN_DISTINCT_SELLERS = 2;
// Teto de spread relativo (max−min)/mediana da amostra ALARGADA. Calibração
// read-only na produção (21 jul, 1970 estimativas): das amostras que o novo
// fallback recupera, o spread relativo tem p50 0,22 · p75 0,29 · p95 0,46 ·
// máx 0,85. Cortar em 0,30 (≈p75) mata o quartil patológico — o típico "n=3,
// 57,5k–75k" que não é um preço de mercado, é um intervalo. Sobrevivência por
// teto medida: 0,25→427 · 0,30→550 · 0,35→617. Escolhido 0,30 (honestidade >
// cobertura: as ~550 que passam são amostras coerentes).
const MAX_WIDE_SPREAD = 0.3;

async function sample(
  db: typeof Db,
  modelId: string,
  year: number,
  kmBand: number,
  yearSpread: number,
  kmSpread: number,
  powerHp?: number | null,
  genWindow?: GenWindow,
  excludeMids?: string[],
): Promise<{
  median: number;
  n: number;
  distinctPrices: number;
  distinctSellers: number;
  min: number;
  max: number;
} | null> {
  // Interseção da janela year±yearSpread com a janela de geração (quando
  // presente): o guard NUNCA relaxa (só aperta) — mantém-se mesmo no fallback.
  // Interseção vazia (lo>hi) → o `between` não devolve nada.
  const yearLo = genWindow ? Math.max(year - yearSpread, genWindow.start) : year - yearSpread;
  const yearHi =
    genWindow?.end != null ? Math.min(year + yearSpread, genWindow.end) : year + yearSpread;
  // Matching ESTRITO por designação (regra do produto: um veículo só compara
  // com o mesmo modelo): a potência é a assinatura objetiva da designação
  // (840i 333cv ≠ M850i 530cv; xDrive40 326 ≠ xDrive45 408; Golf 1.5 150 ≠
  // GTI 245). Tolerância apertada ±10% OU ±15cv (facelifts/afinações da MESMA
  // designação) e observações SEM potência conhecida ficam FORA — sem dado
  // não há prova de que é o mesmo modelo (nunca adivinhar).
  const powerFilter =
    powerHp != null
      ? sql`and l.power_hp is not null and abs(l.power_hp - ${powerHp}) <= ${Math.max(Math.round(powerHp * 0.1), 15)}`
      : sql``;
  // Exclusão por derivado/corpo (auditoria): uma observação PT cujo carro está
  // PROVADO ser de OUTRO derivado (um Gran Coupé quando o estrangeiro é Gran
  // Tourer, mais caro → margem falsa) sai da amostra. O mid provado vem da versão
  // exata (uv.mid) ou dos factos de designação (designation_facts->>'mid');
  // observação SEM match (mid null) FICA — nunca adivinhar, só excluir o que está
  // provado diferente. Como a genWindow, NUNCA relaxa (só aperta).
  const midExclusion = excludeMids?.length
    ? sql`and (coalesce(uv.mid, l.designation_facts->>'mid') is null
              or not (coalesce(uv.mid, l.designation_facts->>'mid') = any(${`{${excludeMids.join(",")}}`}::text[])))`
    : sql``;
  // Dedupe por CARRO físico, não por anúncio (ver lib/engine/car-identity.ts):
  // grupos como Caetano/CarPlus listam o mesmo stock em vários sites — contar
  // 2× inflaciona a amostra. min/max saem para o teto de spread do fallback.
  const rows = (await db.execute(sql`
    select percentile_cont(0.5) within group (order by price)::int as median,
           count(*)::int as n,
           count(distinct price)::int as distinct_prices,
           count(distinct seller_key)::int as distinct_sellers,
           min(price)::int as min_price,
           max(price)::int as max_price
    from (
      select distinct on (identity) price, seller_key
      from (
        select ${carIdentitySql("l")} as identity,
               coalesce(l.seller_name, l.id::text) as seller_key,
               o.price, o.observed_at
        from pt_price_observations o
        join listings l on l.id = o.listing_id
        left join us_versions uv on uv.version_id = l.us_version_id
        where o.model_id = ${modelId}
          and o.year between ${yearLo} and ${yearHi}
          and o.km_band between ${kmBand - kmSpread} and ${kmBand + kmSpread}
          and o.observed_at > now() - make_interval(days => ${WINDOW_DAYS})
          ${powerFilter}
          ${midExclusion}
      ) obs
      order by identity, observed_at desc
    ) latest
  `)) as unknown as {
    median: number | null;
    n: number;
    distinct_prices: number;
    distinct_sellers: number;
    min_price: number;
    max_price: number;
  }[];
  const row = rows[0];
  return row?.median != null
    ? {
        median: row.median,
        n: row.n,
        distinctPrices: row.distinct_prices,
        distinctSellers: row.distinct_sellers,
        min: row.min_price,
        max: row.max_price,
      }
    : null;
}

export async function estimatePtPrice(
  db: typeof Db,
  modelId: string,
  year: number,
  kmBand: number,
  powerHp?: number | null,
  genWindow?: GenWindow,
  excludeMids?: string[],
): Promise<PtEstimate | null> {
  const primary = await sample(db, modelId, year, kmBand, 1, 1, powerHp, genWindow, excludeMids);
  if (
    primary &&
    primary.n >= MIN_SAMPLE_NORMAL &&
    primary.distinctPrices >= MIN_DISTINCT_PRICES &&
    primary.distinctSellers >= MIN_DISTINCT_SELLERS
  ) {
    return { estimatedPrice: primary.median, sampleSize: primary.n, confidence: "normal" };
  }
  // Fallback alargado: ano ±1 (como a primária), só a banda de km alarga para ±2.
  // As guardas de dispersão aplicam-se na mesma, mais o teto de spread relativo.
  const wide = await sample(db, modelId, year, kmBand, 1, 2, powerHp, genWindow, excludeMids);
  if (
    wide &&
    wide.n >= MIN_SAMPLE_WIDE &&
    wide.distinctPrices >= MIN_DISTINCT_PRICES &&
    wide.distinctSellers >= MIN_DISTINCT_SELLERS &&
    wide.median > 0 &&
    (wide.max - wide.min) / wide.median <= MAX_WIDE_SPREAD
  ) {
    return { estimatedPrice: wide.median, sampleSize: wide.n, confidence: "alargada" };
  }
  return null;
}

/** Histórico mensal (médias) para o gráfico PtMarket.history — últimos 6 meses. */
export async function ptPriceHistory(
  db: typeof Db,
  modelId: string,
): Promise<{ month: string; price: number }[]> {
  const rows = (await db.execute(sql`
    select to_char(date_trunc('month', observed_at), 'YYYY-MM') as month,
           round(avg(price))::int as price
    from pt_price_observations
    where model_id = ${modelId}
      and observed_at > now() - interval '6 months'
    group by 1
    order by 1
  `)) as unknown as { month: string; price: number }[];
  return rows;
}
