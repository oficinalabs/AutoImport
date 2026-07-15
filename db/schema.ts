import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
  standName: text("stand_name"),
});

export const session = pgTable(
  "session",
  {
    id: text("id").primaryKey(),
    expiresAt: timestamp("expires_at").notNull(),
    token: text("token").notNull().unique(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    activeOrganizationId: text("active_organization_id"),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = pgTable(
  "account",
  {
    id: text("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    password: text("password"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = pgTable(
  "verification",
  {
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => /* @__PURE__ */ new Date())
      .notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const organization = pgTable(
  "organization",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull().unique(),
    logo: text("logo"),
    createdAt: timestamp("created_at").notNull(),
    metadata: text("metadata"),
  },
  (table) => [uniqueIndex("organization_slug_uidx").on(table.slug)],
);

export const member = pgTable(
  "member",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").default("member").notNull(),
    createdAt: timestamp("created_at").notNull(),
  },
  (table) => [
    index("member_organizationId_idx").on(table.organizationId),
    index("member_userId_idx").on(table.userId),
  ],
);

export const invitation = pgTable(
  "invitation",
  {
    id: text("id").primaryKey(),
    organizationId: text("organization_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    email: text("email").notNull(),
    role: text("role"),
    status: text("status").default("pending").notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    inviterId: text("inviter_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [
    index("invitation_organizationId_idx").on(table.organizationId),
    index("invitation_email_idx").on(table.email),
  ],
);

export const userRelations = relations(user, ({ many }) => ({
  sessions: many(session),
  accounts: many(account),
  members: many(member),
  invitations: many(invitation),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, {
    fields: [session.userId],
    references: [user.id],
  }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, {
    fields: [account.userId],
    references: [user.id],
  }),
}));

export const organizationRelations = relations(organization, ({ many }) => ({
  members: many(member),
  invitations: many(invitation),
}));

export const memberRelations = relations(member, ({ one }) => ({
  organization: one(organization, {
    fields: [member.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [member.userId],
    references: [user.id],
  }),
}));

export const invitationRelations = relations(invitation, ({ one }) => ({
  organization: one(organization, {
    fields: [invitation.organizationId],
    references: [organization.id],
  }),
  user: one(user, {
    fields: [invitation.inviterId],
    references: [user.id],
  }),
}));

// ════════════════════════════════════════════════════════════════
// Domínio — dados de mercado, custos de importação e produto.
// Ver docs/04-BASE-DE-DADOS.md. Convenções: snake_case plural,
// id uuid, created_at/updated_at, soft delete via deleted_at.
// As tabelas de auth acima usam PKs text (Better Auth) — os FKs
// para organization (= stand/tenant) são por isso text.
// ════════════════════════════════════════════════════════════════

/** Colunas comuns a todas as tabelas de domínio. */
const domainTimestamps = {
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at")
    .defaultNow()
    .$onUpdate(() => /* @__PURE__ */ new Date())
    .notNull(),
};

/** Fontes de anúncios (uma por coletor; seed em db/seed/sources.ts). */
export const sources = pgTable(
  "sources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** = `source_site` dos coletores, ex.: "autoscout24.de" */
    slug: text("slug").notNull().unique(),
    name: text("name").notNull(),
    /** país principal da fonte, ISO-2 ("DE", "PT", …); null = pan-europeia */
    country: text("country"),
    /** marketplace | agregador | rede_stands | particulares */
    kind: text("kind").notNull(),
    active: boolean("active").default(true).notNull(),
    ...domainTimestamps,
  },
  (table) => [uniqueIndex("sources_slug_uidx").on(table.slug)],
);

/**
 * Modelo canónico de veículo = (marca, modelo, combustível) normalizados.
 * Variante/ano/km são dimensões do anúncio, não do modelo.
 * `normKey` = "make|model|fuel" (ver lib/engine/normalize-vehicle.ts).
 */
export const vehicleModels = pgTable(
  "vehicle_models",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    make: text("make").notNull(),
    model: text("model").notNull(),
    /** valores de FuelType (lib/types.ts): gasolina | diesel | híbrido | phev | elétrico */
    fuel: text("fuel").notNull(),
    normKey: text("norm_key").notNull().unique(),
    /** medianas dos anúncios ligados — inputs de fallback do cost engine */
    displacementCc: integer("displacement_cc"),
    co2: integer("co2"),
    powerHp: integer("power_hp"),
    transmission: text("transmission"),
    ...domainTimestamps,
  },
  (table) => [uniqueIndex("vehicle_models_norm_key_uidx").on(table.normKey)],
);

/**
 * Anúncios — estrangeiros E portugueses (o país distingue).
 * Chave natural do upsert dos coletores: (source_site, external_id).
 */
export const listings = pgTable(
  "listings",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceSite: text("source_site").notNull(),
    externalId: text("external_id").notNull(),
    sourceId: uuid("source_id").references(() => sources.id),
    /** null até o match-models correr */
    modelId: uuid("model_id").references(() => vehicleModels.id),
    // ── campos do CollectorRecord (tools/collector/lib/normalize.ts) ──
    makeRaw: text("make_raw"),
    modelRaw: text("model_raw"),
    variant: text("variant"),
    year: integer("year"),
    km: integer("km"),
    fuelRaw: text("fuel_raw"),
    /** normalizado (FuelType); null até o match-models correr */
    fuel: text("fuel"),
    gearbox: text("gearbox"),
    engineRaw: text("engine_raw"),
    displacementCc: integer("displacement_cc"),
    color: text("color"),
    doors: integer("doors"),
    category: text("category"),
    /** EUR inteiros */
    price: integer("price"),
    currency: text("currency").default("EUR").notNull(),
    /** ISO-2 normalizado no ingest ("DE", "PT", …) */
    country: text("country"),
    region: text("region"),
    postalCode: text("postal_code"),
    detailUrl: text("detail_url"),
    imageUrl: text("image_url"),
    // ── extras promovidos (quando a fonte os tem) ──
    co2: integer("co2"),
    powerHp: integer("power_hp"),
    firstRegistration: date("first_registration"),
    sellerName: text("seller_name"),
    /** stand | particular */
    sellerType: text("seller_type"),
    /** rating de mercado 1–5 do AutoScout24 */
    priceEvaluation: integer("price_evaluation"),
    isDamaged: boolean("is_damaged"),
    vin: text("vin"),
    /** registo completo do coletor — nada se perde */
    raw: jsonb("raw"),
    firstSeenAt: timestamp("first_seen_at").defaultNow().notNull(),
    lastSeenAt: timestamp("last_seen_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
    ...domainTimestamps,
  },
  (table) => [
    uniqueIndex("listings_source_external_uidx").on(table.sourceSite, table.externalId),
    index("listings_model_country_price_idx").on(table.modelId, table.country, table.price),
    index("listings_last_seen_idx").on(table.lastSeenAt),
  ],
);

/** Histórico de preço: 1 linha no primeiro insert + 1 por mudança de preço. */
export const listingPriceHistory = pgTable(
  "listing_price_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    price: integer("price").notNull(),
    observedAt: timestamp("observed_at").defaultNow().notNull(),
  },
  (table) => [index("listing_price_history_listing_idx").on(table.listingId, table.observedAt)],
);

/**
 * Observações de preço PT por modelo — alimenta PtMarket.estimatedPrice
 * e o histórico mensal do gráfico. 1 observação por listing PT ativo/dia.
 */
export const ptPriceObservations = pgTable(
  "pt_price_observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    modelId: uuid("model_id")
      .notNull()
      .references(() => vehicleModels.id),
    listingId: uuid("listing_id").references(() => listings.id, { onDelete: "set null" }),
    year: integer("year"),
    /** floor(km / 25000) */
    kmBand: integer("km_band"),
    price: integer("price").notNull(),
    sourceSite: text("source_site"),
    observedAt: timestamp("observed_at").defaultNow().notNull(),
  },
  (table) => [index("pt_price_observations_model_idx").on(table.modelId, table.observedAt)],
);

/**
 * Tabelas fiscais versionadas por ano (ISV + IUC). `payload` guarda os
 * escalões em JSON; a forma de cada kind está em lib/cost-engine/types.ts
 * e os valores/kinds em db/seed/isv-2026.ts (ISV_TABLES_2026).
 */
export const isvTables = pgTable(
  "isv_tables",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    year: integer("year").notNull(),
    kind: text("kind").notNull(),
    payload: jsonb("payload").notNull(),
    sourceUrl: text("source_url"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("isv_tables_year_kind_uidx").on(table.year, table.kind)],
);

/**
 * Estimativa corrente de custo de importação por listing estrangeiro
 * (o histórico de variações vive em listing_price_history).
 */
export const importCostEstimates = pgTable(
  "import_cost_estimates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .unique()
      .references(() => listings.id, { onDelete: "cascade" }),
    originPrice: integer("origin_price").notNull(),
    transport: integer("transport").notNull(),
    isv: integer("isv").notNull(),
    /** IUC do 1.º ano */
    iuc: integer("iuc").notNull(),
    legalization: integer("legalization").notNull(),
    totalPt: integer("total_pt").notNull(),
    ptEstimatedPrice: integer("pt_estimated_price").notNull(),
    ptSampleSize: integer("pt_sample_size").notNull(),
    /** normal | alargada (amostra PT alargada a year±2/band±2) */
    ptConfidence: text("pt_confidence").notNull(),
    savings: integer("savings").notNull(),
    savingsPct: real("savings_pct").notNull(),
    /** compensa | marginal | nao_compensa (lib/verdict.ts) */
    verdict: text("verdict").notNull(),
    isvTableYear: integer("isv_table_year").notNull(),
    /** auditoria: inputs usados pelo cost engine (cc, co2, defaults assumidos) */
    inputs: jsonb("inputs"),
    computedAt: timestamp("computed_at").defaultNow().notNull(),
  },
  (table) => [index("import_cost_estimates_verdict_idx").on(table.verdict, table.savings)],
);

/** Listings marcados como compensatórios. stand_id null = oportunidade global. */
export const opportunities = pgTable(
  "opportunities",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    listingId: uuid("listing_id")
      .notNull()
      .unique()
      .references(() => listings.id, { onDelete: "cascade" }),
    standId: text("stand_id").references(() => organization.id, { onDelete: "cascade" }),
    savings: integer("savings").notNull(),
    savingsPct: real("savings_pct").notNull(),
    flaggedAt: timestamp("flagged_at").defaultNow().notNull(),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("opportunities_stand_savings_idx").on(table.standId, table.savings),
    index("opportunities_savings_idx").on(table.savings),
  ],
);

