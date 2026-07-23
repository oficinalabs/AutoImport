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
  Listing,
  Notification,
  Stand,
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
export interface SearchFilters {
  query?: string;
  countries?: CountryCode[];
  onlyOpportunities?: boolean;
  maxPrice?: number;
  sort?: "savings" | "recent" | "price";
}

export async function searchListings(filters: SearchFilters = {}): Promise<Listing[]> {
  return q.searchListingsQuery(filters, await activeStandId());
}

export async function getListing(id: string): Promise<Listing | null> {
  return q.getListingQuery(id, await activeStandId());
}

export async function getListingsByIds(ids: string[]): Promise<Listing[]> {
  return q.getListingsByIdsQuery(ids, await activeStandId());
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
/** O stand da sessão, ou null se não houver sessão/organização. */
export async function getStand(): Promise<Stand | null> {
  const standId = await activeStandId();
  return standId ? q.getStandQuery(standId) : null;
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
