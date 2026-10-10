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
/**
 * Caixa — só o que se pode AFIRMAR (e, por isso, filtrar). Quando não se sabe, o
 * campo que a transporta é `null` (ver VehicleModel.transmission): "não sabemos"
 * não é um valor de caixa, é a ausência dela, e não há filtro para o vazio.
 */
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
  /** `null` = a fonte não diz qual é (ou diz algo ambíguo, como "semi-automática").
   *  Antes isto era sempre "manual" por omissão — 291 dos 39 759 anúncios da montra
   *  eram um palpite apresentado como facto. Quem mostra o campo tem de dizer que
   *  não sabe (ver a ficha em app/(app)/(gated)/anuncio/[id]/page.tsx). */
  transmission: Transmission | null;
  /** cilindrada em cm³ (undefined em elétricos) */
  displacementCc?: number;
  co2?: number;
  powerHp?: number;
}

/**
 * Regime de IVA APLICADO na conta. `dedutivel` = o anúncio declara IVA dedutível e o
 * stand tem n.º de IVA no VIES: compra-se pelo líquido e revende-se em regime normal.
 * Tudo o resto é `margem` (lado seguro: não inventa desconto).
 */
export type VatRegime = "dedutivel" | "margem";

/** O que o ANÚNCIO diz do IVA (coluna `listings.vat_regime`); null/undefined = não diz. */
export type SourceVatRegime = "dedutivel" | "margem" | "particular";

/** Veredito de um registo oficial de km (coluna `listings.km_check`). */
export interface KmCheck {
  source: "RDW" | "Car-Pass" | "HistoVec" | "DGT";
  verdict: "coerente" | "incoerente" | "sem_juizo";
  /** ISO */
  checkedAt: string;
}

/** Um anúncio PT usado na estimativa do preço PT (o que a ficha mostra). */
export interface PtComparable {
  title: string;
  year: number;
  km: number;
  price: number;
  /** source_site, ex.: "standvirtual.com" */
  source: string;
  url?: string;
}

/** Forma compacta de PtComparable guardada em `import_cost_estimates.pt_sample`
 *  (chaves curtas: ~40 000 linhas × até 8 comparáveis, ver docs/04). */
export interface PtSampleRow {
  t: string;
  y: number;
  km: number;
  p: number;
  s: string;
  u?: string;
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
  // ── IVA e margem (opcionais: só existem depois de o motor novo correr) ──
  vatRegime?: VatRegime;
  /** custo de compra efetivo (líquido se dedutível; = preço se margem) */
  originPriceNet?: number;
  /** caução de IVA (dinheiro parado até à prova de transporte, não custo) */
  vatDeposit?: number;
  /** preparação/garantia */
  preparation?: number;
  despachante?: number;
  /** IVA a liquidar na revenda ao preço PT estimado */
  outputVat?: number;
  /** margem bruta estimada (€) */
  grossMargin?: number;
  grossMarginPct?: number;
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
  /** fotos do próprio anúncio: a galeria `image_urls` (até 8) quando o coletor a
   * deu, senão só a capa — vazio se a fonte não deu foto ou se nenhum URL é
   * utilizável (ver `listingPhotos` em lib/queries.ts) */
  images: string[];
  /** imagem principal do catálogo ultimatespecs (versão exata ou galeria do
   * modelo da designação) — **fallback** da capa, para os anúncios sem foto
   * própria e para as fontes que bloqueiam hotlinking */
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
  /** o que o anúncio diz do IVA; undefined = a fonte não diz */
  sourceVatRegime?: SourceVatRegime;
  /** comparáveis PT da estimativa (até 8); undefined antes de o pipeline os gravar */
  ptSample?: PtComparable[];
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
  /**
   * `false` quando os critérios não identificam um modelo — o alerta nunca
   * poderá casar com nada. Acontece nos alertas antigos, criados quando o
   * formulário de /alertas aceitava texto livre. A UI di-lo em vez de os deixar
   * parados a zero para sempre (ver lib/alert-criteria.ts).
   */
  matchable: boolean;
}

/** Uma família de modelos que existe mesmo na montra — o que o formulário de
 *  /alertas oferece para escolher. */
export interface AlertModelOption {
  makeKey: string;
  modelKey: string;
  /** "Volkswagen Golf" */
  label: string;
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

/** Convite por aceitar, listado em /stand para o dono poder cancelá-lo. */
export interface PendingInvite {
  id: string;
  email: string;
  /** ISO */
  createdAt: string;
  /** ISO */
  expiresAt: string;
}

/**
 * O que a página do convite (`/convite/[id]`) sabe sobre ele. Só o estado
 * `pendente` traz dados — nos outros não há nada que valha a pena mostrar, e
 * o motivo é a informação toda: um convite expirado tem de o dizer, não pode
 * rebentar nem fingir que não existe.
 */
export type InviteView =
  | { status: "pendente"; id: string; email: string; standName: string }
  | { status: "expirado" | "cancelado" | "aceite" | "inexistente" };

/**
 * Estado da subscrição do stand. Cinco, não três: com a Polar ligada há estados
 * que existem de facto e que a UI não pode confundir uns com os outros —
 * "cancelada" ainda dá acesso até ao fim do período pago (e não se lhe pode
 * dizer "renova a X"), e "em_atraso" é um pagamento que falhou, que os Termos
 * tratam como conta **suspensa**, não eliminada (ver /legal/subscricao).
 *
 * `trial` é nosso, não da Polar: o 1.º mês grátis não pede cartão, portanto não
 * existe do lado deles. `expirada` é o único que fecha o acesso — ver
 * `temAcesso` em lib/subscription.ts.
 */
export type SubscriptionStatus = "trial" | "ativa" | "cancelada" | "em_atraso" | "expirada";

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
    /** ISO — fim do trial, do período pago, ou próxima renovação */
    renewsAt: string;
  };
}

// ── Painel ──────────────────────────────────────────────────────
export interface DashboardStats {
  /** oportunidades a compensar no mercado neste momento */
  activeOpportunities: number;
  /** assinaladas nos últimos 7 dias (flagged_at) — não "vistas pelo utilizador" */
  newThisWeek: number;
  /** mediana da poupança por oportunidade — não a soma, ninguém compra todas de uma vez */
  medianSavings: number;
  /** maior poupança entre as oportunidades ativas agora */
  bestSavings: number;
}

export interface CountryInsight {
  country: CountryCode;
  listingCount: number;
  avgSavings: number;
}
