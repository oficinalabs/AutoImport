// lib/db-sink.ts — o upsert canónico de anúncios para o Postgres.
//
// Usado por DOIS caminhos: o Sink dos watch (tempo real) e o replay de NDJSON
// (scripts/pipeline/ingest.ts). SQL cru via `postgres` — resolvido do
// node_modules da RAIZ (dependência do frontend); os coletores continuam sem
// dependências próprias. Sem DATABASE_URL, createDbSink() devolve null e tudo
// se comporta como antes (NDJSON apenas).
//
// Normalizações de fronteira (coletor → BD):
//   country  'GERMANY'/'PORTUGAL'/… → ISO-2 ('DE', 'PT', …)
//   external_id = extra `id`; fallback hash do detail_url
//   engine "1.995 cm³" → displacement_cc 1995 (aceite só em 400–8500)
//   co2 "130 g/km" → 130 · power kW → hp · first_registration "MM/AAAA" → date

import { createHash } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import postgres from 'postgres';

// País (formato dos coletores, MAIÚSCULAS) → ISO-2. Valores já ISO-2 passam.
const PAIS_ISO2: Record<string, string> = {
  GERMANY: 'DE', AUSTRIA: 'AT', BELGIUM: 'BE', SPAIN: 'ES', FRANCE: 'FR',
  ITALY: 'IT', LUXEMBOURG: 'LU', NETHERLANDS: 'NL', PORTUGAL: 'PT',
};

// Nome de sink/ficheiro → slug canónico em `sources` (só onde difere do source_site).
const SOURCE_SLUG: Record<string, string> = {
  theparking: 'theparking.eu',
  piscapisca: 'piscapisca.pt',
};

export type SinkEvent = 'new' | 'price_change';

const str = (v: unknown): string | null => {
  if (v == null) return null;
  const s = String(v).trim();
  return s || null;
};

const int = (v: unknown): number | null => {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? Math.round(v) : null;
  const digits = String(v).replace(/[^\d]/g, '');
  return digits ? Number(digits) : null;
};

function iso2(country: unknown): string | null {
  const c = str(country)?.toUpperCase();
  if (!c) return null;
  if (c.length === 2) return c;
  return PAIS_ISO2[c] ?? null;
}

// Cilindrada a partir do campo engine, em dois formatos:
//   "1.995 cm³" / 1995      → 1995 (o ponto é separador de milhares)
//   "3.0 Gasoline" / "2,0 l" → 3000 / 2000 (litros com UMA casa decimal —
//     conversão determinística ×1000, erro ≤ ~2% ≈ ±100 € de ISV)
// Rejeita o resto (ex.: "TDI") com guarda de sanidade 400–8500 cm³.
function displacementCc(engine: unknown): number | null {
  if (engine == null) return null;
  const s = String(engine);
  const liters = /^\s*(\d)[.,](\d)(?!\d)/.exec(s);
  const n = liters ? Number(liters[1]) * 1000 + Number(liters[2]) * 100 : int(s);
  return n != null && n >= 400 && n <= 8500 ? n : null;
}

function co2Grams(v: unknown): number | null {
  const n = int(v);
  return n != null && n >= 0 && n <= 500 ? n : null;
}

