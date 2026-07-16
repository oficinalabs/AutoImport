/**
 * Queries Drizzle (só servidor) que produzem os tipos do contrato
 * lib/types.ts a partir de listings ⋈ import_cost_estimates ⋈ vehicle_models.
 * Consumidas exclusivamente por lib/data.ts ("use server").
 */
import { and, desc, eq, ilike, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db";
import {
  alertEvents,
  alerts,
  favorites,
  importCostEstimates,
  listings,
  member,
  opportunities,
  organization,
  sources,
  usVersions,
  user,
  vehicleModels,
} from "../db/schema";
import { co2Norm } from "./cost-engine";
import type { SearchFilters } from "./data";
import { ptPriceHistory } from "./engine/pt-market";
import type {
  Alert,
  CostBreakdown,
  CountryCode,
  CountryInsight,
  FuelType,
  Listing,
  Notification,
  Stand,
  Transmission,
  Verdict,
} from "./types";

const SEARCH_LIMIT = 60;

// ── Mapper ───────────────────────────────────────────────────────

type ListingRow = typeof listings.$inferSelect;
type EstimateRow = typeof importCostEstimates.$inferSelect;
type ModelRow = typeof vehicleModels.$inferSelect;
type VersionRow = typeof usVersions.$inferSelect;

function transmissionOf(gearbox: string | null): Transmission {
  return gearbox && /auto/i.test(gearbox) ? "automática" : "manual";
}

function rowToListing(
  l: ListingRow,
  e: EstimateRow,
  vm: ModelRow,
  usv: VersionRow | null,
  sourceName: string | null,
  isFavorite: boolean,
  history: { month: string; price: number }[] = [],
): Listing {
  const cost: CostBreakdown = {
    originPrice: e.originPrice,
    transport: e.transport,
    isv: e.isv,
    iuc: e.iuc,
    legalization: e.legalization,
    totalPt: e.totalPt,
  };
  // Fallbacks de display: valor do anúncio → versão confirmada do catálogo →
  // mediana do vehicle_models (último recurso; pode misturar trims). O CO₂ da
  // versão segue a norma do ano de matrícula (WLTP/NEDC).
  const ver = usv && l.matchConfidence === "confirmado" ? usv : null;
  const verCo2 = ver
    ? co2Norm(l.year ?? new Date().getFullYear()) === "wltp"
      ? ver.co2Wltp
      : ver.co2Nedc
    : null;
  return {
    id: l.id,
    model: {
      id: vm.id,
      make: l.makeRaw ?? vm.make,
      model: l.modelRaw ?? vm.model,
      variant: l.variant ?? undefined,
      fuel: (l.fuel ?? vm.fuel) as FuelType,
      transmission: transmissionOf(l.gearbox),
      displacementCc: l.displacementCc ?? ver?.displacementCc ?? vm.displacementCc ?? undefined,
      co2: l.co2 ?? verCo2 ?? vm.co2 ?? undefined,
      powerHp: l.powerHp ?? ver?.powerHp ?? vm.powerHp ?? undefined,
    },
    title: [l.makeRaw, l.variant ?? l.modelRaw].filter(Boolean).join(" ") || "Anúncio",
    year: l.year ?? 0,
    km: l.km ?? 0,
    color: l.color ?? undefined,
    country: l.country as CountryCode,
    source: sourceName ?? l.sourceSite,
    sourceUrl: l.detailUrl ?? undefined,
    images: l.imageUrl ? [l.imageUrl] : [],
    cost,
    ptMarket: {
      estimatedPrice: e.ptEstimatedPrice,
      sampleSize: e.ptSampleSize,
      history,
    },
    savings: e.savings,
    savingsPct: e.savingsPct,
    verdict: e.verdict as Verdict,
    kmTrust: l.vin ? { level: "disponivel", source: "VIN" } : { level: "por_verificar" },
    seenAt: l.lastSeenAt.toISOString(),
    isFavorite,
    unavailableSince: l.deletedAt?.toISOString(),
  };
}

/** Junta as 4 peças de um Listing; devolve linhas cruas para o mapper. */
function baseSelect(standId: string | null) {
  return db
    .select({
      l: listings,
      e: importCostEstimates,
      vm: vehicleModels,
      usv: usVersions,
      sourceName: sources.name,
      favoriteId: favorites.id,
    })
    .from(listings)
    .innerJoin(importCostEstimates, eq(importCostEstimates.listingId, listings.id))
    .innerJoin(vehicleModels, eq(vehicleModels.id, listings.modelId))
    .leftJoin(usVersions, eq(usVersions.versionId, listings.usVersionId))
    .leftJoin(sources, eq(sources.id, listings.sourceId))
    .leftJoin(
      favorites,
      and(eq(favorites.listingId, listings.id), eq(favorites.standId, standId ?? "")),
    );
}

type BaseRow = Awaited<ReturnType<ReturnType<typeof baseSelect>["execute"]>>[number];

const toListing = (r: BaseRow, history: { month: string; price: number }[] = []) =>
  rowToListing(r.l, r.e, r.vm, r.usv, r.sourceName, r.favoriteId != null, history);

// ── Pesquisa / detalhe ───────────────────────────────────────────

export async function searchListingsQuery(
  filters: SearchFilters,
  standId: string | null,
): Promise<Listing[]> {
  const conds = [isNull(listings.deletedAt)];
  if (filters.query) {
    const q = `%${filters.query}%`;
    const textMatch = or(
      ilike(listings.makeRaw, q),
      ilike(listings.modelRaw, q),
      ilike(listings.variant, q),
    );
    if (textMatch) conds.push(textMatch);
  }
  if (filters.countries?.length) conds.push(inArray(listings.country, filters.countries));
  if (filters.onlyOpportunities) conds.push(eq(importCostEstimates.verdict, "compensa"));
  if (filters.maxPrice) conds.push(lte(importCostEstimates.totalPt, filters.maxPrice));

  const orderBy =
    filters.sort === "price"
      ? importCostEstimates.totalPt
      : filters.sort === "recent"
        ? desc(listings.lastSeenAt)
        : desc(importCostEstimates.savings);

  const rows = await baseSelect(standId)
    .where(and(...conds))
    .orderBy(orderBy)
    .limit(SEARCH_LIMIT);
  return rows.map((r) => toListing(r));
}

export async function getListingQuery(id: string, standId: string | null): Promise<Listing | null> {
  const rows = await baseSelect(standId).where(eq(listings.id, id)).limit(1);
  const row = rows[0];
  if (!row) return null;
  const history = row.l.modelId ? await ptPriceHistory(db, row.l.modelId) : [];
  return toListing(row, history);
}

export async function getListingsByIdsQuery(
  ids: string[],
  standId: string | null,
): Promise<Listing[]> {
  if (!ids.length) return [];
  const rows = await baseSelect(standId).where(inArray(listings.id, ids));
  const byId = new Map(rows.map((r) => [r.l.id, r]));
  return ids.flatMap((id) => {
    const r = byId.get(id);
    return r ? [toListing(r)] : [];
  });
}

// ── Painel ───────────────────────────────────────────────────────

export async function topOpportunitiesQuery(
  limit: number,
  standId: string | null,
): Promise<Listing[]> {
  const rows = await baseSelect(standId)
    .innerJoin(
      opportunities,
      and(eq(opportunities.listingId, listings.id), isNull(opportunities.deletedAt)),
    )
    .where(isNull(listings.deletedAt))
    .orderBy(desc(opportunities.savings))
    .limit(limit);
  return rows.map((r) => toListing(r));
}

export interface DashboardCounts {
  newOpportunities: number;
  totalPotentialSavings: number;
  activeAlerts: number;
}

export async function dashboardCountsQuery(standId: string | null): Promise<DashboardCounts> {
  const [opp] = await db
    .select({
      recent: sql<number>`count(*) filter (where flagged_at > now() - interval '24 hours')::int`,
      savings: sql<number>`coalesce(sum(savings), 0)::int`,
    })
    .from(opportunities)
    .where(isNull(opportunities.deletedAt));
  const [al] = standId
    ? await db
        .select({ n: sql<number>`count(*)::int` })
        .from(alerts)
        .where(and(eq(alerts.standId, standId), eq(alerts.active, true)))
    : [{ n: 0 }];
  return {
    newOpportunities: opp.recent,
    totalPotentialSavings: opp.savings,
    activeAlerts: al.n,
  };
}

export async function countryInsightsQuery(): Promise<CountryInsight[]> {
  const rows = await db
    .select({
      country: listings.country,
      listingCount: sql<number>`count(*)::int`,
      avgSavings: sql<number>`round(avg(${importCostEstimates.savings}))::int`,
    })
    .from(listings)
    .innerJoin(importCostEstimates, eq(importCostEstimates.listingId, listings.id))
    .where(isNull(listings.deletedAt))
    .groupBy(listings.country)
    .orderBy(desc(sql`avg(${importCostEstimates.savings})`));
  return rows
    .filter((r): r is typeof r & { country: CountryCode } => r.country !== "PT")
    .map((r) => ({ country: r.country, listingCount: r.listingCount, avgSavings: r.avgSavings }));
}

// ── Favoritos ────────────────────────────────────────────────────

/**
 * Favoritos do stand, **incluindo os que já saíram do mercado**.
 *
 * Ao contrário da pesquisa, aqui não filtramos `deleted_at`: o stand marcou
 * aquele carro por alguma razão, e fazê-lo desaparecer sem explicação é pior do
 * que mostrá-lo marcado como indisponível (decisão em docs/08). Os mortos vão
 * para o fim da lista — o que ainda dá para comprar é que interessa primeiro.
 */
export async function favoritesQuery(standId: string): Promise<Listing[]> {
  const rows = await baseSelect(standId)
    .where(sql`${favorites.id} is not null`)
    .orderBy(sql`${listings.deletedAt} is not null`, desc(favorites.createdAt));
  return rows.map((r) => toListing(r));
}

export async function toggleFavoriteMutation(standId: string, listingId: string): Promise<void> {
  const existing = await db
    .select({ id: favorites.id })
    .from(favorites)
    .where(and(eq(favorites.standId, standId), eq(favorites.listingId, listingId)))
    .limit(1);
  if (existing.length) {
    await db.delete(favorites).where(eq(favorites.id, existing[0].id));
  } else {
    await db.insert(favorites).values({ standId, listingId }).onConflictDoNothing();
  }
}

// ── Alertas ──────────────────────────────────────────────────────

interface AlertCriteria {
  summary?: string;
  maxPrice?: number;
}

export async function alertsQuery(standId: string): Promise<Alert[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.standId, standId))
    .orderBy(desc(alerts.createdAt));
  return rows.map((a) => {
    const criteria = (a.criteria ?? {}) as AlertCriteria;
    return {
      id: a.id,
      name: a.name,
      criteria: criteria.summary ?? a.name,
      countries: (a.countries ?? []) as CountryCode[],
      active: a.active,
      matchCount: 0, // preenchido quando o job de matching de alertas existir
      lastMatchAt: undefined,
    };
  });
}

