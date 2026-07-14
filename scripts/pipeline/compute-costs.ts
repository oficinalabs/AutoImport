/**
 * Cálculo do negócio por anúncio estrangeiro: custo total de importação
 * (cost engine) + preço PT estimado (pt-market) → poupança e veredito →
 * upsert em import_cost_estimates.
 *   pnpm exec tsx scripts/pipeline/compute-costs.ts
 * Recomputa quando: sem estimativa, anúncio atualizado depois do cálculo.
 * Sem CO₂/cilindrada (não-elétricos) ou sem amostra PT → sem estimativa
 * (nunca adivinhar, nunca mostrar veredito fraco).
 */
import type { CountryCode } from "../../lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const FOREIGN: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
const ISV_YEAR = 2026;

export async function computeCosts() {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const { computeCostBreakdown } = await import("../../lib/cost-engine");
  const { estimatePtPrice } = await import("../../lib/engine/pt-market");
  const { loadTaxTables } = await import("../../lib/engine/tax-tables");
  const { kmBand } = await import("../../lib/engine/normalize-vehicle");
  const { verdictFromSavings } = await import("../../lib/verdict");

  const tables = await loadTaxTables(db, ISV_YEAR);

  const pending = (await db.execute(sql`
    select l.id, l.price, l.year, l.km, l.fuel, l.country, l.first_registration,
           coalesce(l.displacement_cc, vm.displacement_cc) as cc,
           coalesce(l.co2, vm.co2) as co2,
           l.model_id
    from listings l
    join vehicle_models vm on vm.id = l.model_id
    left join import_cost_estimates e on e.listing_id = l.id
    where l.country = any(${`{${FOREIGN.join(",")}}`}::text[])
      and l.deleted_at is null
      and l.price is not null
      and l.year is not null
      and l.km is not null
      and l.fuel is not null
      and (e.id is null or l.updated_at > e.computed_at)
  `)) as unknown as {
    id: string;
    price: number;
    year: number;
    km: number;
    fuel: string;
    country: string;
    first_registration: string | null;
    cc: number | null;
    co2: number | null;
    model_id: string;
  }[];

  let computed = 0;
  let semDados = 0;
  let semAmostra = 0;
  const verdicts: Record<string, number> = {};

  for (const l of pending) {
    const isEv = l.fuel === "elétrico";
    if (!isEv && (l.cc == null || l.co2 == null)) {
      semDados++;
      continue;
    }

    const pt = await estimatePtPrice(db, l.model_id, l.year, kmBand(l.km));
    if (!pt) {
      semAmostra++;
      continue;
    }

    // fallback da 1.ª matrícula: 1 de julho do ano do anúncio
    const firstReg = l.first_registration
      ? new Date(l.first_registration)
      : new Date(`${l.year}-07-01`);

    const { breakdown, isvDetail } = computeCostBreakdown(
      {
        originPrice: l.price,
        fuel: l.fuel as never,
        displacementCc: l.cc ?? undefined,
        co2: l.co2 ?? undefined,
        firstRegistration: firstReg,
        country: l.country as CountryCode,
      },
      tables,
    );

    const savings = pt.estimatedPrice - breakdown.totalPt;
    const savingsPct = Math.round((savings / pt.estimatedPrice) * 1000) / 10;
    const verdict = verdictFromSavings(savingsPct);
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;

    const inputs = {
      cc: l.cc,
      co2: l.co2,
      fuel: l.fuel,
      firstRegistration: firstReg.toISOString().slice(0, 10),
      firstRegistrationAssumed: !l.first_registration,
      isv: isvDetail,
    };

    await db.execute(sql`
      insert into import_cost_estimates (
        listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
        pt_estimated_price, pt_sample_size, pt_confidence,
        savings, savings_pct, verdict, isv_table_year, inputs, computed_at
      ) values (
        ${l.id}, ${breakdown.originPrice}, ${breakdown.transport}, ${breakdown.isv},
        ${breakdown.iuc}, ${breakdown.legalization}, ${breakdown.totalPt},
        ${pt.estimatedPrice}, ${pt.sampleSize}, ${pt.confidence},
        ${savings}, ${savingsPct}, ${verdict}, ${ISV_YEAR},
        ${JSON.stringify(inputs)}::jsonb, now()
      )
      on conflict (listing_id) do update set
        origin_price = excluded.origin_price,
        transport = excluded.transport,
        isv = excluded.isv,
        iuc = excluded.iuc,
        legalization = excluded.legalization,
        total_pt = excluded.total_pt,
        pt_estimated_price = excluded.pt_estimated_price,
        pt_sample_size = excluded.pt_sample_size,
        pt_confidence = excluded.pt_confidence,
        savings = excluded.savings,
        savings_pct = excluded.savings_pct,
        verdict = excluded.verdict,
        isv_table_year = excluded.isv_table_year,
        inputs = excluded.inputs,
        computed_at = now()
    `);
    computed++;
  }

  console.log(
    `compute-costs: ${computed}/${pending.length} calculados · sem cc/CO₂ ${semDados} · sem amostra PT ${semAmostra} · vereditos ${JSON.stringify(verdicts)}`,
  );
  return { pending: pending.length, computed, semDados, semAmostra, verdicts };
}

if (process.argv[1]?.endsWith("compute-costs.ts")) {
  computeCosts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
