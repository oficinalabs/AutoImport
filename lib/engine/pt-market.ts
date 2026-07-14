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

const MIN_SAMPLE_NORMAL = 5;
const MIN_SAMPLE_WIDE = 3;
const WINDOW_DAYS = 60;

async function sample(
  db: typeof Db,
  modelId: string,
  year: number,
  kmBand: number,
  spread: number,
): Promise<{ median: number; n: number } | null> {
  // Dedupe por CARRO físico, não por anúncio: grupos como Caetano/CarPlus
  // listam o mesmo stock (mesmo VIN) em vários sites — contar 2× inflaciona
  // a amostra. Identidade = VIN; sem VIN, preço+ano+km (o mesmo carro
  // cross-listado partilha os três; carros distintos raramente).
  const rows = (await db.execute(sql`
    select percentile_cont(0.5) within group (order by price)::int as median,
           count(*)::int as n
    from (
      select distinct on (identity) price
      from (
        select coalesce(l.vin, l.price::text || ':' || coalesce(l.year, 0)::text || ':' || coalesce(l.km, 0)::text) as identity,
               o.price, o.observed_at
        from pt_price_observations o
        join listings l on l.id = o.listing_id
        where o.model_id = ${modelId}
          and o.year between ${year - spread} and ${year + spread}
          and o.km_band between ${kmBand - spread} and ${kmBand + spread}
          and o.observed_at > now() - make_interval(days => ${WINDOW_DAYS})
      ) obs
      order by identity, observed_at desc
    ) latest
  `)) as unknown as { median: number | null; n: number }[];
  const row = rows[0];
  return row?.median != null ? { median: row.median, n: row.n } : null;
}

export async function estimatePtPrice(
  db: typeof Db,
  modelId: string,
  year: number,
  kmBand: number,
): Promise<PtEstimate | null> {
  const primary = await sample(db, modelId, year, kmBand, 1);
  if (primary && primary.n >= MIN_SAMPLE_NORMAL) {
    return { estimatedPrice: primary.median, sampleSize: primary.n, confidence: "normal" };
  }
  const wide = await sample(db, modelId, year, kmBand, 2);
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
