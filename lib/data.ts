"use server";
/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CAMADA DE DADOS — a fronteira frontend ⇄ backend.                │
 * │                                                                   │
 * │  Toda a UI lê os dados APENAS a partir daqui. Módulo "use server":│
 * │  nos RSC as funções correm diretas; nos componentes client as     │
 * │  mutações (toggleFavorite, createAlert…) viram Server Actions.    │
 * │                                                                   │
 * │  Só dados reais: queries Drizzle (lib/queries.ts), alimentadas    │
 * │  pelo pipeline (scripts/pipeline/run-daily.ts). O mock foi         │
 * │  removido. Negociações e Compras ainda não têm backend → devolvem  │
 * │  vazio, e a UI mostra estado vazio honesto (ver docs/06).          │
 * └─────────────────────────────────────────────────────────────────┘
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { cache } from "react";
import { auth } from "./auth";
import * as q from "./queries";
import { checkStandFields } from "./stand-fields";
import type {
  Alert,
  Conversation,
  CountryCode,
  CountryInsight,
  DashboardStats,
  Deal,
  FuelType,
  Listing,
  Notification,
  Stand,
  Transmission,
} from "./types";

const hasDb = () => Boolean(process.env.DATABASE_URL);

/**
 * Stand (organização) ativo da sessão; null sem sessão/organização.
 * A sessão nem sempre traz activeOrganizationId — fallback para a primeira
 * organização do utilizador (um stand por utilizador, por agora).
 *
 * ⚠️ Envolto em `cache()` do React: quase todas as funções de dados chamam isto
 * (14 sítios), e uma única página chama várias — sem a memoização por-pedido, o
 * `getSession` + `listOrganizations` corria contra a BD 4-6× por render. Com o
 * `cache()`, corre **uma vez por pedido** e o resultado é partilhado.
 */
const activeStandId = cache(async (): Promise<string | null> => {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    if (session.session.activeOrganizationId) return session.session.activeOrganizationId;
    const orgs = await auth.api.listOrganizations({ headers: await headers() });
    return orgs[0]?.id ?? null;
  } catch {
    return null;
  }
});

// ── Pesquisa / anúncios ─────────────────────────────────────────

/**
 * Ordenação da pesquisa. `percentagem` é o default e é uma decisão de produto:
 * ordenar por poupança ABSOLUTA enchia o topo de Lamborghinis (preço médio dos
 * primeiros 60: 147 169 €) quando 87% das oportunidades reais estão abaixo dos
 * 40 000 € e o público-alvo são stands de usados. `savings` continua a existir
 * porque os KPIs do painel são em euros e têm de aterrar na mesma ordem.
 */
export type SearchSort = "percentagem" | "savings" | "recent" | "price";

export interface SearchFilters {
  query?: string;
  countries?: CountryCode[];
  onlyOpportunities?: boolean;
  maxPrice?: number;
  minYear?: number;
  maxKm?: number;
  fuel?: FuelType;
  gearbox?: Transmission;
  sort?: SearchSort;
  /** 1-based. Acima do teto (lib/queries.ts MAX_PAGE) fica preso ao teto. */
  page?: number;
}

/**
 * Uma página de resultados. Devolver `Listing[]` era o contrato antigo, mas sem
 * `total` a UI não tem como dizer a verdade: mostrava o tamanho do array como se
 * fosse o número de anúncios que existem ("60 anúncios" quando havia 6 402).
 */
