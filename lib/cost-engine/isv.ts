/**
 * ISV — Imposto Sobre Veículos (importação de usados UE).
 * Fórmula (Código do ISV; tabelas versionadas em db/seed/isv-2026.ts):
 *   ISV = [ (cilindrada + ambiental CO₂) × taxa intermédia (art. 8.º)
 *           + agravamento partículas gasóleo (art. 9.º) ]
 *         × (1 − redução por antiguidade, art. 11.º Tabela D — aplicada a
 *            AMBAS as componentes desde a Lei 45-A/2024)
 * Elétricos: isentos. A redução aplica-se ao total incluindo o agravamento
 * (convenção dos simuladores; a letra da lei é ambígua — ver research).
 */
import type { CostInput, IsvBreakdown, LinearBracket, TaxTables } from "./types";

/** Valor de um escalão linear: unidades × taxa − parcela a abater, nunca <0. */
function linearValue(units: number, brackets: LinearBracket[]): number {
  const bracket =
    brackets.find((b) => b.upTo !== null && units <= b.upTo) ?? brackets[brackets.length - 1];
  return Math.max(0, units * bracket.ratePerUnit - bracket.deduction);
}

/** Idade em anos (fração, dias exatos) entre a 1.ª matrícula e a referência. */
export function vehicleAgeYears(firstRegistration: Date, referenceDate: Date): number {
  const ms = referenceDate.getTime() - firstRegistration.getTime();
  return ms / (365.25 * 24 * 3600 * 1000);
}

/**
 * Norma de homologação CO₂ assumida pelo ano da 1.ª matrícula: ≥2019 → WLTP,
 * ≤2018 → NEDC. 2018–2019 é zona de transição (a norma real vem do COC, que
 * não temos) — a assunção fica registada quando cai nesses anos.
 */
export function co2Norm(year: number): "wltp" | "nedc" {
  return year >= 2019 ? "wltp" : "nedc";
}

export function calculateIsv(input: CostInput, tables: TaxTables): IsvBreakdown {
  const assumptions: string[] = [];

  if (input.fuel === "elétrico") {
    return {
      cilindrada: 0,
      ambiental: 0,
      agravamentoDiesel: 0,
      taxaPct: 0,
      reducaoPct: 0,
      norm: "n/a",
      total: 0,
      assumptions,
    };
  }

  if (input.displacementCc == null || input.co2 == null) {
    throw new Error("ISV: displacementCc e co2 são obrigatórios para não-elétricos");
  }

  // Componente cilindrada (Tabela A)
  const cilindrada = linearValue(input.displacementCc, tables.isvCilindrada);

  // Componente ambiental — tabela por combustível × norma (ano de matrícula).
  // Híbridos/PHEV: tabela do combustível base; sem dado do motor térmico,
  // assumimos gasolina (a esmagadora maioria).
  const regYear = input.firstRegistration.getFullYear();
  const norm = co2Norm(regYear);
  if (regYear === 2018 || regYear === 2019) {
    assumptions.push(`norma CO₂ assumida ${norm.toUpperCase()} (matrícula ${regYear}, transição)`);
  }
  const isDiesel = input.fuel === "diesel";
  const co2Table = isDiesel
    ? norm === "wltp"
      ? tables.isvCo2DieselWltp
      : tables.isvCo2DieselNedc
    : norm === "wltp"
      ? tables.isvCo2GasolinaWltp
      : tables.isvCo2GasolinaNedc;
  if (input.fuel === "híbrido" || input.fuel === "phev") {
    assumptions.push("híbrido: componente CO₂ pela tabela gasolina (motor térmico assumido)");
  }
  const ambiental = linearValue(input.co2, co2Table);

  // Agravamento partículas gasóleo (art. 9.º) — isento se < 0,001 g/km, dado
  // que não temos; convenção dos simuladores é aplicar por omissão.
  const agravamentoDiesel = isDiesel ? tables.isvAgravamentoDiesel : 0;
  if (isDiesel) {
    assumptions.push("gasóleo: agravamento partículas aplicado (emissões reais desconhecidas)");
  }

  // Taxa intermédia (art. 8.º)
  let taxaPct = 100;
  if (input.fuel === "phev") {
    const { phev, phevUsado } = tables.isvTaxasIntermedias;
    if (regYear >= phevUsado.fromYear && regYear <= phevUsado.toYear) {
      taxaPct = phevUsado.pct;
      assumptions.push(
        `phev usado ${phevUsado.fromYear}–${phevUsado.toYear}: autonomia assumida ≥ ${phevUsado.minRangeKm} km (taxa ${phevUsado.pct}%)`,
      );
    } else if (input.co2 < phev.maxCo2) {
      taxaPct = phev.pct;
      assumptions.push(
        `phev: autonomia desconhecida — assumida ≥ ${phev.minRangeKm} km (taxa ${phev.pct}%)`,
      );
    }
  } else if (input.fuel === "híbrido") {
    const rule = tables.isvTaxasIntermedias.hibrido;
    // Condição atual (>50 km elétricos + <50 g) exclui HEV convencionais —
    // só aplica se o CO₂ passar, o que na prática não acontece.
    if (input.co2 < rule.maxCo2) {
      taxaPct = rule.pct;
      assumptions.push(
        `híbrido: autonomia desconhecida — assumida > ${rule.minRangeKm} km (taxa ${rule.pct}%)`,
      );
    }
  }

  // Redução por antiguidade (art. 11.º) — idade em dias exatos
  const age = vehicleAgeYears(input.firstRegistration, input.referenceDate ?? new Date());
  const reduction = tables.isvReducaoAntiguidade.find(
    (b) => age >= b.minYears && (b.maxYears === null || age < b.maxYears),
  );
  const reducaoPct = reduction?.pct ?? 0;

  const total =
    ((cilindrada + ambiental) * (taxaPct / 100) + agravamentoDiesel) * (1 - reducaoPct / 100);

  return {
    cilindrada: round2(cilindrada),
    ambiental: round2(ambiental),
    agravamentoDiesel,
    taxaPct,
    reducaoPct,
    norm,
    total: round2(total),
    assumptions,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
