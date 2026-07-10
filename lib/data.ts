/**
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  CAMADA DE DADOS — a fronteira frontend ⇄ backend.                │
 * │                                                                   │
 * │  Toda a UI lê os dados APENAS a partir daqui. Hoje devolvem dados │
 * │  mock (lib/mock.ts). O backend só precisa de reescrever o CORPO   │
 * │  destas funções (fetch a Route Handlers, Server Actions, ou query │
 * │  Drizzle) mantendo as ASSINATURAS e os TIPOS. A UI não muda.      │
 * │                                                                   │
 * │  Ver docs/07-FRONTEND-HANDOFF.md para o mapa completo.            │
 * └─────────────────────────────────────────────────────────────────┘
 */
import {
  ALERTS,
  CONVERSATIONS,
  COUNTRY_INSIGHTS,
  DEALS,
  findListing,
  LISTINGS,
  STAND,
} from "./mock";
import type {
  Alert,
  Conversation,
  CountryCode,
  CountryInsight,
  DashboardStats,
  Deal,
  Listing,
  Stand,
} from "./types";

/** Simula latência de rede em dev para exercitar estados de loading. */
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
  // TODO(backend): substituir por query real com filtros no servidor.
  let out = [...LISTINGS];
  if (filters.query) {
    const q = filters.query.toLowerCase();
    out = out.filter((l) => l.title.toLowerCase().includes(q));
  }
  if (filters.countries?.length) {
    out = out.filter((l) => filters.countries!.includes(l.country));
  }
  if (filters.onlyOpportunities) {
    out = out.filter((l) => l.verdict === "compensa");
  }
  if (filters.maxPrice) {
    out = out.filter((l) => l.cost.totalPt <= filters.maxPrice!);
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
  return settle(findListing(id) ?? null);
}

export async function getListingsByIds(ids: string[]): Promise<Listing[]> {
  return settle(ids.map(findListing).filter((l): l is Listing => Boolean(l)));
}

// ── Painel ──────────────────────────────────────────────────────
export async function getDashboardStats(): Promise<DashboardStats> {
  const opportunities = LISTINGS.filter((l) => l.verdict === "compensa");
  return settle({
    newOpportunities: opportunities.length,
    totalPotentialSavings: DEALS.reduce((s, d) => s + d.savings, 0),
    activeNegotiations: CONVERSATIONS.filter((c) => c.status !== "acordo").length,
    activeAlerts: ALERTS.filter((a) => a.active).length,
  });
}

export async function getTopOpportunities(limit = 4): Promise<Listing[]> {
  return settle(
    [...LISTINGS].filter((l) => l.verdict === "compensa").sort((a, b) => b.savings - a.savings).slice(0, limit),
  );
}

export async function getCountryInsights(): Promise<CountryInsight[]> {
  return settle([...COUNTRY_INSIGHTS].sort((a, b) => b.avgSavings - a.avgSavings));
}

// ── Favoritos ───────────────────────────────────────────────────
export async function getFavorites(): Promise<Listing[]> {
  return settle(LISTINGS.filter((l) => l.isFavorite));
}

// TODO(backend): persistir. Hoje é no-op (a UI faz optimistic update local).
export async function toggleFavorite(_id: string): Promise<void> {
  return settle(undefined);
}

// ── Alertas ─────────────────────────────────────────────────────
export async function getAlerts(): Promise<Alert[]> {
  return settle([...ALERTS]);
}

// ── Negociações ─────────────────────────────────────────────────
export async function getConversations(): Promise<Conversation[]> {
  return settle(
    [...CONVERSATIONS].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
  );
}

export async function getConversation(id: string): Promise<Conversation | null> {
  return settle(CONVERSATIONS.find((c) => c.id === id) ?? null);
}

// TODO(backend): enviar via email mascarado da plataforma (ver docs/06).
export async function sendMessage(_conversationId: string, _body: string): Promise<void> {
  return settle(undefined);
}

// ── Compras (pipeline) ──────────────────────────────────────────
export async function getDeals(): Promise<Deal[]> {
  return settle([...DEALS]);
}

export async function getDeal(id: string): Promise<Deal | null> {
  return settle(DEALS.find((d) => d.id === id) ?? null);
}

// ── Stand / conta ───────────────────────────────────────────────
export async function getStand(): Promise<Stand> {
  return settle(STAND);
}
