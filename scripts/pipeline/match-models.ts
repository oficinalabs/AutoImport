/**
 * Matching determinístico: listings sem model_id → vehicle_models canónicos.
 *   pnpm exec tsx scripts/pipeline/match-models.ts
 * 1. norm_key = make|model|fuel (lib/engine/normalize-vehicle.ts)
 * 2. upsert vehicle_models por norm_key; liga listing.model_id + fuel
 * 3. enriquece o modelo com medianas (cc/CO₂/potência) dos anúncios ligados
 * 4. relatório: taxa de match + top-20 não-mapeados (alimenta o dicionário)
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

export async function matchModels() {
  const { db } = await import("../../db");
  const { inArray, sql } = await import("drizzle-orm");
  const { listings, vehicleModels } = await import("../../db/schema");
  const { normalizeVehicle } = await import("../../lib/engine/normalize-vehicle");

  // Anúncios ativos ainda sem modelo (variant e co2 desambiguam HEV vs PHEV)
  const pending = (await db.execute(sql`
    select id, make_raw, model_raw, fuel_raw, variant, co2
    from listings
    where model_id is null and deleted_at is null
  `)) as unknown as {
    id: string;
    make_raw: string | null;
    model_raw: string | null;
    fuel_raw: string | null;
    variant: string | null;
    co2: number | null;
  }[];

  // norm_key → ids de listings; contagem de não-mapeados por (make, model, fuel) cru
  const byKey = new Map<string, { make: string; model: string; fuel: string; ids: string[] }>();
  const unmapped = new Map<string, number>();
  for (const row of pending) {
    const v = normalizeVehicle(row.make_raw, row.model_raw, row.fuel_raw, row.variant, row.co2);
    if (!v) {
      const k = `${row.make_raw} | ${row.model_raw} | ${row.fuel_raw}`;
      unmapped.set(k, (unmapped.get(k) ?? 0) + 1);
      continue;
    }
    const entry = byKey.get(v.normKey) ?? { make: v.make, model: v.model, fuel: v.fuel, ids: [] };
    entry.ids.push(row.id);
    byKey.set(v.normKey, entry);
  }

  // Upsert dos modelos + ligação dos listings
  let matched = 0;
  for (const [normKey, { make, model, fuel, ids }] of byKey) {
    const rows = await db
      .insert(vehicleModels)
      .values({ make, model, fuel, normKey })
      .onConflictDoUpdate({ target: vehicleModels.normKey, set: { updatedAt: new Date() } })
      .returning({ id: vehicleModels.id });
    const modelId = rows[0].id;
    await db.update(listings).set({ modelId, fuel }).where(inArray(listings.id, ids));
    matched += ids.length;
  }

  // Enriquecimento: medianas dos anúncios ligados quando o modelo não as tem
  await db.execute(sql`
    update vehicle_models vm set
      displacement_cc = coalesce(vm.displacement_cc, agg.cc),
      co2 = coalesce(vm.co2, agg.co2),
      power_hp = coalesce(vm.power_hp, agg.hp),
      updated_at = now()
    from (
      select model_id,
        percentile_cont(0.5) within group (order by displacement_cc)::int as cc,
        percentile_cont(0.5) within group (order by co2)::int as co2,
        percentile_cont(0.5) within group (order by power_hp)::int as hp
      from listings
      where model_id is not null and deleted_at is null
      group by model_id
    ) agg
    where agg.model_id = vm.id
      and (vm.displacement_cc is null or vm.co2 is null or vm.power_hp is null)
  `);

  const total = pending.length;
  const rate = total ? Math.round((matched / total) * 1000) / 10 : 100;
  console.log(`match-models: ${matched}/${total} ligados (${rate}%) · ${byKey.size} modelos`);
  const top = [...unmapped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20);
  if (top.length) {
    console.log("top não-mapeados (make | model | fuel → n):");
    for (const [k, n] of top) console.log(`  ${k} → ${n}`);
  }
  return { total, matched, models: byKey.size };
}

// Executável direto (também importável pelo run-daily)
if (process.argv[1]?.endsWith("match-models.ts")) {
  matchModels()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
