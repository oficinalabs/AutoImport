/**
 * Marca oportunidades globais (stand_id null): estimativas com veredito
 * "compensa" e confiança normal. Soft-delete das que deixaram de compensar
 * ou cujo anúncio desapareceu; reaparecer reativa.
 *   pnpm exec tsx scripts/pipeline/flag-opportunities.ts
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

export async function flagOpportunities() {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");

  const flagged = (await db.execute(sql`
    insert into opportunities (listing_id, savings, savings_pct, flagged_at)
    select e.listing_id, e.savings, e.savings_pct, now()
    from import_cost_estimates e
    join listings l on l.id = e.listing_id
    where e.verdict = 'compensa'
      and e.pt_confidence = 'normal'
      and l.deleted_at is null
      and l.is_damaged is not true
    on conflict (listing_id) do update set
      savings = excluded.savings,
      savings_pct = excluded.savings_pct,
      deleted_at = null
    returning id
  `)) as unknown as { id: string }[];

  const dropped = (await db.execute(sql`
    update opportunities o set deleted_at = now()
    where o.deleted_at is null
      and not exists (
        select 1
        from import_cost_estimates e
        join listings l on l.id = e.listing_id
        where e.listing_id = o.listing_id
          and e.verdict = 'compensa'
          and e.pt_confidence = 'normal'
          and l.deleted_at is null
          and l.is_damaged is not true
      )
    returning o.id
  `)) as unknown as { id: string }[];

  console.log(`flag-opportunities: ${flagged.length} ativas · ${dropped.length} caídas`);
  return { flagged: flagged.length, dropped: dropped.length };
}

if (process.argv[1]?.endsWith("flag-opportunities.ts")) {
  flagOpportunities()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
