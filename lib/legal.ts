/**
 * Dados legais da entidade e datas dos documentos.
 *
 * ⚠️ A identificação da entidade (denominação, NIPC, sede) é **obrigatória por
 * lei** — RGPD art. 13º/1/a e DL 7/2004 (comércio eletrónico), que não isenta
 * B2B. Enquanto estiver por preencher, as páginas legais mostram um aviso e o
 * `EMPRESA_POR_PREENCHER` fica a true. Preencher aqui chega: as páginas todas
 * leem daqui.
 */

const POR_PREENCHER = "[por preencher]";

export const EMPRESA = {
  /** Denominação social completa, como está na certidão. */
  denominacao: POR_PREENCHER,
  /** NIPC (9 dígitos). */
  nipc: POR_PREENCHER,
  /** Morada da sede. */
  sede: POR_PREENCHER,
  /** Comarca do foro — depende da sede real. */
  foro: POR_PREENCHER,
  nomeComercial: "AutoImport",
  emailLegal: "legal@arestadigital.pt",
  emailPrivacidade: "privacidade@arestadigital.pt",
  emailGeral: "ola@autoimport.arestadigital.pt",
} as const;

/** true enquanto houver campos obrigatórios por preencher. */
export const EMPRESA_POR_PREENCHER = Object.values(EMPRESA).some((v) => v === POR_PREENCHER);

/**
 * Condições comerciais. Vivem aqui (e não espalhadas pelo texto) porque têm de
 * ser **idênticas** nos Termos, na página de subscrição, no FAQ e no marketing:
 * a divergência entre "sem reembolso" nos Termos e "reembolso garantido" no FAQ
 * foi um erro concreto encontrado noutro SaaS português. Não repetir.
 */
export const CONDICOES = {
  precoMensalEuros: 100,
  /** Dias do período experimental. Não pede cartão. */
  trialDias: 30,
  /** Janela de reembolso voluntária (não obrigatória em B2B). */
  reembolsoDias: 14,
  /** Pré-aviso mínimo para alterações de preço ou de termos. */
  preAvisoDias: 30,
  /** Conservação dos dados de conta após cancelamento, antes de eliminar. */
  retencaoContaDias: 90,
  /** Teto da limitação de responsabilidade, em meses de subscrição paga. */
  tetoResponsabilidadeMeses: 12,
} as const;

export interface DocMeta {
  slug: string;
  titulo: string;
  /** ISO — a data que aparece como "última atualização". */
  atualizadoEm: string;
  descricao: string;
}

/**
 * Os documentos legais. Objeto (e não array com `find`) para que `DOCS.termos`
 * seja garantidamente definido — sem asserções `!` nas páginas.
 */
export const DOCS = {
  termos: {
    slug: "termos",
    titulo: "Termos de Serviço",
    atualizadoEm: "2026-07-15",
    descricao: "O contrato entre o teu stand e o AutoImport.",
  },
  subscricao: {
    slug: "subscricao",
    titulo: "Subscrição e Reembolsos",
    atualizadoEm: "2026-07-15",
    descricao: "Preço, faturação, cancelamento e reembolsos.",
  },
  "uso-aceitavel": {
    slug: "uso-aceitavel",
    titulo: "Uso Aceitável",
    atualizadoEm: "2026-07-15",
    descricao: "O que se pode e não se pode fazer na plataforma.",
  },
  privacidade: {
    slug: "privacidade",
    titulo: "Política de Privacidade",
    atualizadoEm: "2026-07-15",
    descricao: "Que dados tratamos, porquê, e os teus direitos.",
  },
  cookies: {
    slug: "cookies",
    titulo: "Política de Cookies",
    atualizadoEm: "2026-07-15",
    descricao: "Que cookies usamos — hoje, apenas um.",
  },
} as const satisfies Record<string, DocMeta>;

/** Pela ordem em que se navegam. */
export const DOCUMENTOS: DocMeta[] = Object.values(DOCS);

/** Documento anterior e seguinte, para a navegação no fim da página. */
export function vizinhos(slug: string): { anterior?: DocMeta; seguinte?: DocMeta } {
  const i = DOCUMENTOS.findIndex((d) => d.slug === slug);
  if (i === -1) return {};
  return { anterior: DOCUMENTOS[i - 1], seguinte: DOCUMENTOS[i + 1] };
}
