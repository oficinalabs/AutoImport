/**
 * Queries Drizzle (só servidor) que produzem os tipos do contrato
 * lib/types.ts a partir de listings ⋈ import_cost_estimates ⋈ vehicle_models.
 * Consumidas exclusivamente por lib/data.ts ("use server").
 */
import {
  type SQL,
  and,
  asc,
  desc,
  eq,
  gte,
  ilike,
  inArray,
  isNull,
  lte,
  or,
  sql,
} from "drizzle-orm";
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
  subscriptions,
  usModels,
  usVersions,
  user,
  vehicleModels,
} from "../db/schema";
import { co2Norm } from "./cost-engine";
import type { SearchFilters, SearchPage } from "./data";
import { carIdentitySql } from "./engine/car-identity";
import { ptPriceHistory } from "./engine/pt-market";
import { CONDICOES } from "./legal";
import { estadoEfetivo } from "./subscription";
import type {
  Alert,
  CostBreakdown,
  CountryCode,
  CountryInsight,
  FuelType,
  Listing,
  Notification,
  PtMarket,
  Stand,
  SubscriptionStatus,
  Transmission,
  Verdict,
} from "./types";

/** Anúncios por página. 24 divide certo nas grelhas de 2, 3 e 4 colunas da pesquisa. */
export const PAGE_SIZE = 24;
/**
 * Teto de profundidade. `?pagina=99999` faria o Postgres percorrer a montra
 * inteira para devolver zero linhas, e não há caso de uso: quem chega ao carro
 * 5 000.º precisa de filtrar melhor, não de outra página.
 */
export const MAX_PAGE = 200;

// ── Mapper ───────────────────────────────────────────────────────

type ListingRow = typeof listings.$inferSelect;
type EstimateRow = typeof importCostEstimates.$inferSelect;
type ModelRow = typeof vehicleModels.$inferSelect;
type VersionRow = typeof usVersions.$inferSelect;
type UsModelRow = typeof usModels.$inferSelect;

function transmissionOf(gearbox: string | null): Transmission {
  return gearbox && /auto/i.test(gearbox) ? "automática" : "manual";
}

/** Nome do modelo do catálogo sem o ruído de slug — "208 II (2023)" → "208 II". */
function cleanCatalogModel(model: string): string {
  return model.replace(/\s*\([^)]*\)/g, "").trim();
}

/** Nome da versão sem o código de chassis à cabeça — "G16 8 Series Gran Coupe
 * 840d xDrive" → "8 Series Gran Coupe 840d xDrive". Só remove tokens
 * letra+dígitos iniciais (G16, W213, E65); nunca um nome-modelo como "208". */
function cleanVersionName(name: string): string {
  return name.replace(/^(?:[a-z]{1,2}\d{1,3}[a-z]?\s+)+/i, "").trim() || name;
}

/**
 * Foto do anúncio pronta para <img>: só URLs https absolutos (o santogal grava
 * caminhos relativos até ao próximo crawl — ver tools/collector/santogal/parse.ts).
 * Nas fotos do CDN do AutoScout24 (usado também pelo autotrader.nl) sobe a
 * miniatura 250x188 para 640x480 — é o mesmo URL, só muda o sufixo, e a 250 fica
 * desfocada no cartão.
 */
function listingPhoto(url: string | null): string[] {
  if (!url?.startsWith("https://")) return [];
  return [url.replace(/\/250x188\.webp$/, "/640x480.webp")];
}