export async function createAlertMutation(
  standId: string,
  draft: { name: string; criteria: string; countries: CountryCode[]; maxPrice?: number },
): Promise<void> {
  await db.insert(alerts).values({
    standId,
    name: draft.name,
    criteria: { summary: draft.criteria, maxPrice: draft.maxPrice } satisfies AlertCriteria,
    countries: draft.countries,
    active: true,
  });
}

export async function toggleAlertMutation(
  standId: string,
  alertId: string,
  active: boolean,
): Promise<void> {
  await db
    .update(alerts)
    .set({ active })
    .where(and(eq(alerts.id, alertId), eq(alerts.standId, standId)));
}

// ── Notificações ────────────────────────────────────────────────
/**
 * O que o sino mostra: os matches que os alertas do stand já dispararam.
 * É a única fonte real de notificações que existe (alert_events) — enquanto
 * o job de alertas não correr, isto devolve vazio, e o sino diz isso.
 */
export async function notificationsQuery(standId: string, limit = 8): Promise<Notification[]> {
  const rows = await db
    .select({
      id: alertEvents.id,
      sentAt: alertEvents.sentAt,
      alertName: alerts.name,
      listingId: listings.id,
      make: listings.makeRaw,
      model: listings.modelRaw,
      year: listings.year,
    })
    .from(alertEvents)
    .innerJoin(alerts, eq(alerts.id, alertEvents.alertId))
    .innerJoin(listings, eq(listings.id, alertEvents.listingId))
    .where(eq(alerts.standId, standId))
    .orderBy(desc(alertEvents.sentAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    alertName: r.alertName,
    listingId: r.listingId,
    title: [r.make, r.model, r.year].filter(Boolean).join(" ") || "Anúncio",
    sentAt: r.sentAt.toISOString(),
  }));
}

