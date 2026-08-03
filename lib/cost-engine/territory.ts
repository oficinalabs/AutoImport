/**
 * Territórios que o motor de custos NÃO sabe calcular — não é elegibilidade do
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

const REGION_RE = new RegExp(ES_ISLAND_REGION_REGEX_SOURCE, "i");

/**
 * Anúncio numa ilha espanhola? Fecha ABERTO: sem região e sem CP → `false`
 * (incluído). Não há dados para excluir, e excluir por ausência de dados
 * deitava fora anúncios continentais legítimos.
 */
export function isExcludedTerritory(
  country: string | null | undefined,
  region: string | null | undefined,
  postalCode: string | null | undefined,
): boolean {
  if (country !== "ES") return false;
  const prefix = (postalCode ?? "").slice(0, 2);
  if ((ES_ISLAND_POSTAL_PREFIXES as readonly string[]).includes(prefix)) return true;
  return REGION_RE.test(region ?? "");
}
