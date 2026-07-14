/**
 * Carrega as tabelas fiscais de um ano da BD (isv_tables) para a forma
 * TaxTables que o cost engine consome. Os kinds/payloads são os do seed
 * db/seed/isv-2026.ts.
 */
import { eq } from "drizzle-orm";
import type { db as Db } from "../../db";
import { isvTables } from "../../db/schema";
import type { TaxTables } from "../cost-engine/types";

export async function loadTaxTables(db: typeof Db, year: number): Promise<TaxTables> {
  const rows = await db.select().from(isvTables).where(eq(isvTables.year, year));
  const byKind = new Map(rows.map((r) => [r.kind, r.payload]));

  const need = (kind: string): unknown => {
    const payload = byKind.get(kind);
    if (payload == null) {
      throw new Error(`isv_tables: falta (year=${year}, kind=${kind}) — correr pnpm db:seed`);
    }
    return payload;
  };

  return {
    year,
    isvCilindrada: need("isv_cilindrada") as TaxTables["isvCilindrada"],
    isvCo2GasolinaWltp: need("isv_co2_gasolina_wltp") as TaxTables["isvCo2GasolinaWltp"],
    isvCo2DieselWltp: need("isv_co2_diesel_wltp") as TaxTables["isvCo2DieselWltp"],
    isvCo2GasolinaNedc: need("isv_co2_gasolina_nedc") as TaxTables["isvCo2GasolinaNedc"],
    isvCo2DieselNedc: need("isv_co2_diesel_nedc") as TaxTables["isvCo2DieselNedc"],
    isvReducaoAntiguidade: need("isv_reducao_antiguidade") as TaxTables["isvReducaoAntiguidade"],
    isvTaxasIntermedias: need("isv_taxas_intermedias") as TaxTables["isvTaxasIntermedias"],
    isvAgravamentoDiesel: (need("isv_agravamento_diesel") as { amount: number }).amount,
    iucCilindrada: need("iuc_cilindrada") as TaxTables["iucCilindrada"],
    iucCo2Wltp: need("iuc_co2_wltp") as TaxTables["iucCo2Wltp"],
    iucCo2Nedc: need("iuc_co2_nedc") as TaxTables["iucCo2Nedc"],
    iucCoefAno: need("iuc_coef_ano") as TaxTables["iucCoefAno"],
    iucAdicionalDiesel: need("iuc_adicional_diesel") as TaxTables["iucAdicionalDiesel"],
  };
}
