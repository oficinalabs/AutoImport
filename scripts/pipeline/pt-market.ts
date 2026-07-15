/**
 * Observações diárias de preço PT: 1 linha por listing PT ativo com modelo e
 * preço (dedupe por listing+dia). Alimenta estimatePtPrice e o histórico
 * mensal do gráfico.
 *   pnpm exec tsx scripts/pipeline/pt-market.ts
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

export async function collectPtObservations() {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");

  const rows = (await db.execute(sql`
    insert into pt_price_observations (model_id, listing_id, year, km_band, price, source_site)
    select l.model_id, l.id, l.year, floor(l.km / 25000)::int, l.price, l.source_site
    from listings l
    where l.country = 'PT'
      and l.deleted_at is null
      and l.model_id is not null
      and l.price is not null
      and l.km is not null
      and l.year is not null
      and not exists (
        select 1 from pt_price_observations o
        where o.listing_id = l.id and o.observed_at::date = current_date
      )
    returning id
  `)) as unknown as { id: string }[];

  console.log(`pt-market: ${rows.length} observações novas`);
  return { observations: rows.length };
}

if (process.argv[1]?.endsWith("pt-market.ts")) {
  collectPtObservations()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