export interface SearchPage {
  items: Listing[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}

export async function searchListings(filters: SearchFilters = {}): Promise<SearchPage> {
  return q.searchListingsQuery(filters, await activeStandId());
}

export async function getListing(id: string): Promise<Listing | null> {
  return q.getListingQuery(id, await activeStandId());
}

export async function getListingsByIds(ids: string[]): Promise<Listing[]> {
  return q.getListingsByIdsQuery(ids, await activeStandId());
}

// ── Landing (público, sem sessão) ───────────────────────────────
export interface LandingData {
  totalListings: number;
  activeOpportunities: number;
  medianSavings: number;
  bestSavings: number;
  /** ISO — última leitura do pipeline; null se ainda não correu. */
  lastSeenAt: string | null;
  /** Os carros da grelha de oportunidades. */
  featured: Listing[];
  /**
   * O carro que ilustra a conta do ISV — ver `escolherExemploIsv()` para os
   * dois critérios e porque existem. null só se não houver mesmo nenhum
   * anúncio com ISV (stock todo elétrico), e aí a secção não aparece.
   */
  isvExample: Listing | null;
}

/**
 * Km mínimos do carro que ilustra a conta do ISV.
 *
 * Sem isto sai muitas vezes um zero-quilómetros (a melhor oportunidade do dia
 * chegou a ser um Tucson de 2026 com 5 km). O problema não é o carro ser bom —
 * é que a linha que EXPLICA a conta é a «redução por anos de uso», e num carro
 * novo essa linha diz literalmente "novo". A secção chama-se "a conta que
 * ninguém quer fazer" e mostrava a versão da conta que não custa nada fazer.
 *
 * 20 000 km é o ponto a partir do qual um stand olha e vê um usado normal —
 * que é o que os stands realmente importam.
 */
const ISV_EXEMPLO_KM_MIN = 20_000;

/**
 * Escolhe o carro que ilustra o ISV.
 *
 * ⚠️ NÃO é o de maior poupança, e isso é o ponto todo. Há uma correlação
 * incómoda no produto: **quanto MENOR o imposto, maior a poupança** — logo o
 * melhor negócio do dia é sistematicamente a pior lição sobre o ISV. Escolher
 * pelo topo da lista deu, em dias seguidos, um elétrico (ISV 0 €) e um híbrido
 * 1.2 (ISV 518 €, 2% do custo). Uma secção chamada "a conta que ninguém quer
 * fazer" ilustrada com 518 € desmonta-se sozinha.
 *
 * Por isso ordena-se pelo **peso do ISV no custo final**, que é exatamente o
 * número que o componente mostra em título. Entre candidatos igualmente
 * reais (todos vêm de `opportunities`, já filtrados), fica o que ensina mais.
 *
 * Cascata, do melhor caso para o pior:
 *   1. usado (≥ 20 000 km) com imposto, o de maior peso de ISV
 *   2. qualquer um com imposto — pior exemplo, mas ainda ensina de onde vem
 *   3. nenhum → a secção não aparece
 *
 * O passo 2 não é decoração: sem ele, um dia em que o topo do stock fosse todo
 * elétrico ou semi-novo fazia **desaparecer a peça central da landing**. Um
 * filtro que apaga a secção é pior do que um exemplo imperfeito.
 */
function escolherExemploIsv(top: Listing[]): Listing | null {
  const peso = (l: Listing) => (l.cost.totalPt > 0 ? l.cost.isv / l.cost.totalPt : 0);
  const comImposto = top.filter((l) => l.cost.isv > 0);
  const usados = comImposto
    .filter((l) => l.km >= ISV_EXEMPLO_KM_MIN)
    .sort((a, b) => peso(b) - peso(a));
  return usados[0] ?? comImposto[0] ?? null;
}

/**
 * Os números e carros que a landing mostra. **Sem sessão** — é página pública,
 * por isso não passa pelo activeStandId (nenhum destes dados é por stand).
 * A página cacheia o resultado (ver `revalidate` em app/(marketing)/page.tsx):
 * mantém-na rápida sem servir números velhos.
 */
export async function getLandingData(): Promise<LandingData> {
  const [stats, top] = await Promise.all([
    q.landingStatsQuery(),
    // 48: os 8 da fila + um leque largo para o exemplo do ISV. Precisa de ser
    // largo porque os carros com imposto alto estão em baixo desta lista (é
    // ordenada por poupança) — ver `escolherExemploIsv`.
    q.topOpportunitiesQuery(48, null),
  ]);
  return {
    ...stats,
    // 5: a fila passou a carrossel com setas (components/ui/carousel.tsx), e
    // com 4 visíveis de cada vez, 5 deixa exatamente um por revelar — que é o
    // que faz a seta valer a pena. Com 8 ficavam duas páginas e a segunda
    // raramente se via.
    featured: top.slice(0, 5),
    isvExample: escolherExemploIsv(top),
  };
}

// ── Painel ──────────────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  return q.dashboardCountsQuery();
}

export async function getTopOpportunities(limit = 4): Promise<Listing[]> {
  return q.topOpportunitiesQuery(limit, await activeStandId());
}

export async function getCountryInsights(): Promise<CountryInsight[]> {
  return q.countryInsightsQuery();
}

// ── Favoritos ───────────────────────────────────────────────────
export async function getFavorites(): Promise<Listing[]> {
  const standId = await activeStandId();
  return standId ? q.favoritesQuery(standId) : [];
}

export async function toggleFavorite(id: string): Promise<void> {
  const standId = await activeStandId();
  if (standId) await q.toggleFavoriteMutation(standId, id);
}

// ── Alertas ─────────────────────────────────────────────────────
export async function getAlerts(): Promise<Alert[]> {
  const standId = await activeStandId();
  return standId ? q.alertsQuery(standId) : [];
}

export interface AlertDraft {
  name: string;
  criteria: string;
  countries: CountryCode[];
  maxPrice?: number;
  /** Preenchidos quando o alerta nasce de um anúncio (ver
   * components/listing-actions.tsx) — vão para o JSONB de criteria, para o
   * futuro job de matching comparar exato em vez de reanalisar texto livre. */
  make?: string;
  model?: string;
}

