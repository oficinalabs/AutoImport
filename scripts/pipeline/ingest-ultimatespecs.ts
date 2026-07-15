/**
 * Ingestão por replay do catálogo ultimatespecs (NDJSON do coletor) → us_models/us_versions.
 *   pnpm exec tsx scripts/pipeline/ingest-ultimatespecs.ts [--dir tools/collector/out] [--file <x.ndjson>]
 * Idempotente: upsert nas chaves naturais do site (mid, version_id) — re-correr não duplica.
 * Registos sem `deep` (recolha só de resumos) não apagam campos deep de ingestões anteriores.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { VersionRecord } from "../../tools/collector/ultimatespecs/schema";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis vêm do ambiente */
}

function parseArgs() {
  const args = process.argv.slice(2);
  const get = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  return { dir: get("--dir") ?? "tools/collector/out", file: get("--file") };
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Colunas integer na BD; o site tem valores decimais (ex. binário "39.2 Nm") → arredondar.
const int = (v: number | null | undefined): number | null =>
  v == null || !Number.isFinite(v) ? null : Math.round(v);

/** URL da página de modelo, reconstruído do URL da versão (o NDJSON não o traz). */
function modelUrlOf(r: VersionRecord): string {
  const makeSeg = r.url.split("/car-specs/")[1]?.split("/")[0] ?? r.make.replace(/ /g, "-");
  return `https://www.ultimatespecs.com/car-specs/${makeSeg}/${r.mid}/${r.modelSlug}`;
}

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL em falta — definir no .env.local");
  }
  const { db } = await import("../../db");
  const { usModels, usVersions } = await import("../../db/schema");
  const { sql } = await import("drizzle-orm");

  const { dir, file } = parseArgs();
  const files = file
    ? [file]
    : readdirSync(dir)
        .filter((f) => /^ultimatespecs-\d{4}.*\.ndjson$/.test(f))
        .map((f) => join(dir, f));
  if (!files.length) {
    console.log(`sem NDJSON ultimatespecs em ${dir} — nada a ingerir`);
    return;
  }

  // Último registo por version_id ganha (replay de vários ficheiros por ordem de nome).
  const byId = new Map<string, VersionRecord>();
  let semMid = 0;
  for (const f of files.sort()) {
    for (const line of readFileSync(f, "utf8").split("\n")) {
      if (!line.trim()) continue;
      const r = JSON.parse(line) as VersionRecord;
      if (!r.mid) {
        semMid++; // NDJSON antigo, anterior ao campo mid — recolher de novo
        continue;
      }
      byId.set(r.versionId, r);
    }
  }
  const records = [...byId.values()];
  console.log(
    `${files.length} ficheiro(s) → ${records.length} versões únicas` +
      `${semMid ? ` (ignoradas ${semMid} sem mid — NDJSON antigo)` : ""}`,
  );
  if (!records.length) return;

  // ── us_models: 1 linha por mid (o registo mais recente do modelo ganha) ──
  const models = new Map<string, VersionRecord>();
  for (const r of records) models.set(r.mid, r);
  for (const batch of chunk([...models.values()], 500)) {
    await db
      .insert(usModels)
      .values(
        batch.map((r) => ({
          mid: r.mid,
          make: r.make,
          model: r.model,
          slug: r.modelSlug,
          modelYear: r.modelYear,
          url: modelUrlOf(r),
          imageUrls: r.modelImages ?? [],
          collectedAt: new Date(r.collectedAt),
        })),
      )
      .onConflictDoUpdate({
        target: usModels.mid,
        set: {
          make: sql`excluded.make`,
          model: sql`excluded.model`,
          slug: sql`excluded.slug`,
          modelYear: sql`excluded.model_year`,
          url: sql`excluded.url`,
          imageUrls: sql`excluded.image_urls`,
          collectedAt: sql`excluded.collected_at`,
          updatedAt: new Date(),
        },
      });
  }
  console.log(`us_models: ${models.size} upserts`);

  // ── us_versions: resumos e deep em lotes separados (o upsert de um resumo
  // não pode apagar a ficha deep de uma ingestão anterior) ──
  const summaryOf = (r: VersionRecord) => ({
    versionId: r.versionId,
    mid: r.mid,
    name: r.name,
    url: r.url,
    fuelSection: r.fuelSection,
    year: int(r.year),
    powerHp: int(r.powerHp),
    powerKw: r.powerKw,
    displacementCc: int(r.displacementCc),
    collectedAt: new Date(r.collectedAt),
  });
  const summarySet = {
    mid: sql`excluded.mid`,
    name: sql`excluded.name`,
    url: sql`excluded.url`,
    fuelSection: sql`excluded.fuel_section`,
    year: sql`excluded.year`,
    powerHp: sql`excluded.power_hp`,
    powerKw: sql`excluded.power_kw`,
    displacementCc: sql`excluded.displacement_cc`,
    collectedAt: sql`excluded.collected_at`,
    updatedAt: new Date(),
  };

  const soResumo = records.filter((r) => !r.deep);
  const comDeep = records.filter((r) => r.deep);

  for (const batch of chunk(soResumo, 500)) {
    await db
      .insert(usVersions)
      .values(batch.map(summaryOf))
      .onConflictDoUpdate({ target: usVersions.versionId, set: summarySet });
  }
  for (const batch of chunk(comDeep, 200)) {
    await db
      .insert(usVersions)
      .values(
        batch.map((r) => ({
          ...summaryOf(r),
          generation: r.deep?.generation,
          body: r.deep?.body,
          doors: int(r.deep?.doors),
          seats: int(r.deep?.seats),
          fuel: r.deep?.fuel,
          engineCode: r.deep?.engineCode,
          cylinders: r.deep?.cylinders,
          torqueNm: int(r.deep?.torqueNm),
          drivetrain: r.deep?.drivetrain,
          gearbox: r.deep?.gearbox,
          co2Wltp: int(r.deep?.co2Wltp),
          co2Nedc: int(r.deep?.co2Nedc),
          emissionStandard: r.deep?.emissionStandard,
          curbWeightKg: int(r.deep?.curbWeightKg),
          imageUrl: r.deep?.imageUrl,
          specs: r.deep?.specs,
        })),
      )
      .onConflictDoUpdate({
        target: usVersions.versionId,
        set: {
          ...summarySet,
          generation: sql`excluded.generation`,
          body: sql`excluded.body`,
          doors: sql`excluded.doors`,
          seats: sql`excluded.seats`,
          fuel: sql`excluded.fuel`,
          engineCode: sql`excluded.engine_code`,
          cylinders: sql`excluded.cylinders`,
          torqueNm: sql`excluded.torque_nm`,
          drivetrain: sql`excluded.drivetrain`,
          gearbox: sql`excluded.gearbox`,
          co2Wltp: sql`excluded.co2_wltp`,
          co2Nedc: sql`excluded.co2_nedc`,
          emissionStandard: sql`excluded.emission_standard`,
          curbWeightKg: sql`excluded.curb_weight_kg`,
          imageUrl: sql`excluded.image_url`,
          specs: sql`excluded.specs`,
        },
      });
  }
  console.log(`us_versions: ${soResumo.length} resumos + ${comDeep.length} deep upserts`);

  const { closeDb } = await import("../../db");
  await closeDb();
}

main().catch((err) => {
  console.error("✗ ingest-ultimatespecs:", err);
  process.exit(1);
});
