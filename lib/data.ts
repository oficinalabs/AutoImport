"use server";
/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CAMADA DE DADOS — a fronteira frontend ⇄ backend.                │
 * │                                                                   │
 * │  Toda a UI lê os dados APENAS a partir daqui. Módulo "use server":│
 * │  nos RSC as funções correm diretas; nos componentes client as     │
 * │  mutações (toggleFavorite, createAlert…) viram Server Actions.    │
 * │                                                                   │
 * │  Com DATABASE_URL → queries Drizzle reais (lib/queries.ts),       │
 * │  alimentadas pelo pipeline (scripts/pipeline/run-daily.ts).       │
 * │  Sem DATABASE_URL → mock (lib/mock.ts), para previews/dev de UI.  │
 * │  Negociações, compras e stand continuam mock (fora do âmbito do   │
 * │  pipeline — ver docs/07-FRONTEND-HANDOFF.md).                     │
 * └─────────────────────────────────────────────────────────────────┘
 */
import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { auth } from "./auth";
import {
  ALERTS,
  CONVERSATIONS,
  COUNTRY_INSIGHTS,
  DEALS,
  LISTINGS,
  STAND,
  findListing,
} from "./mock";
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
 */
async function activeStandId(): Promise<string | null> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (!session?.user) return null;
    if (session.session.activeOrganizationId) return session.session.activeOrganizationId;
    const orgs = await auth.api.listOrganizations({ headers: await headers() });
    return orgs[0]?.id ?? null;
  } catch {
    return null;
  }
}

/** Simula latência de rede em dev para exercitar estados de loading (mock). */
const DELAY = process.env.NODE_ENV === "development" ? 120 : 0;
function settle<T>(value: T): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(value), DELAY));
}

// ── Pesquisa / anúncios ─────────────────────────────────────────
export interface SearchFilters {
  query?: string;
  countries?: CountryCode[];
  onlyOpportunities?: boolean;
  maxPrice?: number;
  sort?: "savings" | "recent" | "price";
}

export async function searchListings(filters: SearchFilters = {}): Promise<Listing[]> {
  if (hasDb()) return q.searchListingsQuery(filters, await activeStandId());
  // Espelha a query real: a pesquisa só mostra anúncios vivos. Os que saíram do
  // mercado só aparecem nos favoritos, marcados (docs/08).
  let out = LISTINGS.filter((l) => !l.unavailableSince);
  if (filters.query) {
    const query = filters.query.toLowerCase();
    out = out.filter((l) => l.title.toLowerCase().includes(query));
  }
  const wantedCountries = filters.countries;
  if (wantedCountries?.length) {
    out = out.filter((l) => wantedCountries.includes(l.country));
  }
  if (filters.onlyOpportunities) {
    out = out.filter((l) => l.verdict === "compensa");
  }
  const maxPrice = filters.maxPrice;
  if (maxPrice) {
    out = out.filter((l) => l.cost.totalPt <= maxPrice);
  }
  switch (filters.sort) {
    case "price":
      out.sort((a, b) => a.cost.totalPt - b.cost.totalPt);
      break;
    case "recent":
      out.sort((a, b) => b.seenAt.localeCompare(a.seenAt));
      break;
    default:
      out.sort((a, b) => b.savings - a.savings);
  }
  return settle(out);
}

export async function getListing(id: string): Promise<Listing | null> {
  if (hasDb()) return q.getListingQuery(id, await activeStandId());
  return settle(findListing(id) ?? null);
}

export async function getListingsByIds(ids: string[]): Promise<Listing[]> {
  if (hasDb()) return q.getListingsByIdsQuery(ids, await activeStandId());
  return settle(ids.map(findListing).filter((l): l is Listing => Boolean(l)));
}

// ── Painel ──────────────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  if (hasDb()) {
    const counts = await q.dashboardCountsQuery(await activeStandId());
    return {
      newOpportunities: counts.newOpportunities,
      totalPotentialSavings: counts.totalPotentialSavings,
      // negociações continuam mock até existir o email mascarado (docs/06)
      activeNegotiations: CONVERSATIONS.filter((c) => c.status !== "acordo").length,
      activeAlerts: counts.activeAlerts,
    };
  }
  const opportunities = LISTINGS.filter((l) => l.verdict === "compensa" && !l.unavailableSince);
  return settle({
    newOpportunities: opportunities.length,
    totalPotentialSavings: DEALS.reduce((s, d) => s + d.savings, 0),
    activeNegotiations: CONVERSATIONS.filter((c) => c.status !== "acordo").length,
    activeAlerts: ALERTS.filter((a) => a.active).length,
  });
}

export async function getTopOpportunities(limit = 4): Promise<Listing[]> {
  if (hasDb()) return q.topOpportunitiesQuery(limit, await activeStandId());
  return settle(
    LISTINGS.filter((l) => l.verdict === "compensa" && !l.unavailableSince)
      .sort((a, b) => b.savings - a.savings)
      .slice(0, limit),
  );
}

