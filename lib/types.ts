/**
 * Contrato de domínio do AutoImport.
 *
 * Estes tipos são a fronteira entre frontend e backend: a UI só conhece
 * estes tipos, e a camada `lib/data/*` é o único sítio que os produz.
 * O backend deve devolver exatamente estas formas (ou mapear para elas).
 * Alinha com as entidades em docs/04-BASE-DE-DADOS.md.
 */

export type CountryCode = "DE" | "FR" | "BE" | "NL" | "ES";

export interface Country {
  code: CountryCode;
  /** Nome em PT, ex.: "Alemanha" */
  name: string;
  /** Emoji da bandeira, ex.: "🇩🇪" */
  flag: string;
}

export type FuelType = "gasolina" | "diesel" | "híbrido" | "phev" | "elétrico";
export type Transmission = "manual" | "automática";

/** Veredito de negócio — cor semântica, ver docs/01-DESIGN.md. */
export type Verdict = "compensa" | "marginal" | "nao_compensa";

export type KmTrustLevel = "verificado" | "disponivel" | "por_verificar";

export interface KmTrust {
  level: KmTrustLevel;
  /** ex.: "Car-Pass", "NAP", "carVertical" */
  source?: string;
}

export interface VehicleModel {
  id: string;
  make: string;
  model: string;
  variant?: string;
  fuel: FuelType;
  transmission: Transmission;
  /** cilindrada em cm³ (undefined em elétricos) */
  displacementCc?: number;
  co2?: number;
  powerHp?: number;
}

/** Decomposição do custo de importar até estar legalizado em PT. */
export interface CostBreakdown {
  /** preço pedido no país de origem */
  originPrice: number;
  transport: number;
  isv: number;
  /** IUC do 1.º ano */
  iuc: number;
  legalization: number;
  /** soma de tudo = custo final em Portugal */
  totalPt: number;
}

/**
 * Confiança da estimativa PT: `normal` = amostra fechada (ano±1/km±1); `alargada`
 * = fallback com a banda de km esticada. A montra só mostra `normal`; a
 * `alargada` só chega à UI em itens já guardados (favoritos/detalhe), com aviso.
 */
export type PtConfidence = "normal" | "alargada";

/** Referência do mercado português para o mesmo modelo. */
export interface PtMarket {
  /** preço equivalente estimado em PT */
  estimatedPrice: number;
  /** nº de anúncios PT usados na amostra */
  sampleSize: number;
  /** confiança da amostra (undefined no mock de UI) */
  confidence?: PtConfidence;
  /** histórico de preço médio PT (para o gráfico) */
  history: { month: string; price: number }[];
}

/** Um anúncio estrangeiro, já com custo e comparação calculados. */
export interface Listing {
  id: string;
  model: VehicleModel;
  title: string;
  year: number;
  km: number;
  color?: string;
  country: CountryCode;
  /** fonte do anúncio, ex.: "AutoScout24" */
  source: string;
  /** URL original (o backend pode mascarar/proxiar) */
  sourceUrl?: string;
  images: string[];
  /** imagem principal do catálogo ultimatespecs (versão exata ou galeria do
   * modelo da designação) — a única cujo host o next/image autoriza; as fotos
   * dos anúncios (`images`) ficam para uma iteração futura */
  catalogImage?: string;
  cost: CostBreakdown;
  ptMarket: PtMarket;
  /** poupança em € (ptMarket.estimatedPrice - cost.totalPt) */
  savings: number;
  /** poupança em % face ao preço PT */
  savingsPct: number;
  verdict: Verdict;
  kmTrust: KmTrust;
  /** ISO date em que foi visto pela engine */
  seenAt: string;
  isFavorite: boolean;
  /**
   * ISO — quando o anúncio deixou de aparecer nas fontes; `undefined` se ainda
   * está no mercado. A engine marca isto ao fim de 14 dias sem sinal
   * (`run-daily.ts`, `--stale-days`) e desmarca sozinha se o anúncio reaparecer.
   *
   * ⚠️ Não quer dizer "vendido": também fica assim se o coletor daquela fonte
   * partir. Por isso a UI diz "já não disponível", não "vendido".
   *
   * Só chega à UI nos **favoritos** — a pesquisa continua a mostrar apenas
   * anúncios vivos.
   */
  unavailableSince?: string;
}

export interface Alert {
  id: string;
  name: string;
  /** resumo legível dos critérios, ex.: "BMW Série 3 · < 45 000 € · DE, NL" */
  criteria: string;
  countries: CountryCode[];
  active: boolean;
  matchCount: number;
  lastMatchAt?: string;
}

// ── Negociações (email mascarado) ───────────────────────────────
export type ConversationStatus = "aguarda_resposta" | "respondido" | "acordo";
export type MessageAuthor = "stand" | "fornecedor";

export interface Message {
  id: string;
  author: MessageAuthor;
  body: string;
  sentAt: string;
}

export interface Conversation {
  id: string;
  listingId: string;
  /** contexto do carro, para o cartão fixo no topo do fio */
  listingTitle: string;
  listingImage: string;
  country: CountryCode;
  savings: number;
  /** nome apresentado do fornecedor (o email real fica mascarado) */
  supplierName: string;
  status: ConversationStatus;
  messages: Message[];
  updatedAt: string;
}

// ── Pipeline da compra ──────────────────────────────────────────
export type DealStageKey =
  | "interessado"
  | "negociacao"
  | "acordo"
  | "pagamento"
  | "transporte"
  | "legalizacao"
  | "matricula"
  | "concluido";

export interface DealChecklistItem {
  label: string;
  done: boolean;
}

export interface Deal {
  id: string;
  listingId: string;
  title: string;
  image: string;
  country: CountryCode;
  stage: DealStageKey;
  totalPt: number;
  savings: number;
  /** próxima ação sugerida */
  nextAction?: string;
  /** documentos por tratar/tratados nesta fase */
  checklist: DealChecklistItem[];
  updatedAt: string;
}

// ── Conta / Stand ───────────────────────────────────────────────
export type MemberRole = "owner" | "member";

export interface Member {
  id: string;
  name: string;
  email: string;
  role: MemberRole;
}

export type SubscriptionStatus = "trial" | "ativa" | "expirada";

/** Um match que um alerta do stand disparou — o que o sino mostra. */
export interface Notification {
  id: string;
  /** nome do alerta que disparou */
  alertName: string;
  listingId: string;
  /** marca modelo ano do anúncio encontrado */
  title: string;
  /** ISO */
  sentAt: string;
}

export interface Stand {
  id: string;
  name: string;
  nif: string;
  address: string;
  phone: string;
  members: Member[];
  subscription: {
    status: SubscriptionStatus;
    pricePerMonth: number;
    /** ISO — fim do trial ou próxima renovação */
    renewsAt: string;
  };
}

// ── Painel ──────────────────────────────────────────────────────
export interface DashboardStats {
  newOpportunities: number;
  totalPotentialSavings: number;
  activeNegotiations: number;
  activeAlerts: number;
}

export interface CountryInsight {
  country: CountryCode;
  listingCount: number;
  avgSavings: number;
}