/** Critérios de vigilância de um stand (funde saved_searches + alerts do docs/04). */
export const alerts = pgTable(
  "alerts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    standId: text("stand_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    /** critérios estruturados: { query?, maxPrice?, … } */
    criteria: jsonb("criteria").notNull(),
    countries: text("countries").array().notNull().default([]),
    active: boolean("active").default(true).notNull(),
    ...domainTimestamps,
  },
  (table) => [index("alerts_stand_idx").on(table.standId)],
);

/** O que já foi notificado por alerta — para não repetir. */
export const alertEvents = pgTable(
  "alert_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    alertId: uuid("alert_id")
      .notNull()
      .references(() => alerts.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    sentAt: timestamp("sent_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("alert_events_alert_listing_uidx").on(table.alertId, table.listingId)],
);

/** Favoritos de um stand. */
export const favorites = pgTable(
  "favorites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    standId: text("stand_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    listingId: uuid("listing_id")
      .notNull()
      .references(() => listings.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (table) => [uniqueIndex("favorites_stand_listing_uidx").on(table.standId, table.listingId)],
);

// ── Catálogo ultimatespecs.com — referência de versões para o matching ──
// Alimentado pelo coletor tools/collector/ultimatespecs (NDJSON → scripts/pipeline/
// ingest-ultimatespecs.ts). Chaves naturais do site (mid/version_id, estáveis) em vez
// de uuid: o upsert do replay conflita nelas e re-correr não duplica.

/** Página de modelo/geração (ex. "Stonic-2021"): 1 linha por `M<id>` do site. */
export const usModels = pgTable(
  "us_models",
  {
    /** "M27110" — id da página de modelo no ultimatespecs */
    mid: text("mid").primaryKey(),
    make: text("make").notNull(),
    /** nome do modelo sem o ano do slug (ex. "Stonic", "Q7 3rd Generation") */
    model: text("model").notNull(),
    /** slug completo (ex. "Stonic-2021") — distingue gerações/facelifts */
    slug: text("slug").notNull(),
    /** ano no fim do slug; null quando o slug não o tem */
    modelYear: integer("model_year"),
    url: text("url").notNull(),
    /** galeria da página de modelo — URLs diretos ultimatespecs (não guardamos imagens) */
    imageUrls: jsonb("image_urls").$type<string[]>(),
    collectedAt: timestamp("collected_at"),
    ...domainTimestamps,
  },
  (table) => [index("us_models_make_model_idx").on(table.make, table.model)],
);

/**
 * Versão/motorização (ex. "Stonic 2021 1.0 T-GDI 100"): o grão do matching.
 * Os campos normalizados servem queries diretas; `specs` guarda TODAS as linhas
 * cruas `label → valor` da ficha (~37+/versão, Bore x Stroke, WLTP low/medium/…)
 * — nada do modo --deep se perde.
 */
export const usVersions = pgTable(
  "us_versions",
  {
    /** id numérico da versão no ultimatespecs (ex. "141870") */
    versionId: text("version_id").primaryKey(),
    mid: text("mid")
      .notNull()
      .references(() => usModels.mid, { onDelete: "cascade" }),
    /** designação como aparece no site (ex. "Stonic 2021 1.0 T-GDI 100") */
    name: text("name").notNull(),
    url: text("url").notNull(),
    /** secção da tabela de versões: petrol | diesel | electric | pluginhybrid | hybrid… */
    fuelSection: text("fuel_section"),
    /** coluna "Year" da tabela de versões (ano-modelo da versão) */
    year: integer("year"),
    powerHp: integer("power_hp"),
    powerKw: real("power_kw"),
    displacementCc: integer("displacement_cc"),
    // ── ficha deep normalizada (null sem --deep) ──
    generation: text("generation"),
    body: text("body"),
    doors: integer("doors"),
    seats: integer("seats"),
    /** linha "Fuel type" da ficha ("Petrol", "Diesel", …) */
    fuel: text("fuel"),
    engineCode: text("engine_code"),
    /** "Inline 3", "V6", … */
    cylinders: text("cylinders"),
    torqueNm: integer("torque_nm"),
    drivetrain: text("drivetrain"),
    gearbox: text("gearbox"),
    co2Wltp: integer("co2_wltp"),
    co2Nedc: integer("co2_nedc"),
    emissionStandard: text("emission_standard"),
    curbWeightKg: integer("curb_weight_kg"),
    /** imagem principal (w800) — URL direto ultimatespecs */
    imageUrl: text("image_url"),
    /** ficha completa crua label→valor */
    specs: jsonb("specs").$type<Record<string, string>>(),
    collectedAt: timestamp("collected_at"),
    ...domainTimestamps,
  },
  (table) => [
    index("us_versions_mid_idx").on(table.mid),
    index("us_versions_power_idx").on(table.powerHp),
    index("us_versions_cc_idx").on(table.displacementCc),
  ],
);

// ── Relations (domínio) — usadas pelas queries em lib/queries.ts ──

export const listingsRelations = relations(listings, ({ one, many }) => ({
  model: one(vehicleModels, {
    fields: [listings.modelId],
    references: [vehicleModels.id],
  }),
  source: one(sources, {
    fields: [listings.sourceId],
    references: [sources.id],
  }),
  costEstimate: one(importCostEstimates, {
    fields: [listings.id],
    references: [importCostEstimates.listingId],
  }),
  priceHistory: many(listingPriceHistory),
}));

export const vehicleModelsRelations = relations(vehicleModels, ({ many }) => ({
  listings: many(listings),
  ptPriceObservations: many(ptPriceObservations),
}));

export const listingPriceHistoryRelations = relations(listingPriceHistory, ({ one }) => ({
  listing: one(listings, {
    fields: [listingPriceHistory.listingId],
    references: [listings.id],
  }),
}));

export const ptPriceObservationsRelations = relations(ptPriceObservations, ({ one }) => ({
  model: one(vehicleModels, {
    fields: [ptPriceObservations.modelId],
    references: [vehicleModels.id],
  }),
}));

export const importCostEstimatesRelations = relations(importCostEstimates, ({ one }) => ({
  listing: one(listings, {
    fields: [importCostEstimates.listingId],
    references: [listings.id],
  }),
}));

export const opportunitiesRelations = relations(opportunities, ({ one }) => ({
  listing: one(listings, {
    fields: [opportunities.listingId],
    references: [listings.id],
  }),
}));

export const alertsRelations = relations(alerts, ({ one, many }) => ({
  stand: one(organization, {
    fields: [alerts.standId],
    references: [organization.id],
  }),
  events: many(alertEvents),
}));

export const alertEventsRelations = relations(alertEvents, ({ one }) => ({
  alert: one(alerts, {
    fields: [alertEvents.alertId],
    references: [alerts.id],
  }),
  listing: one(listings, {
    fields: [alertEvents.listingId],
    references: [listings.id],
  }),
}));

export const favoritesRelations = relations(favorites, ({ one }) => ({
  stand: one(organization, {
    fields: [favorites.standId],
    references: [organization.id],
  }),
  listing: one(listings, {
    fields: [favorites.listingId],
    references: [listings.id],
  }),
}));

export const usModelsRelations = relations(usModels, ({ many }) => ({
  versions: many(usVersions),
}));

export const usVersionsRelations = relations(usVersions, ({ one }) => ({
  model: one(usModels, {
    fields: [usVersions.mid],
    references: [usModels.mid],
  }),
}));