// ── Stand / conta ───────────────────────────────────────────────
/** Duração do 1.º mês grátis, em dias. */
const TRIAL_DAYS = 30;

export async function getStandQuery(standId: string): Promise<Stand | null> {
  const [org] = await db.select().from(organization).where(eq(organization.id, standId)).limit(1);
  if (!org) return null;

  const rows = await db
    .select({ id: user.id, name: user.name, email: user.email, role: member.role })
    .from(member)
    .innerJoin(user, eq(user.id, member.userId))
    .where(eq(member.organizationId, standId))
    .orderBy(desc(member.role)); // owner antes de member

  // Sem Polar ligado, a subscrição deriva da data de criação: 1.º mês grátis
  // a contar do registo. É o que é verdade hoje — não inventamos "ativa".
  const renewsAt = new Date(org.createdAt);
  renewsAt.setDate(renewsAt.getDate() + TRIAL_DAYS);

  return {
    id: org.id,
    name: org.name,
    nif: org.nif ?? "",
    address: org.address ?? "",
    phone: org.phone ?? "",
    members: rows.map((r) => ({
      id: r.id,
      name: r.name,
      email: r.email,
      role: r.role === "owner" ? "owner" : "member",
    })),
    subscription: {
      status: renewsAt.getTime() > Date.now() ? "trial" : "expirada",
      pricePerMonth: 100, // euros (formatEuroCents não divide — só mostra cêntimos)
      renewsAt: renewsAt.toISOString(),
    },
  };
}

/** Papel do utilizador no stand; null se não for membro. */
export async function standRoleQuery(standId: string, userId: string): Promise<string | null> {
  const [row] = await db
    .select({ role: member.role })
    .from(member)
    .where(and(eq(member.organizationId, standId), eq(member.userId, userId)))
    .limit(1);
  return row?.role ?? null;
}

export async function updateStandMutation(
  standId: string,
  data: { name: string; nif: string; address: string; phone: string },
): Promise<void> {
  await db
    .update(organization)
    .set({
      name: data.name,
      nif: data.nif || null,
      address: data.address || null,
      phone: data.phone || null,
      updatedAt: new Date(),
    })
    .where(eq(organization.id, standId));
}