export async function getCountryInsights(): Promise<CountryInsight[]> {
  if (hasDb()) return q.countryInsightsQuery();
  return settle([...COUNTRY_INSIGHTS].sort((a, b) => b.avgSavings - a.avgSavings));
}

// ── Favoritos ───────────────────────────────────────────────────
export async function getFavorites(): Promise<Listing[]> {
  if (hasDb()) {
    const standId = await activeStandId();
    return standId ? q.favoritesQuery(standId) : [];
  }
  // Como na query real: os favoritos que já saíram do mercado aparecem, mas no
  // fim da lista — o que ainda dá para comprar é que interessa primeiro.
  return settle(
    LISTINGS.filter((l) => l.isFavorite).sort(
      (a, b) => Number(Boolean(a.unavailableSince)) - Number(Boolean(b.unavailableSince)),
    ),
  );
}

export async function toggleFavorite(id: string): Promise<void> {
  if (hasDb()) {
    const standId = await activeStandId();
    if (standId) await q.toggleFavoriteMutation(standId, id);
    return;
  }
  return settle(undefined);
}

// ── Alertas ─────────────────────────────────────────────────────
export async function getAlerts(): Promise<Alert[]> {
  if (hasDb()) {
    const standId = await activeStandId();
    return standId ? q.alertsQuery(standId) : [];
  }
  return settle([...ALERTS]);
}

export interface AlertDraft {
  name: string;
  criteria: string;
  countries: CountryCode[];
  maxPrice?: number;
}

export async function createAlert(draft: AlertDraft): Promise<void> {
  if (hasDb()) {
    const standId = await activeStandId();
    if (standId) await q.createAlertMutation(standId, draft);
    return;
  }
  return settle(undefined);
}

export async function toggleAlert(id: string, active: boolean): Promise<void> {
  if (hasDb()) {
    const standId = await activeStandId();
    if (standId) await q.toggleAlertMutation(standId, id, active);
    return;
  }
  return settle(undefined);
}

// ── Negociações (mock — aguarda email mascarado, docs/06) ───────
export async function getConversations(): Promise<Conversation[]> {
  return settle([...CONVERSATIONS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)));
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return settle(CONVERSATIONS.find((c) => c.id === id) ?? null);
}

// TODO(backend): enviar via email mascarado da plataforma (ver docs/06).
export async function sendMessage(_conversationId: string, _body: string): Promise<void> {
  return settle(undefined);
}

// ── Compras (pipeline de negócio — mock) ────────────────────────
export async function getDeals(): Promise<Deal[]> {
  return settle([...DEALS]);
}

export async function getDeal(id: string): Promise<Deal | null> {
  return settle(DEALS.find((d) => d.id === id) ?? null);
}

// ── Stand / conta ───────────────────────────────────────────────
export async function getStand(): Promise<Stand> {
  if (hasDb()) {
    const standId = await activeStandId();
    if (standId) {
      const stand = await q.getStandQuery(standId);
      if (stand) return stand;
    }
  }
  return settle(STAND);
}

// ── Notificações ────────────────────────────────────────────────
/**
 * Matches que os alertas do stand dispararam. Sem BD, ou enquanto o job de
 * alertas não correr, devolve vazio — e o sino mostra o estado vazio. Não
 * inventamos notificações.
 */
export async function getNotifications(): Promise<Notification[]> {
  if (!hasDb()) return settle([]);
  try {
    const standId = await activeStandId();
    if (!standId) return [];
    return await q.notificationsQuery(standId);
  } catch (error) {
    console.error("[notificações] falha ao ler:", error);
    return [];
  }
}

/**
 * Nome e email de quem está com sessão iniciada. Sem sessão (dev/preview sobre
 * mock), devolve o primeiro membro do stand mock — coerente com o getStand().
 */
export async function getSessionUser(): Promise<{ name: string; email: string }> {
  try {
    const session = await auth.api.getSession({ headers: await headers() });
    if (session?.user) {
      return { name: session.user.name, email: session.user.email };
    }
  } catch {
    // cai no mock
  }
  const fallback = STAND.members[0];
  return { name: fallback.name, email: fallback.email };
}

/**
 * Papel do utilizador da sessão no stand ativo ("owner" | "member" | null).
 *
 * Sempre que o `getStand()` cai no mock (sem BD, sem sessão, sem organização)
 * devolvemos "owner" — senão a UI ficava incoerente: dados de exemplo que não
 * se conseguem editar. Isto só decide se o botão aparece; quem manda é o
 * servidor, que volta a verificar o papel em `updateStand()` antes de gravar.
 */
export async function getStandRole(): Promise<string | null> {
  if (!hasDb()) return "owner";
  try {
    const [standId, session] = await Promise.all([
      activeStandId(),
      auth.api.getSession({ headers: await headers() }),
    ]);
    if (!standId || !session?.user) return "owner";
    return q.standRoleQuery(standId, session.user.id);
  } catch {
    return "owner";
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
