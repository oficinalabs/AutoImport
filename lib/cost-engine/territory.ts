/**
 * Territórios que o motor de custos NÃO sabe calcular (ilhas e territórios fora
 * do IVA da UE em ES e FR) — não é elegibilidade do
 * pipeline, é uma limitação do próprio motor, e por isso vive aqui ao lado do
 * `transport.ts` que a causa.
 *
 * Canárias, Baleares (e, no mesmo saco, qualquer ilha): o `TRANSPORT_COST_EUR`
 * dá **um único** valor por país (ES = 450 €) assumindo camião porta-a-porta.
 * Um carro em Las Palmas precisa de barco — e as Canárias estão **fora do
 * território IVA da UE**, portanto a conta da importação nem sequer é a mesma
 * (há despacho aduaneiro e IVA à entrada). Medidos 1 384 anúncios da montra a
 * receberem os 450 € de um carro em Madrid. A decisão do dono foi **excluir**,
 * não inventar um custo: melhor não mostrar do que mostrar uma poupança falsa.
 *
 * Quando houver custo real de ferry + despacho, apaga-se isto e calcula-se.
 */

/**
 * Prefixos de CP espanhóis que são só ilhas: 35 = Las Palmas, 38 = Santa Cruz
 * de Tenerife (Canárias), 07 = Illes Balears. Não há município continental
 * nestes prefixos → o sinal é exato, ao contrário do texto da região.
 *
 * ⚠️ Só valem com `country = 'ES'`: 07xxx também é PLZ alemão (Turíngia) e há
 * 6 410 anúncios DE nesse prefixo.
 */
export const ES_ISLAND_POSTAL_PREFIXES = ["07", "35", "38"] as const;

/**
 * Fallback para os ~88 % de anúncios ES sem CP: pedaços de texto que só
 * aparecem em regiões insulares, tal como vêm dos coletores ("Las Palmas",
 * "Tenerife", "Islas Baleares", "Provincia de Illes Balears", "Canarias").
 *
 * ⚠️ "palma" sozinho está de fora de propósito: Palma del Río (Córdoba) e
 * Palma de Gandía (Valência) são continente. Exige-se "las palmas".
 * Sem acentos — nenhum destes nomes os tem, e o casamento é insensível a
 * maiúsculas dos dois lados (regex `~*` no SQL, `i` no TS).
 */
export const ES_ISLAND_REGION_PATTERNS = [
  "las palmas",
  "tenerife",
  "baleares",
  "balears",
  "canarias",
] as const;

/** Alternância única, para reutilizar no SQL do pipeline sem duplicar a lista. */
export const ES_ISLAND_REGION_REGEX_SOURCE = `(${ES_ISLAND_REGION_PATTERNS.join("|")})`;

/**
 * Fora do território IVA da UE, além das ilhas: Ceuta (51) e Melilla (52), art.
 * 3.Dos LIVA — https://sede.agenciatributaria.gob.es/Sede/estadisticas/estadisticas-impuesto/resultados-economicos-tributarios-impuesto-sobre-anadido/metodologia/ambito-referencia/ambito-geografico.html
 * (estudo ES §2). Mesmo critério das Canárias: excluir em vez de mostrar uma
 * conta falsa (plano §5). As listas `ES_ISLAND_*` acima ficam como estão
 * porque o SQL do pipeline as usa; o P06 passa-o para estas.
 */
export const ES_EXCLUDED_POSTAL_PREFIXES = [...ES_ISLAND_POSTAL_PREFIXES, "51", "52"] as const;
export const ES_EXCLUDED_REGION_REGEX_SOURCE = `(${[
  ...ES_ISLAND_REGION_PATTERNS,
  "ceuta",
  "melilla",
].join("|")})`;

/**
 * França: os DOM (CP 971–976, e o resto do prefixo 97) estão fora do território
 * IVA da UE (Diretiva 2006/112/CE art. 6.º —
 * https://eur-lex.europa.eu/legal-content/PT/TXT/?uri=CELEX:32006L0112) e a
 * Córsega (CP 20xxx; départements 2A/2B) precisa de ferry, sem custo conhecido
 * (estudo FR §5).
 */
export const FR_EXCLUDED_POSTAL_PREFIXES = ["97", "20", "2A", "2B"] as const;

/**
 * Fallback por texto da região para FR. Sem "réunion" sozinho de propósito:
 * só "la réunion"/"la reunion", para não apanhar nomes de ruas ou de empresas.
 */
export const FR_EXCLUDED_REGION_REGEX_SOURCE =
  "(corse|guadeloupe|martinique|guyane|la r[ée]union|mayotte)";

const ES_REGION_RE = new RegExp(ES_EXCLUDED_REGION_REGEX_SOURCE, "i");
const FR_REGION_RE = new RegExp(FR_EXCLUDED_REGION_REGEX_SOURCE, "i");

/**
 * Anúncio num território que o motor não sabe calcular? Fecha ABERTO: sem
 * região e sem CP → `false` (incluído). Não há dados para excluir, e excluir
 * por ausência de dados deitava fora anúncios continentais legítimos.
 */
export function isExcludedTerritory(
  country: string | null | undefined,
  region: string | null | undefined,
  postalCode: string | null | undefined,
): boolean {
  const prefix = (postalCode ?? "").trim().slice(0, 2).toUpperCase();
  if (country === "ES") {
    if ((ES_EXCLUDED_POSTAL_PREFIXES as readonly string[]).includes(prefix)) return true;
    return ES_REGION_RE.test(region ?? "");
  }
  if (country === "FR") {
    if ((FR_EXCLUDED_POSTAL_PREFIXES as readonly string[]).includes(prefix)) return true;
    return FR_REGION_RE.test(region ?? "");
  }
  return false;
}
