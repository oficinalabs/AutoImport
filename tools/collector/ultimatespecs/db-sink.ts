// db-sink.ts — upsert direto do catálogo (us_models/us_versions) no Postgres.
//
// Modo DEFAULT do coletor quando há DATABASE_URL: nada é escrito em disco; o
// próprio estado de resume deriva da BD (mids em us_models = modelos feitos,
// version_ids em us_versions = dedupe). SQL cru via `postgres` (node_modules
// da raiz), como o lib/db-sink.ts dos anúncios — os coletores não importam
// db/schema.ts do app (imports sem extensão não passam no type-stripping).
//
// Upsert de versão em duas variantes, como no ingest por replay: um registo
// só-resumo nunca apaga os campos deep de uma recolha anterior.

import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';
import type { ModelRef, VersionRecord } from './schema.ts';

export class UsDbSink {
  private sql: postgres.Sql;

  constructor(databaseUrl: string) {
    // prepare:false — compatível com o pooler transaction-mode da Supabase.
    this.sql = postgres(databaseUrl, { prepare: false, max: 4 });
  }

  /** Estado de resume a partir da BD: modelos já feitos + versões já vistas. */
  async loadDone(): Promise<{ doneMids: Set<string>; seenVersions: Set<string> }> {
    const mids = await this.sql`select mid from us_models`;
    const vids = await this.sql`select version_id from us_versions`;
    return {
      doneMids: new Set(mids.map((r) => r.mid as string)),
      seenVersions: new Set(vids.map((r) => r.version_id as string)),
    };
  }

  /**
   * Unidade completa: upsert do modelo + das suas versões novas. O modelo é
   * escrito NO FIM (linha em us_models = modelo feito, para o resume) — as
   * versões primeiro falhariam o FK, por isso a ordem é modelo → versões,
   * dentro de uma transação (unidade atómica: ou fica tudo, ou nada).
   */
  async upsertUnit(ref: ModelRef, images: string[], versions: VersionRecord[]) {
    await this.sql.begin(async (tx) => {
      await tx`
        insert into us_models (mid, make, model, slug, model_year, url, image_urls, collected_at)
        values (${ref.mid}, ${ref.make}, ${ref.model}, ${ref.slug}, ${ref.modelYear},
                ${ref.url}, ${tx.json(images)}, now())
        on conflict (mid) do update set
          make = excluded.make, model = excluded.model, slug = excluded.slug,
          model_year = excluded.model_year, url = excluded.url,
          image_urls = excluded.image_urls, collected_at = excluded.collected_at,
          updated_at = now()`;
      for (const v of versions) {
        const base = {
          version_id: v.versionId,
          mid: v.mid,
          name: v.name,
          url: v.url,
          fuel_section: v.fuelSection,
          year: v.year,
          power_hp: v.powerHp,
          power_kw: v.powerKw,
          displacement_cc: v.displacementCc,
          collected_at: v.collectedAt,
        };
        if (v.deep) {
          const d = v.deep;
          await tx`
            insert into us_versions ${tx({
              ...base,
              generation: d.generation, body: d.body, doors: d.doors, seats: d.seats,
              fuel: d.fuel, engine_code: d.engineCode, cylinders: d.cylinders,
              torque_nm: d.torqueNm, drivetrain: d.drivetrain, gearbox: d.gearbox,
              co2_wltp: d.co2Wltp, co2_nedc: d.co2Nedc, emission_standard: d.emissionStandard,
              curb_weight_kg: d.curbWeightKg, image_url: d.imageUrl, specs: tx.json(d.specs),
            })}
            on conflict (version_id) do update set
              mid = excluded.mid, name = excluded.name, url = excluded.url,
              fuel_section = excluded.fuel_section, year = excluded.year,
              power_hp = excluded.power_hp, power_kw = excluded.power_kw,
              displacement_cc = excluded.displacement_cc,
              generation = excluded.generation, body = excluded.body,
              doors = excluded.doors, seats = excluded.seats, fuel = excluded.fuel,
              engine_code = excluded.engine_code, cylinders = excluded.cylinders,
              torque_nm = excluded.torque_nm, drivetrain = excluded.drivetrain,
              gearbox = excluded.gearbox, co2_wltp = excluded.co2_wltp,
              co2_nedc = excluded.co2_nedc, emission_standard = excluded.emission_standard,
              curb_weight_kg = excluded.curb_weight_kg, image_url = excluded.image_url,
              specs = excluded.specs, collected_at = excluded.collected_at, updated_at = now()`;
        } else {
          await tx`
            insert into us_versions ${tx(base)}
            on conflict (version_id) do update set
              mid = excluded.mid, name = excluded.name, url = excluded.url,
              fuel_section = excluded.fuel_section, year = excluded.year,
              power_hp = excluded.power_hp, power_kw = excluded.power_kw,
              displacement_cc = excluded.displacement_cc,
              collected_at = excluded.collected_at, updated_at = now()`;
        }
      }
    });
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}

/** Cria o sink se houver DATABASE_URL (env ou .env.local da raiz); senão null. */
export function createUsDbSink(): UsDbSink | null {
  if (!process.env.DATABASE_URL) {
    try {
      process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '../../../.env.local'));
    } catch {
      /* sem .env.local — fica NDJSON */
    }
  }
  const url = process.env.DATABASE_URL;
  return url ? new UsDbSink(url) : null;
}
