/**
 * Custos de legalização em PT (excl. ISV/IUC), estudo PT §5 (out. 2026).
 * Os 355 € antigos sobrestimavam ~150 € um stand que trata tudo e
 * subestimavam o de um stand com agência; por isso partem-se em custo
 * oficial + despachante.
 */

/** Taxas oficiais com COC — ≈ 205 €. */
export const LEGALIZATION_OFFICIAL_EUR = {
  /** Inspeção para atribuição de matrícula (CITV cat. B, Modelo 112): 76,03 € + IVA —
   * Deliberação IMT 1598-A/2025, https://antram.pt/attachments/legislacao/Deliberacao%201598-A2025.pdf */
  inspecaoModelo112: 93.52,
  /** Taxa IMT de matrícula com COC —
   * https://www.imt-ip.pt/veiculos/matricula/matricula-para-veiculos-usados/ */
  imtComCoc: 45,
  /** 1.º registo de propriedade online —
   * https://www2.gov.pt/en/servicos/registar-veiculo-automovel-servico-automovel-online */
  registo: 46.8,
  /** Chapas de matrícula: sem tabela oficial, 15–30 € no mercado */
  chapas: 20,
} as const;

/** Taxa IMT sem COC e sem homologação nacional (estudo PT §5); o processo pode demorar meses. */
export const LEGALIZATION_IMT_SEM_COC_EUR = 165;

/** Honorários de agência/despachante — DEFAULT, mínimo do intervalo 250–500 € (PT §5). */
export const DESPACHANTE_DEFAULT_EUR = 250;

/** Custo oficial de legalização, arredondado ao euro. `coc: false` mostra o risco de não haver COC. */
export function estimateLegalization(opts: { coc?: boolean } = {}): number {
  const { inspecaoModelo112, imtComCoc, registo, chapas } = LEGALIZATION_OFFICIAL_EUR;
  const imt = opts.coc === false ? LEGALIZATION_IMT_SEM_COC_EUR : imtComCoc;
  return Math.round(inspecaoModelo112 + imt + registo + chapas);
}
