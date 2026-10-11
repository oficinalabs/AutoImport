/**
 * ISV — Imposto Sobre Veículos (importação de usados UE).
 * Fórmula (Código do ISV; tabelas versionadas em db/seed/isv-<ano>.ts):
 *   ISV = max(100 €, [ max(0, cilindrada + ambiental CO₂) × taxa intermédia (art. 8.º)
 *                      + agravamento partículas gasóleo (art. 7.º n.º 3) ]
 *                    × (1 − redução por antiguidade, art. 11.º Tabela D — aplicada a
 *                       AMBAS as componentes desde a Lei 45-A/2024))
 * A componente ambiental pode ser negativa e abate à de cilindrada; o imposto
 * nunca é inferior a 100 € (art. 7.º n.º 4 — ver ISV_MINIMO_EUR).
 * Elétricos: isentos. A redução aplica-se ao total incluindo o agravamento
 * (convenção dos simuladores; a letra da lei é ambígua — ver research).
 */
import type { CostInput, IsvBreakdown, LinearBracket, TaxTables } from "./types";

/**
 * ISV mínimo — CISV art. 7.º n.º 4 (Lei 22-A/2007, versão consolidada pela Lei
 * 73-A/2025, https://www.pgdlisboa.pt/leis/lei_mostra_articulado.php?nid=976&tabela=leis,
 * lido a 10/10/2026): "Sempre que o imposto relativo à componente ambiental
 * apresentar um resultado negativo, será o mesmo deduzido ao montante do imposto
 * da componente cilindrada, não podendo o total do imposto a pagar ser inferior
 * a € 100".
 */
export const ISV_MINIMO_EUR = 100;

/**
 * DEFAULT: o mínimo de 100 € aplica-se ao imposto FINAL, já depois da redução
 * por antiguidade. Não está confirmado: o art. 11.º n.º 1 aplica a Tabela D "ao
 * imposto resultante da tabela respetiva" (Ofício-Circulado 35.141/2020, §2.1,
 * https://info-aduaneiro.portaldasfinancas.gov.pt/pt/legislacao_aduaneira/oficios_circulados_doclib/Documents/Oficio_Circulado_35141_2020.pdf),
 * o que admite ler o mínimo como anterior à redução (um usado de 10 anos poderia
 * então pagar 20 €); mas o art. 7.º n.º 4 fala no "total do imposto a pagar".
 * Nem a AT (folhetos, FAQ, informações vinculativas) nem os simuladores
 * públicos esclarecem (pesquisa de 10/10/2026). Ficamos com a leitura que dá
 * ISV igual ou maior — a mesma regra conservadora da idade. `false` aplica o
 * mínimo antes da redução.
 */
export const ISV_MINIMO_APOS_REDUCAO = true;

/** Janela do aviso "o carro muda de escalão da Tabela D em breve" (dias). */
export const AVISO_ESCALAO_DIAS = 45;

const YEAR_MS = 365.25 * 24 * 3600 * 1000;
const DAY_MS = 24 * 3600 * 1000;

/** Valor de um escalão linear: unidades × taxa − parcela a abater (pode ser <0). */
function linearValue(units: number, brackets: LinearBracket[]): number {
  const bracket =
    brackets.find((b) => b.upTo !== null && units <= b.upTo) ?? brackets[brackets.length - 1];
  return units * bracket.ratePerUnit - bracket.deduction;
}

/** Idade em anos (fração, dias exatos) entre a 1.ª matrícula e a referência. */
export function vehicleAgeYears(firstRegistration: Date, referenceDate: Date): number {
  const ms = referenceDate.getTime() - firstRegistration.getTime();
  return ms / YEAR_MS;
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

  // Componente cilindrada (Tabela A). O art. 7.º n.º 4 só prevê a componente
  // ambiental negativa; a de cilindrada fica ≥ 0 (só é negativa abaixo de ~780 cm³).
  const cilindrada = Math.max(0, linearValue(input.displacementCc, tables.isvCilindrada));

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
  // Pode ser negativa (CO₂ baixo): abate à cilindrada (art. 7.º n.º 4).
  const ambiental = linearValue(input.co2, co2Table);

  // Agravamento partículas gasóleo (art. 7.º n.º 3) — isento se < 0,001 g/km, dado
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

  // Redução por antiguidade (art. 11.º) — idade em dias exatos. DEFAULT: idade
  // a "hoje" (referenceDate), não à DAV, que ainda não sabemos quando será; dá
  // ISV igual ou maior. Se o carro mudar de escalão em breve, avisamos abaixo.
  const referenceDate = input.referenceDate ?? new Date();
  const age = vehicleAgeYears(input.firstRegistration, referenceDate);
  const reduction = tables.isvReducaoAntiguidade.find(
    (b) => age >= b.minYears && (b.maxYears === null || age < b.maxYears),
  );
  const reducaoPct = reduction?.pct ?? 0;

  const base = Math.max(0, cilindrada + ambiental) * (taxaPct / 100) + agravamentoDiesel;
  const total = applyReduction(base, reducaoPct);

  // Aviso de mudança de escalão da Tabela D (o tempo de uso conta até ao termo
  // do prazo da DAV, art. 11.º n.º 2 — perto da fronteira, a data decide).
  if (reduction?.maxYears != null) {
    const boundary = new Date(input.firstRegistration.getTime() + reduction.maxYears * YEAR_MS);
    const daysToBoundary = (boundary.getTime() - referenceDate.getTime()) / DAY_MS;
    const next = tables.isvReducaoAntiguidade.find((b) => b.minYears === reduction.maxYears);
    if (next && daysToBoundary > 0 && daysToBoundary <= AVISO_ESCALAO_DIAS) {
      const nextTotal = applyReduction(base, next.pct);
      if (nextTotal < total) {
        assumptions.push(
          `idade: se a DAV for a partir de ${formatDate(boundary)}, o ISV desce para ` +
            `${formatEur(nextTotal)} € (redução ${reducaoPct}% → ${next.pct}%)`,
        );
      }
    }
  }

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

/** Redução da Tabela D + mínimo de 100 € (ordem: ver ISV_MINIMO_APOS_REDUCAO). */
function applyReduction(base: number, reducaoPct: number): number {
  const factor = 1 - reducaoPct / 100;
  return ISV_MINIMO_APOS_REDUCAO
    ? Math.max(ISV_MINIMO_EUR, base * factor)
    : Math.max(ISV_MINIMO_EUR, base) * factor;
}

/** DD/MM/AAAA (UTC, para não depender do fuso da máquina). */
function formatDate(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${d.getUTCFullYear()}`;
}

function formatEur(n: number): string {
  return Math.round(n).toLocaleString("pt-PT");
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