export async function createAlert(draft: AlertDraft): Promise<void> {
  const standId = await activeStandId();
  if (standId) await q.createAlertMutation(standId, draft);
}

export async function toggleAlert(id: string, active: boolean): Promise<void> {
  const standId = await activeStandId();
  if (standId) await q.toggleAlertMutation(standId, id, active);
}

// ── Negociações ─────────────────────────────────────────────────
// Ainda sem backend (email mascarado — ver docs/06). Devolvem vazio, e a UI
// mostra o estado "ainda sem negociações". Nunca inventamos conversas.
export async function getConversations(): Promise<Conversation[]> {
  return [];
}

export async function getConversation(_id: string): Promise<Conversation | null> {
  return null;
}

// TODO(backend): enviar via email mascarado da plataforma (ver docs/06).
export async function sendMessage(_conversationId: string, _body: string): Promise<void> {}

// ── Compras ─────────────────────────────────────────────────────
// Ainda sem backend (pipeline de compra). Estado vazio honesto na UI.
export async function getDeals(): Promise<Deal[]> {
  return [];
}

export async function getDeal(_id: string): Promise<Deal | null> {
  return null;
}

// ── Stand / conta ───────────────────────────────────────────────
/**
 * ⚠️ Memoizado por pedido, como o `activeStandId`: o gate da subscrição
 * (components/subscription-gate.tsx) precisa do estado em todas as rotas da
 * app, e o layout já o tinha pedido para a etiqueta da barra de topo. Sem o
 * `cache()` eram duas queries por render em vez de uma.
 *
 * A memoização não pode ficar no export — num módulo "use server" só podem sair
 * funções `async`, e o `cache()` devolve uma função normal.
 */
const standCached = cache(async (): Promise<Stand | null> => {
  const standId = await activeStandId();
  return standId ? q.getStandQuery(standId) : null;
});

/** O stand da sessão, ou null se não houver sessão/organização. */
export async function getStand(): Promise<Stand | null> {
  return standCached();
}

// ── Notificações ────────────────────────────────────────────────
/**
 * Matches que os alertas do stand dispararam. Sem BD, ou enquanto o job de
 * alertas não correr, devolve vazio — e o sino mostra o estado vazio. Não
 * inventamos notificações.
 */
export async function getNotifications(): Promise<Notification[]> {
  try {
    const standId = await activeStandId();
    if (!standId) return [];
    return await q.notificationsQuery(standId);
  } catch (error) {
    console.error("[notificações] falha ao ler:", error);
    return [];
  }
}

/** Nome e email de quem está com sessão iniciada; null sem sessão. */
export async function getSessionUser(): Promise<{ name: string; email: string } | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    return session?.user ? { name: session.user.name, email: session.user.email } : null;
  } catch {
    return null;
  }
}

/** Papel do utilizador da sessão no stand ativo ("owner" | "member"); null se
 * não houver sessão/organização. Decide só se o botão de editar aparece — quem
 * manda é o servidor, que revalida o papel em `updateStand()` antes de gravar. */
export async function getStandRole(): Promise<string | null> {
  try {
    const [standId, session] = await Promise.all([
      activeStandId(),
      auth.api.getSession({ headers: await headers() }),
    ]);
    if (!standId || !session?.user) return null;
    return q.standRoleQuery(standId, session.user.id);
  } catch {
    return null;
  }
}

export type UpdateStandResult = { ok: true } | { ok: false; error: string };

/**
 * Grava os dados do stand. Server Action — chamada do formulário em /stand.
 * Só o **dono** pode alterar, e só a organização da PRÓPRIA sessão: o standId
 * nunca vem do cliente, é resolvido aqui a partir da sessão.
 */
export async function updateStand(input: {
  name: string;
  nif: string;
  address: string;
  phone: string;
}): Promise<UpdateStandResult> {
  if (!hasDb()) return { ok: false, error: "Base de dados indisponível." };

  const standId = await activeStandId();
  if (!standId) return { ok: false, error: "Sessão inválida. Entra outra vez." };

  const check = checkStandFields(input);
  if (check) return { ok: false, error: check };

  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return { ok: false, error: "Sessão inválida. Entra outra vez." };

    const role = await q.standRoleQuery(standId, session.user.id);
    if (role !== "owner") {
      return { ok: false, error: "Só o dono do stand pode alterar estes dados." };
    }

    await q.updateStandMutation(standId, {
      name: input.name.trim(),
      nif: input.nif.trim(),
      address: input.address.trim(),
      phone: input.phone.trim(),
    });
    revalidatePath("/stand");
    return { ok: true };
  } catch (error) {
    // Nunca devolver o erro cru ao cliente (pode trazer SQL/tabelas) — ver CLAUDE.md.
    console.error("[stand] falha ao gravar:", error);
    return { ok: false, error: "Não foi possível gravar. Tenta outra vez." };
  }
}