function rowToListing(
  l: ListingRow,
  e: EstimateRow,
  vm: ModelRow,
  usv: VersionRow | null,
  usm: UsModelRow | null,
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
  // Fallbacks de display: valor do anúncio → versão exata do catálogo → factos
  // da designação → mediana do vehicle_models (último recurso; pode misturar
  // trims). O CO₂ (versão ou factos) segue a norma do ano de matrícula (WLTP/NEDC).
  const ver = usv && l.matchConfidence === "exato" ? usv : null;
  const facts = l.matchConfidence === "designacao" ? l.designationFacts : null;
  const norm = co2Norm(l.year ?? new Date().getFullYear());
  const verCo2 = ver ? (norm === "wltp" ? ver.co2Wltp : ver.co2Nedc) : null;
  const factsCo2 = facts ? (norm === "wltp" ? facts.co2Wltp : facts.co2Nedc) : null;
  return {
    id: l.id,
    model: {
      id: vm.id,
      make: l.makeRaw ?? vm.make,
      model: l.modelRaw ?? vm.model,
      variant: l.variant ?? undefined,
      fuel: (l.fuel ?? vm.fuel) as FuelType,
      transmission: transmissionOf(l.gearbox),
      displacementCc:
        l.displacementCc ??
        ver?.displacementCc ??
        facts?.displacementCc ??
        vm.displacementCc ??
        undefined,
      co2: l.co2 ?? verCo2 ?? factsCo2 ?? vm.co2 ?? undefined,
      powerHp: l.powerHp ?? ver?.powerHp ?? facts?.powerHp ?? vm.powerHp ?? undefined,
    },
    // Título: preferir o catálogo ultimatespecs — nome canónico da versão
    // (exato) ou modelo+potência (designacao) em vez do texto cru do anúncio
    // ("BMW BMW 2 SERIES…"). Sem match de catálogo, fica o título cru de sempre.
    // A imagem do catálogo é só o fallback da capa (ver `images`).
    title:
      (ver && usm
        ? `${usm.make} ${cleanVersionName(ver.name)}`
        : facts && usm
          ? [
              `${usm.make} ${cleanCatalogModel(usm.model)}`,
              facts.powerHp ? `${facts.powerHp} cv` : null,
            ]
              .filter(Boolean)
              .join(" ")
          : null) ??
      ([l.makeRaw, l.variant ?? l.modelRaw].filter(Boolean).join(" ") || "Anúncio"),
    year: l.year ?? 0,
    km: l.km ?? 0,
    color: l.color ?? undefined,
    country: l.country as CountryCode,
    source: sourceName ?? l.sourceSite,
    sourceUrl: l.detailUrl ?? undefined,
    images: listingPhoto(l.imageUrl),
    catalogImage:
      (ver ? (ver.imageUrl ?? usm?.imageUrls?.[0]) : facts ? usm?.imageUrls?.[0] : null) ??
      undefined,
    cost,
    ptMarket: {
      estimatedPrice: e.ptEstimatedPrice,
      sampleSize: e.ptSampleSize,
      confidence: e.ptConfidence as PtMarket["confidence"],
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

// As condições dos 6 joins que compõem um Listing, em constantes. O encadeado do
// Drizzle não se deixa envolver numa função genérica (os tipos do builder mudam a
// cada `.innerJoin`), por isso `baseSelect` e `searchSelect` repetem a cadeia —
// mas as CONDIÇÕES, que é onde uma divergência daria resultados diferentes em
// silêncio, vivem aqui e só aqui.
const J_ESTIMATE = eq(importCostEstimates.listingId, listings.id);
const J_MODEL = eq(vehicleModels.id, listings.modelId);
const J_VERSION = eq(usVersions.versionId, listings.usVersionId);
/** Modelo do catálogo para nome/imagem: via versão exata, senão via o mid dos
 *  factos de designação (não-nulo ⟺ designacao com modelo único). */
const J_US_MODEL = sql`${usModels.mid} = coalesce(${usVersions.mid}, ${listings.designationFacts}->>'mid')`;
const J_SOURCE = eq(sources.id, listings.sourceId);
const jFavorite = (standId: string | null) =>
  and(eq(favorites.listingId, listings.id), eq(favorites.standId, standId ?? ""));

const LISTING_COLUMNS = {
  l: listings,
  e: importCostEstimates,
  vm: vehicleModels,
  usv: usVersions,
  usm: usModels,
  sourceName: sources.name,
  favoriteId: favorites.id,
};

/** Junta as 4 peças de um Listing; devolve linhas cruas para o mapper. */
function baseSelect(standId: string | null) {
  return db
    .select(LISTING_COLUMNS)
    .from(listings)
    .innerJoin(importCostEstimates, J_ESTIMATE)
    .innerJoin(vehicleModels, J_MODEL)
    .leftJoin(usVersions, J_VERSION)
    .leftJoin(usModels, J_US_MODEL)
    .leftJoin(sources, J_SOURCE)
    .leftJoin(favorites, jFavorite(standId));
}

/**
 * Igual ao `baseSelect`, mais o total do conjunto filtrado.
 *
 * `count(*) over()` corre depois do WHERE e antes do LIMIT, portanto dá o total
 * verdadeiro sem uma segunda passagem pelo dedupe, que é a parte cara. Não está
 * no `baseSelect` de propósito: a janela obriga a materializar o conjunto todo e
 * tirava o early-stop ao `topOpportunitiesQuery`, que só quer os primeiros N.
 * `::int` porque o driver devolveria o bigint do `count()` como string.
 */
function searchSelect(standId: string | null) {
  return db
    .select({ ...LISTING_COLUMNS, total: sql<number>`count(*) over()::int` })
    .from(listings)
    .innerJoin(importCostEstimates, J_ESTIMATE)
    .innerJoin(vehicleModels, J_MODEL)
    .leftJoin(usVersions, J_VERSION)
    .leftJoin(usModels, J_US_MODEL)
    .leftJoin(sources, J_SOURCE)
    .leftJoin(favorites, jFavorite(standId));
}

type BaseRow = Awaited<ReturnType<ReturnType<typeof baseSelect>["execute"]>>[number];

const toListing = (r: BaseRow, history: { month: string; price: number }[] = []) =>
  rowToListing(r.l, r.e, r.vm, r.usv, r.usm, r.sourceName, r.favoriteId != null, history);

// ── Pesquisa / detalhe ───────────────────────────────────────────

/** Superfícies de descoberta só mostram anúncios com match EXATO ao ultimatespecs
 * (decisão de produto, 21 jul): certeza absoluta de modelo+motor+versão — a
 * designacao (motor provado, variante entre gémeas) fica de fora da montra.
 * Exige TAMBÉM confiança `normal` na estimativa PT (amostra fechada, não a
 * `alargada`) — alinhado com o flag-opportunities: a montra não mostra margens
 * assentes em amostras esticadas. Favoritos/detalhe/comparar continuam a abrir
 * itens já guardados (desaparecer sem explicação é pior — docs/08). */
/** Os dois valores em SQL cru, para o publicador (scripts/pipeline/publish.ts) publicar
 *  exatamente o conjunto que a montra mostra. Mudar a regra aqui muda-a nos dois sítios. */
export const MONTRA_MATCH_CONFIDENCE = "exato";
export const MONTRA_PT_CONFIDENCE = "normal";

const COM_CATALOGO = and(
  eq(listings.matchConfidence, MONTRA_MATCH_CONFIDENCE),
  eq(importCostEstimates.ptConfidence, MONTRA_PT_CONFIDENCE),
);

/**
 * Dedupe da pesquisa por CARRO físico (ver lib/engine/car-identity.ts): o mesmo
 * Tucson listado por caetano.pt e carplus.pt (chassis igual no slug do URL, preço
 * e km ligeiramente diferentes) aparecia 2×. Fica só o REPRESENTANTE de cada
 * identidade: o de maior savings, desempate pelo id mais baixo.
 *
 * Era um `not exists` correlacionado. Para CADA linha candidata voltava a juntar
 * listings×estimates e a calcular a identidade — que inclui um `substring(… from
 * '<regex>')` sobre o `detail_url` — dos DOIS lados. Não é sargável, não há índice
 * que a cubra, e como o corte tem de ser anterior ao LIMIT, o custo era a montra
 * inteira por linha (medido: 3,4 s numa versão simplificada sobre 600k anúncios).
 *
 * O `distinct on` responde à mesma pergunta numa passagem só, e é exatamente a
 * forma que o `flag-opportunities.ts` já usa para a mesma identidade. A semântica
 * é idêntica, não aproximada: `order by <identidade>, savings desc, id` elege o
 * mesmo vencedor que o "não existe outro que ganhe" elegia.
 *
 * Restrito ao MESMO conjunto visível da montra (não-apagado, exato, normal) para
 * não esconder um anúncio bom por causa de um duplicado que a montra nem mostra.
 */
const MONTRA_REPRESENTANTES = sql`(
  select distinct on (${carIdentitySql("l")}) l.id
  from listings l
  join import_cost_estimates e on e.listing_id = l.id
  where l.deleted_at is null
    and l.match_confidence = ${MONTRA_MATCH_CONFIDENCE}
    and e.pt_confidence = ${MONTRA_PT_CONFIDENCE}
  order by ${carIdentitySql("l")}, e.savings desc, l.id
)`;

const E_REPRESENTANTE = sql`${listings.id} in ${MONTRA_REPRESENTANTES}`;

/**
 * Texto livre → SQL. Cada token tem de aparecer em ALGUM campo (AND entre tokens,
 * OR entre campos).
 *
 * Duas correções face ao `ilike '%<query inteira>%'` de antes:
 *
 *  1. **Tokens.** "bmw 220d" procurava a string inteira numa só coluna e não
 *     casava com nada — a marca está em `make_raw` e o "220d" na `variant`.
 *  2. **O catálogo entra.** O servidor procurava só no texto CRU do anúncio, mas
 *     o título que o cartão mostra é construído do ultimatespecs (ver
 *     `rowToListing`). Procurar "Gran Coupe", que aparece em dezenas de cartões,
 *     dava zero. O `baseSelect` já faz left join a `us_models`/`us_versions` —
 *     é só incluí-los.
 *
 * Teto de 6 tokens: além disso é ruído, e cada token são 6 `ilike`.
 */
function textoSql(query: string): SQL | undefined {
  const tokens = query.trim().split(/\s+/).filter(Boolean).slice(0, 6);
  if (!tokens.length) return undefined;
  return and(
    ...tokens.map((token) => {
      const q = `%${token}%`;
      return or(
        ilike(listings.makeRaw, q),
        ilike(listings.modelRaw, q),
        ilike(listings.variant, q),
        ilike(usModels.make, q),
        ilike(usModels.model, q),
        ilike(usVersions.name, q),
      );
    }),
  );
}

/**
 * Caixa em SQL, fiel ao `transmissionOf` que decide o que o CARTÃO mostra —
 * incluindo a parte errada: `gearbox` nulo conta como manual. Não é a
 * classificação certa (um DSG cai em "manual"), mas nesta fase o filtro não pode
 * contradizer o cartão: filtrar "Manual" e receber um cartão a dizer "Automática"
 * destrói a confiança no produto todo. A correção a sério é uma coluna
 * `gearbox_norm` escrita pelo `normGearbox` (lib/engine/us-catalog.ts), que
 * arruma o cartão e o filtro de uma vez — fica para uma migration própria.
 */
function caixaSql(gearbox: Transmission): SQL {
  return gearbox === "automática"
    ? sql`${listings.gearbox} ilike '%auto%'`
    : sql`(${listings.gearbox} is null or ${listings.gearbox} not ilike '%auto%')`;
}

/**
 * ORDER BY com **ordem total**: sem o `id` no fim, linhas com o mesmo valor
 * (savings é inteiro em euros, repete muito) podiam trocar de posição entre
 * pedidos, e a paginação por offset saltava ou repetia carros em silêncio.
 */
function ordemSql(sort: SearchFilters["sort"]): SQL[] {
  const criterio =
    sort === "price"
      ? asc(importCostEstimates.totalPt)
      : sort === "recent"
        ? desc(listings.lastSeenAt)
        : sort === "savings"
          ? desc(importCostEstimates.savings)
          : desc(importCostEstimates.savingsPct);
  return [criterio, asc(listings.id)];
}

export async function searchListingsQuery(
  filters: SearchFilters,
  standId: string | null,
): Promise<SearchPage> {
  const conds = [isNull(listings.deletedAt), COM_CATALOGO, E_REPRESENTANTE];
  if (filters.query) {
    const texto = textoSql(filters.query);
    if (texto) conds.push(texto);
  }
  if (filters.countries?.length) conds.push(inArray(listings.country, filters.countries));
  if (filters.onlyOpportunities) conds.push(eq(importCostEstimates.verdict, "compensa"));
  if (filters.maxPrice) conds.push(lte(importCostEstimates.totalPt, filters.maxPrice));
  if (filters.minYear) conds.push(gte(listings.year, filters.minYear));
  if (filters.maxKm) conds.push(lte(listings.km, filters.maxKm));
  if (filters.fuel) conds.push(eq(listings.fuel, filters.fuel));
  if (filters.gearbox) conds.push(caixaSql(filters.gearbox));

  const page = Math.min(Math.max(filters.page ?? 1, 1), MAX_PAGE);

  const rows = await searchSelect(standId)
    .where(and(...conds))
    .orderBy(...ordemSql(filters.sort))
    .limit(PAGE_SIZE)
    .offset((page - 1) * PAGE_SIZE);

  // O `count(*) over()` viaja NAS linhas — numa página vazia não vem nenhum, e o
  // total ficava 0. Quem aterrasse numa página fora do conjunto (link antigo,
  // stock que encolheu) via "0 anúncios" e perdia a paginação com que voltar
  // atrás. Nesse caso — e só nesse — vale a pena a segunda ida à base.
  const total =
    rows[0]?.total ??
    (page > 1 ? (await searchListingsQuery({ ...filters, page: 1 }, standId)).total : 0);

  return {
    items: rows.map((r) => toListing(r)),
    total,
    page,
    pageSize: PAGE_SIZE,
    hasMore: page < MAX_PAGE && page * PAGE_SIZE < total,
  };
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
    .where(and(isNull(listings.deletedAt), COM_CATALOGO))
    .orderBy(desc(opportunities.savings))
    .limit(limit);
  return rows.map((r) => toListing(r));
}

export interface DashboardCounts {
  activeOpportunities: number;
  newThisWeek: number;
  medianSavings: number;
  bestSavings: number;
}

/**
 * KPIs do painel, numa só query sobre `opportunities` ⋈ `listings` (o join só
 * serve para excluir anúncios que já saíram do mercado — `flag-opportunities.ts`
 * já garante veredito "compensa" + confiança normal + dedupe por carro físico
 * antes de a linha existir em `opportunities`, por isso não é preciso repetir
 * esse filtro aqui).
 *
 * `totalPotentialSavings` (soma de tudo) saiu: era dinheiro de fantasia — ninguém
 * compra todas as oportunidades ao mesmo tempo. Em vez disso, `medianSavings` dá
 * a poupança típica de UMA compra (resistente a outliers) e `bestSavings` mostra
 * o topo do momento.
 *
 * `opportunities` são globais — standId não entra aqui de propósito: uma
 * oportunidade compensa independentemente de qual stand a está a ver.
 */
export async function dashboardCountsQuery(): Promise<DashboardCounts> {
  const [row] = await db
    .select({
      active: sql<number>`count(*)::int`,
      newWeek: sql<number>`count(*) filter (where ${opportunities.flaggedAt} > now() - interval '7 days')::int`,
      median: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${opportunities.savings}), 0)::int`,
      best: sql<number>`coalesce(max(${opportunities.savings}), 0)::int`,
    })
    .from(opportunities)
    .innerJoin(listings, eq(listings.id, opportunities.listingId))
    .where(and(isNull(opportunities.deletedAt), isNull(listings.deletedAt)));
  return {
    activeOpportunities: row.active,
    newThisWeek: row.newWeek,
    medianSavings: row.median,
    bestSavings: row.best,
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
    .where(and(isNull(listings.deletedAt), COM_CATALOGO))
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
  /** Marca/modelo exatos, quando o alerta nasce de um anúncio (ver
   * components/listing-actions.tsx) — sem migration, é só mais uma chave no
   * JSONB. Preparado para o futuro job de matching comparar exato, em vez de
   * ter de reanalisar o resumo em texto livre. */
  make?: string;
  model?: string;
}

export async function alertsQuery(standId: string): Promise<Alert[]> {
  const rows = await db
    .select()
    .from(alerts)
    .where(eq(alerts.standId, standId))
    .orderBy(desc(alerts.createdAt));
  return rows.map((a) => {
    const criteria = (a.criteria ?? {}) as AlertCriteria;
    // Sem summary (não devia acontecer nos caminhos de criação atuais, mas o
    // JSONB não obriga), tenta reconstruir a partir de marca/modelo antes de
    // cair no nome do alerta.
    const fromMakeModel = [criteria.make, criteria.model].filter(Boolean).join(" ");
    return {
      id: a.id,
      name: a.name,
      criteria: criteria.summary ?? (fromMakeModel || a.name),
      countries: (a.countries ?? []) as CountryCode[],
      active: a.active,
      matchCount: 0, // preenchido quando o job de matching de alertas existir
      lastMatchAt: undefined,
    };
  });
}

export async function createAlertMutation(
  standId: string,
  draft: {
    name: string;
    criteria: string;
    countries: CountryCode[];
    maxPrice?: number;
    make?: string;
    model?: string;
  },
): Promise<void> {
  await db.insert(alerts).values({
    standId,
    name: draft.name,
    criteria: {
      summary: draft.criteria,
      maxPrice: draft.maxPrice,
      make: draft.make,
      model: draft.model,
    } satisfies AlertCriteria,
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

export async function getStandQuery(standId: string): Promise<Stand | null> {
  const [org] = await db.select().from(organization).where(eq(organization.id, standId)).limit(1);
  if (!org) return null;

  const [rows, [sub]] = await Promise.all([
    db
      .select({ id: user.id, name: user.name, email: user.email, role: member.role })
      .from(member)
      .innerJoin(user, eq(user.id, member.userId))
      .where(eq(member.organizationId, standId))
      .orderBy(desc(member.role)), // owner antes de member
    db.select().from(subscriptions).where(eq(subscriptions.standId, standId)).limit(1),
  ]);

  // Sem linha de subscrição, o stand está no 1.º mês grátis derivado da data de
  // registo — o trial não passa pela Polar (não pedimos cartão), portanto não
  // há lá nada para gravar. Isto NÃO é um fallback de emergência: é o caminho
  // normal de todos os stands até alguém pagar.
  const fimDoTrial = new Date(org.createdAt);
  fimDoTrial.setDate(fimDoTrial.getDate() + CONDICOES.trialDias);

  const fimDoPeriodo = sub ? (sub.currentPeriodEnd ?? fimDoTrial) : fimDoTrial;
  const estado = sub
    ? estadoEfetivo(sub.status as SubscriptionStatus, sub.currentPeriodEnd)
    : estadoEfetivo("trial", fimDoTrial);

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
      status: estado,
      // euros (formatEuroCents não divide — só mostra cêntimos). O valor
      // canónico está em lib/legal.ts, onde os Termos e o marketing o leem:
      // escrevê-lo aqui outra vez era como divergiam.
      pricePerMonth: CONDICOES.precoMensalEuros,
      renewsAt: fimDoPeriodo.toISOString(),
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

// ── Landing (números públicos) ──────────────────────────────────
/**
 * Os números que a landing mostra. Públicos e agregados — nada por stand.
 * O `lastSeenAt` é o carimbo da última leitura do pipeline: sem ele, "174
 * carros compensam hoje" é só mais uma promessa.
 */
export async function landingStatsQuery(): Promise<{
  totalListings: number;
  activeOpportunities: number;
  medianSavings: number;
  bestSavings: number;
  /** ⚠️ String, não Date: vem de um `sql` cru, portanto o driver devolve o
   *  timestamp como texto — o Drizzle só converte para Date o que passa pelo
   *  mapeamento de uma coluna. Anotar `Date` aqui compila e rebenta em runtime. */
  lastSeenAt: string | null;
}> {
  const [row] = await db
    .select({
      totalListings: sql<number>`(select count(*)::int from ${listings} where deleted_at is null)`,
      activeOpportunities: sql<number>`count(*)::int`,
      medianSavings: sql<number>`coalesce(percentile_cont(0.5) within group (order by ${opportunities.savings}), 0)::int`,
      bestSavings: sql<number>`coalesce(max(${opportunities.savings}), 0)::int`,
      lastSeenAt: sql<
        string | null
      >`(select max(last_seen_at)::text from ${listings} where deleted_at is null)`,
    })
    .from(opportunities)
    .innerJoin(listings, eq(listings.id, opportunities.listingId))
    .where(and(isNull(opportunities.deletedAt), isNull(listings.deletedAt)));
  return row;
}