// "MM/AAAA" | "MM-AAAA" | "AAAA-MM-DD" → data ISO (dia 1 quando só há mês).
function firstRegistrationDate(v: unknown): string | null {
  const s = str(v);
  if (!s) return null;
  const isoMatch = /^(\d{4})-(\d{2})(?:-(\d{2}))?/.exec(s);
  if (isoMatch) return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3] ?? '01'}`;
  const mmYyyy = /^(\d{1,2})[/\-.](\d{4})$/.exec(s);
  if (mmYyyy) return `${mmYyyy[2]}-${mmYyyy[1].padStart(2, '0')}-01`;
  return null;
}

function powerHp(record: Record<string, unknown>): number | null {
  const hp = int(record.power_hp ?? record.power_cv ?? record.power);
  if (hp != null && hp >= 20 && hp <= 2000) return hp;
  const kw = int(record.power_kw);
  return kw != null && kw >= 15 && kw <= 1500 ? Math.round(kw * 1.35962) : null;
}

function sellerType(record: Record<string, unknown>): string | null {
  const s = (str(record.seller_type) ?? str(record.source))?.toLowerCase();
  if (!s) return null;
  if (/priv|particular/.test(s)) return 'particular';
  return 'stand';
}

export class DbSink {
  private sql: postgres.Sql;

  constructor(databaseUrl: string) {
    // prepare:false — compatível com o pooler transaction-mode da Supabase.
    this.sql = postgres(databaseUrl, { prepare: false, max: 4 });
  }

  /**
   * Upsert idempotente de um registo de coletor. `sourceName` é o nome do
   * sink/ficheiro (fallback quando o registo não traz `source_site`).
   * Regista mudanças de preço em listing_price_history (1.ª observação incluída).
   */
  async upsertListing(record: Record<string, unknown>, _event: SinkEvent, sourceName: string) {
    const sourceSite =
      str(record.source_site) ?? SOURCE_SLUG[sourceName] ?? sourceName;
    const detailUrl = str(record.detail_url);
    const externalId =
      str(record.id) ??
      (detailUrl ? createHash('sha256').update(detailUrl).digest('hex').slice(0, 16) : null);
    if (!externalId) return; // sem identidade não há upsert possível

    const seenAt =
      str(record.last_seen) ?? str(record.collected_at) ?? new Date().toISOString();
    const firstSeenAt = str(record.first_seen) ?? seenAt;
    // Preço: fontes ES anunciam o FINANCIADO como destaque; quando a fonte
    // dá o preço de compra direta estruturado (flexicar `cash_price`), é
    // esse que vale — é o que um importador paga.
    const cashPrice = int(record.cash_price);
    const price = cashPrice != null && cashPrice > 0 ? cashPrice : int(record.price);

    const rows = await this.sql`
      insert into listings (
        source_site, external_id, source_id,
        make_raw, model_raw, variant, year, km, fuel_raw, gearbox, engine_raw,
        displacement_cc, color, doors, category, price, currency, country,
        region, postal_code, detail_url, image_url,
        co2, power_hp, first_registration, seller_name, seller_type,
        price_evaluation, is_damaged, vin, raw, first_seen_at, last_seen_at
      ) values (
        ${sourceSite}, ${externalId},
        (select id from sources where slug = ${sourceSite}),
        ${str(record.make)}, ${str(record.model)}, ${str(record.variant)},
        ${int(record.year)}, ${int(record.km)}, ${str(record.fuel)},
        ${str(record.gearbox)}, ${str(record.engine)},
        ${displacementCc(record.engine)}, ${str(record.color)}, ${int(record.doors)},
        ${str(record.category)}, ${price}, ${str(record.currency) ?? 'EUR'},
        ${iso2(record.country)}, ${str(record.region)}, ${str(record.postalCode)},
        ${detailUrl}, ${str(record.image)},
        ${co2Grams(record.co2)}, ${powerHp(record)},
        ${firstRegistrationDate(record.first_registration)},
        ${str(record.source)}, ${sellerType(record)},
        ${(() => { const n = int(record.price_evaluation); return n != null && n >= 1 && n <= 5 ? n : null; })()},
        ${typeof record.is_damaged === 'boolean' ? record.is_damaged : null},
        ${str(record.vin)}, ${this.sql.json(record as never)}, ${firstSeenAt}, ${seenAt}
      )
      on conflict (source_site, external_id) do update set
        price = coalesce(excluded.price, listings.price),
        km = coalesce(excluded.km, listings.km),
        variant = coalesce(excluded.variant, listings.variant),
        displacement_cc = coalesce(excluded.displacement_cc, listings.displacement_cc),
        co2 = coalesce(excluded.co2, listings.co2),
        power_hp = coalesce(excluded.power_hp, listings.power_hp),
        first_registration = coalesce(excluded.first_registration, listings.first_registration),
        price_evaluation = coalesce(excluded.price_evaluation, listings.price_evaluation),
        image_url = coalesce(excluded.image_url, listings.image_url),
        raw = excluded.raw,
        last_seen_at = greatest(listings.last_seen_at, excluded.last_seen_at),
        deleted_at = null,
        updated_at = now()
      returning id
    `;

    // Histórico de preço: 1 linha na primeira observação + 1 por mudança.
    const listingId = rows[0]?.id as string | undefined;
    if (listingId && price != null) {
      await this.sql`
        insert into listing_price_history (listing_id, price, observed_at)
        select ${listingId}, ${price}, ${seenAt}
        where coalesce(
          (select price from listing_price_history
            where listing_id = ${listingId}
            order by observed_at desc limit 1),
          -1
        ) <> ${price}
      `;
    }
  }

  async close() {
    await this.sql.end({ timeout: 5 });
  }
}

/**
 * Cria o DbSink se houver DATABASE_URL (env ou .env.local da raiz do repo);
 * caso contrário devolve null — os coletores ficam em modo NDJSON puro.
 */
export function createDbSink(): DbSink | null {
  if (!process.env.DATABASE_URL) {
    try {
      // repo root a partir de tools/collector/lib/
      process.loadEnvFile(join(dirname(fileURLToPath(import.meta.url)), '../../../.env.local'));
    } catch {
      /* sem .env.local — fica NDJSON puro */
    }
  }
  const url = process.env.DATABASE_URL;
  return url ? new DbSink(url) : null;
}
