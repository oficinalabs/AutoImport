/**
 * Estimativa do preço de mercado PT para um modelo canónico.
 * Amostra primária: mesmo model_id, year±1, km_band±1, observações dos
 * últimos 60 dias (a mais recente por listing) → MEDIANA (robusta a
 * outliers), com mínimo de 5 anúncios. Fallback: year±2/band±2, mínimo 3,
 * marcado `alargada`. Sem amostra suficiente → null (o anúncio não recebe
 * veredito — nunca mostrar comparação fraca).
 */
import { sql } from "drizzle-orm";
import type { db as Db } from "../../db";

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
// (ex.: 6× "La Prima" santogal a 23.490 €) não são mercado — a confiança
// 'normal' exige dispersão mínima de preços e de vendedores.
const MIN_DISTINCT_PRICES = 3;
const MIN_DISTINCT_SELLERS = 2;

async function sample(
  db: typeof Db,
  modelId: string,
  year: number,
  kmBand: number,
  spread: number,
  powerHp?: number | null,
  genWindow?: GenWindow,
): Promise<{ median: number; n: number; distinctPrices: number; distinctSellers: number } | null> {
  // Interseção da janela year±spread com a janela de geração (quando presente):
  // o guard NUNCA relaxa (só aperta) — o fallback alargado (spread=2) continua
  // confinado à geração. Interseção vazia (lo>hi) → o `between` não devolve nada.
  const yearLo = genWindow ? Math.max(year - spread, genWindow.start) : year - spread;
  const yearHi = genWindow?.end != null ? Math.min(year + spread, genWindow.end) : year + spread;
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
  // Dedupe por CARRO físico, não por anúncio: grupos como Caetano/CarPlus
  // listam o mesmo stock (mesmo VIN) em vários sites — contar 2× inflaciona
  // a amostra. Identidade = VIN; sem VIN, preço+ano+km (o mesmo carro
  // cross-listado partilha os três; carros distintos raramente).
  const rows = (await db.execute(sql`
    select percentile_cont(0.5) within group (order by price)::int as median,
           count(*)::int as n,
           count(distinct price)::int as distinct_prices,
           count(distinct seller_key)::int as distinct_sellers
    from (
      select distinct on (identity) price, seller_key
      from (
        select coalesce(l.vin, l.price::text || ':' || coalesce(l.year, 0)::text || ':' || coalesce(l.km, 0)::text) as identity,
               coalesce(l.seller_name, l.id::text) as seller_key,
               o.price, o.observed_at
        from pt_price_observations o
        join listings l on l.id = o.listing_id
        where o.model_id = ${modelId}
          and o.year between ${yearLo} and ${yearHi}
          and o.km_band between ${kmBand - spread} and ${kmBand + spread}
          and o.observed_at > now() - make_interval(days => ${WINDOW_DAYS})
          ${powerFilter}
      ) obs
      order by identity, observed_at desc
    ) latest
  `)) as unknown as {
    median: number | null;
    n: number;
    distinct_prices: number;
    distinct_sellers: number;
  }[];
  const row = rows[0];
  return row?.median != null
    ? {
        median: row.median,
        n: row.n,
        distinctPrices: row.distinct_prices,
        distinctSellers: row.distinct_sellers,
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
): Promise<PtEstimate | null> {
  const primary = await sample(db, modelId, year, kmBand, 1, powerHp, genWindow);
  if (
    primary &&
    primary.n >= MIN_SAMPLE_NORMAL &&
    primary.distinctPrices >= MIN_DISTINCT_PRICES &&
    primary.distinctSellers >= MIN_DISTINCT_SELLERS
  ) {
    return { estimatedPrice: primary.median, sampleSize: primary.n, confidence: "normal" };
  }
  const wide = await sample(db, modelId, year, kmBand, 2, powerHp, genWindow);
  if (wide && wide.n >= MIN_SAMPLE_WIDE) {
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
