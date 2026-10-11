/**
 * Transporte por camião porta-a-porta até Portugal, por país e região (código
 * postal do vendedor). Valores sem IVA de transportadoras ibéricas, fontes
 * secundárias/comerciais recolhidas nos estudos por país (out. 2026): média ou
 * baixa confiança — afinar com dados reais de compras (P09 deixa o stand pôr os seus).
 */
import type { CountryCode } from "../types";

/**
 * Valor base por país: o que se usa quando não há código postal.
 *  - DE 950 €: sul/oeste — https://legalizacao.pt/servico/transporte-alemanha-portugal/ (estudo DE §2)
 *  - NL 1 000 €, BE 950 €: estudos NL §5 e BE §5
 *  - FR 800 €: départements sem dados — https://ecoimport.pt/transporte-automovel/ (estudo FR §7)
 *  - ES 550 €: Madrid — https://ecoimport.pt/servicos/transporte-automovel/ (estudo ES §5)
 */
export const TRANSPORT_COST_EUR: Record<CountryCode, number> = {
  DE: 950,
  NL: 1000,
  BE: 950,
  FR: 800,
  ES: 550,
};

/** DE: PLZ a começar por 0, 1 ou 2 (norte/leste: Hamburgo, Berlim, Saxónia…) custa mais (DE §2). */
export const DE_NORTH_EAST_PLZ_PREFIXES = ["0", "1", "2"] as const;
export const DE_NORTH_EAST_SURCHARGE_EUR = 250;

/**
 * DE: suplemento de seguro pelo valor do carro (tabela da legalizacao.pt, DE §7.2).
 * Do maior para o menor: aplica-se o primeiro limiar que o preço ultrapassa.
 */
export const DE_INSURANCE_SURCHARGE_EUR = [
  { above: 75000, amount: 185 },
  { above: 50000, amount: 123 },
  { above: 35000, amount: 62 },
] as const;

/**
 * FR por département (2 primeiros dígitos do CP), estudo FR §2 e §7:
 * Paris/Île-de-France e Bordéus 700 €; os outros com dados, 700 € + suplemento;
 * os restantes, o valor base de 800 €.
 */
export const FR_TRANSPORT_BY_DEPARTMENT_EUR: Record<string, number> = {
  // Île-de-France e Gironde (Bordéus): rotas regulares pela A10/A63
  "75": 700,
  "77": 700,
  "78": 700,
  "91": 700,
  "92": 700,
  "93": 700,
  "94": 700,
  "95": 700,
  "33": 700,
  // Nantes, Rennes, Toulouse
  "44": 750,
  "35": 750,
  "31": 750,
  // Lyon
  "69": 775,
  // Lorena/Alsácia (Nancy, Metz, Estrasburgo, Mulhouse)
  "54": 850,
  "57": 850,
  "67": 850,
  "68": 850,
  // Norte (Lille)
  "59": 900,
  "62": 900,
  // Mediterrâneo (Marselha, Nîmes, Montpellier, Toulon)
  "13": 950,
  "30": 950,
  "34": 950,
  "83": 950,
  // Nice, Bretanha ocidental, Le Havre
  "06": 1050,
  "29": 1050,
  "76": 1050,
};

/**
 * ES por província (2 primeiros dígitos do CP), estudo ES §5 — baixa confiança:
 * Galiza 650 € (Vigo), País Basco/Navarra/Aragão 700 € (Bilbao), Catalunha/
 * Valência/Múrcia 750 € (meio de 600–900 €), Andaluzia 600 € (meio de 450–750 €,
 * fora das rotas partilhadas), Castela e Leão/Extremadura 500 € (perto da
 * fronteira). Madrid e o resto: o valor base de 550 €.
 */
const ES_REGION_COST: [number, string[]][] = [
  [650, ["15", "27", "32", "36"]],
  [700, ["01", "20", "48", "31", "22", "44", "50"]],
  [750, ["08", "17", "25", "43", "03", "12", "46", "30"]],
  [600, ["04", "11", "14", "18", "21", "23", "29", "41"]],
  [500, ["05", "09", "24", "34", "37", "40", "42", "47", "49", "06", "10"]],
];

export const ES_TRANSPORT_BY_PROVINCE_EUR: Record<string, number> = Object.fromEntries(
  ES_REGION_COST.flatMap(([cost, provinces]) => provinces.map((p) => [p, cost])),
);

/**
 * Custo do transporte. Sem código postal → valor base do país. `price` (preço
 * anunciado) só conta na DE, para o suplemento de seguro.
 */
export function estimateTransport(
  country: CountryCode,
  postalCode?: string | null,
  price?: number | null,
): number {
  const cp = (postalCode ?? "").trim();
  const prefix2 = cp.slice(0, 2);
  switch (country) {
    case "DE": {
      let cost = TRANSPORT_COST_EUR.DE;
      if ((DE_NORTH_EAST_PLZ_PREFIXES as readonly string[]).includes(cp.slice(0, 1))) {
        cost += DE_NORTH_EAST_SURCHARGE_EUR;
      }
      const insurance = DE_INSURANCE_SURCHARGE_EUR.find((s) => (price ?? 0) > s.above);
      return cost + (insurance?.amount ?? 0);
    }
    case "FR":
      return FR_TRANSPORT_BY_DEPARTMENT_EUR[prefix2] ?? TRANSPORT_COST_EUR.FR;
    case "ES":
      return ES_TRANSPORT_BY_PROVINCE_EUR[prefix2] ?? TRANSPORT_COST_EUR.ES;
    default:
      return TRANSPORT_COST_EUR[country];
  }
}
