/**
 * Tabelas fiscais 2027 — PROVISÓRIAS: cópia exata das de 2026.
 *
 * A Proposta de Lei 110/XVII/2.ª (OE 2027), entregue na AR a 8/10/2026, não
 * mexe nas taxas do ISV nem do IUC segundo as análises publicadas (PwC: "Ausência
 * de aumento de taxas nos IEC, ISV e IUC" e "Não são propostas alterações ao
 * Código do IUC"; o adicional de IUC do gasóleo é prorrogado com os valores
 * atuais). Fontes: https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=377352
 * e https://www.pwc.pt/pt/pwcinforfisco/orcamentoestado/impostos-indiretos.html
 * (lidas a 10/10/2026; estudo PT §4.2).
 *
 * Votação final global a 24/11/2026; publicação em DR normalmente na 2.ª metade
 * de dezembro. Depois disso: confirmar cada bloco contra o texto final e o
 * folheto da AT de 2027, trocar os sourceUrl e pôr PROVISIONAL_2027 = false.
 *
 * A mudança do IUC em 2027 (período = ano civil, 1.º ano proporcional, DL
 * 161/2026) não é de tabelas: está em lib/cost-engine/iuc.ts.
 */
import type { TaxTables } from "../../lib/cost-engine/types";
import { ISV_TABLES_2026, TAX_TABLES_2026 } from "./isv-2026";

/** true enquanto o OE 2027 não estiver publicado em DR e conferido. */
export const PROVISIONAL_2027 = true;

const PPL_110_XVII =
  "https://www.parlamento.pt/ActividadeParlamentar/Paginas/DetalheIniciativa.aspx?BID=377352";

/** As tabelas completas de 2027 na forma que o cost engine consome. */
export const TAX_TABLES_2027: TaxTables = { ...TAX_TABLES_2026, year: 2027 };

/**
 * Linhas para a tabela `isv_tables` (unique em year+kind). O kind
 * `tabelas_meta` marca o ano como provisório (lido por lib/engine/tax-tables.ts).
 */
export const ISV_TABLES_2027: {
  year: number;
  kind: string;
  payload: unknown;
  sourceUrl: string;
}[] = [
  ...ISV_TABLES_2026.map((t) => ({ ...t, year: 2027, sourceUrl: PPL_110_XVII })),
  {
    year: 2027,
    kind: "tabelas_meta",
    payload: { provisional: PROVISIONAL_2027 },
    sourceUrl: PPL_110_XVII,
  },
];
