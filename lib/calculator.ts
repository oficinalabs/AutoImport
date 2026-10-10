/**
 * Calculadora (P11): a conta de um carro que não está na montra, ou de um que
 * está mas com outros números. Duas metades:
 *
 *  - **puras** (`parseCalculatorFields`, `calculate`, `listingUrlCandidates`,
 *    `listingToFields`): validação, conta e mapeamento — testáveis sem base de
 *    dados nem Next (tests/app/calculadora.test.ts);
 *  - **de servidor** (`runCalculator`, `findListingByUrl`): verificam a sessão,
 *    carregam as tabelas fiscais e procuram o anúncio. A página
 *    (app/(app)/(gated)/calculadora/page.tsx) embrulha-as em Server Actions. A
 *    base de dados e a sessão entram por `import()` dinâmico para que os testes
 *    possam importar este módulo sem `DATABASE_URL`.
 *
 * **Por link** (DEFAULT, plano §5): só procuramos o anúncio na nossa base, pelo
 * `detail_url`. Nunca vamos buscar a página à fonte a partir da Vercel — risco
 * legal e de bloqueio, e a decisão de o fazer é do Rui (plano §6).
 *
 * Os erros nunca mostram detalhe interno ao cliente (CLAUDE.md): o detalhe vai
 * para os logs do servidor e a UI recebe uma frase.
 */
import { computeDeal, isExcludedTerritory } from "./cost-engine";
import type { DealResult, SourceVatRegime, TaxTables } from "./cost-engine/types";
import type { CountryCode, FuelType, Verdict } from "./types";
import { verdictFromMargin } from "./verdict";

export const CALCULATOR_COUNTRIES: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
export const CALCULATOR_FUELS: FuelType[] = ["gasolina", "diesel", "híbrido", "phev", "elétrico"];
export const CALCULATOR_VAT_REGIMES = ["margem", "dedutivel", "particular"] as const;
export type CalculatorVatRegime = (typeof CALCULATOR_VAT_REGIMES)[number];

/** O formulário tal como vem do browser: tudo texto, tudo por validar. */
export interface CalculatorFields {
  country: string;
  postalCode: string;
  price: string;
  /** preço sem IVA, quando o anúncio o publica (só conta em "dedutível") */
  priceNet: string;
  vatRegime: string;
  fuel: string;
  displacementCc: string;
  co2: string;
  /** AAAA-MM-DD (input type=date) ou AAAA-MM */
  firstRegistration: string;
  km: string;
  /** preço de venda esperado em PT (PVP, com IVA) */
  ptPrice: string;
}

export const EMPTY_FIELDS: CalculatorFields = {
  country: "DE",
  postalCode: "",
  price: "",
  priceNet: "",
  vatRegime: "margem",
  fuel: "gasolina",
  displacementCc: "",
  co2: "",
  firstRegistration: "",
  km: "",
  ptPrice: "",
};

export type FieldErrors = Partial<Record<keyof CalculatorFields, string>>;

export interface ParsedCalculator {
  country: CountryCode;
  postalCode: string | null;
  price: number;
  priceNet: number | null;
  vatRegime: CalculatorVatRegime;
  fuel: FuelType;
  displacementCc?: number;
  co2?: number;
  firstRegistration: Date;
  km: number;
  ptPrice: number;
}

// Limites de sanidade: fora disto é engano de digitação, não um carro.
const PRICE_MIN = 500;
const PRICE_MAX = 2_000_000;
const KM_MAX = 1_500_000;
const CC_MIN = 500;
const CC_MAX = 9_000;
const CO2_MAX = 600;
const OLDEST_YEAR = 1990;

/**
 * "23 800", "23.800 €", "23800,00" → 23800. Ponto seguido de exatamente 3
 * dígitos é separador de milhares (como se escreve em PT, DE, NL, ES); vírgula é
 * sempre decimal. Devolve null se não houver número.
 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[\s\u00a0€]/g, "");
  if (s === "") return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(Number(s));
}

function parseDate(raw: string): Date | null {
  const m = /^(\d{4})-(\d{2})(?:-(\d{2}))?$/.exec(raw.trim());
  if (!m) return null;
  const d = new Date(`${m[1]}-${m[2]}-${m[3] ?? "01"}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Valida o formulário. Erros por campo, em português, prontos para mostrar. */
export function parseCalculatorFields(
  f: CalculatorFields,
  now: Date = new Date(),
): { ok: true; value: ParsedCalculator } | { ok: false; errors: FieldErrors } {
  const errors: FieldErrors = {};

  const country = f.country as CountryCode;
  if (!CALCULATOR_COUNTRIES.includes(country)) errors.country = "Escolhe o país de origem.";

  const postalCode = f.postalCode.trim().toUpperCase() || null;
  if (postalCode && !/^[0-9A-Z][0-9A-Z -]{1,9}$/.test(postalCode)) {
    errors.postalCode = "Código postal inválido.";
  }

  const price = parseAmount(f.price);
  if (price == null) errors.price = "Indica o preço do anúncio.";
  else if (price < PRICE_MIN || price > PRICE_MAX) errors.price = "Preço fora do normal.";

  const vatRegime = f.vatRegime as CalculatorVatRegime;
  if (!CALCULATOR_VAT_REGIMES.includes(vatRegime)) errors.vatRegime = "Escolhe o regime de IVA.";

  let priceNet: number | null = null;
  if (vatRegime === "dedutivel" && f.priceNet.trim() !== "") {
    priceNet = parseAmount(f.priceNet);
    if (priceNet == null || priceNet < PRICE_MIN) errors.priceNet = "Preço sem IVA inválido.";
    else if (price != null && priceNet > price) {
      errors.priceNet = "O preço sem IVA não pode ser maior do que o preço.";
    }
  }

  const fuel = f.fuel as FuelType;
  if (!CALCULATOR_FUELS.includes(fuel)) errors.fuel = "Escolhe o combustível.";
  const ev = fuel === "elétrico";

  let displacementCc: number | undefined;
  let co2: number | undefined;
  if (!ev) {
    const cc = parseAmount(f.displacementCc);
    if (cc == null) errors.displacementCc = "Indica a cilindrada.";
    else if (cc < CC_MIN || cc > CC_MAX) errors.displacementCc = "Cilindrada fora do normal.";
    else displacementCc = cc;

    const c = parseAmount(f.co2);
    if (c == null) errors.co2 = "Indica as emissões de CO₂.";
    else if (c > CO2_MAX) errors.co2 = "CO₂ fora do normal.";
    else co2 = c;
  }

  const firstRegistration = parseDate(f.firstRegistration);
  if (!firstRegistration) errors.firstRegistration = "Indica a data da 1.ª matrícula.";
  else if (firstRegistration.getUTCFullYear() < OLDEST_YEAR || firstRegistration > now) {
    errors.firstRegistration = "Data da 1.ª matrícula fora do normal.";
  }

  const km = parseAmount(f.km);
  if (km == null) errors.km = "Indica os quilómetros.";
  else if (km > KM_MAX) errors.km = "Quilómetros fora do normal.";

  const ptPrice = parseAmount(f.ptPrice);
  if (ptPrice == null) errors.ptPrice = "Indica o preço a que contas vender em Portugal.";
  else if (ptPrice < PRICE_MIN || ptPrice > PRICE_MAX) errors.ptPrice = "Preço fora do normal.";

  if (!errors.postalCode && isExcludedTerritory(country, null, postalCode)) {
    errors.postalCode =
      "Este código postal é de um território que não sabemos calcular (ilhas, Ceuta e Melilla, DOM, Córsega).";
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      country,
      postalCode,
      price: price as number,
      priceNet,
      vatRegime,
      fuel,
      displacementCc,
      co2,
      firstRegistration: firstRegistration as Date,
      km: km as number,
      ptPrice: ptPrice as number,
    },
  };
}

export interface CalculatorResult {
  deal: Omit<DealResult, "isvDetail">;
  ptPrice: number;
  verdict: Verdict;
  taxYear: number;
  provisional: boolean;
  /** avisos para o stand: assunções do ISV, regime trocado, carro novo… */
  notes: string[];
}

/** A conta propriamente dita: `computeDeal` + veredito + avisos. Pura. */
export function calculate(
  p: ParsedCalculator,
  tables: TaxTables & { provisional?: boolean },
  options: { now?: Date; standVatRegistered?: boolean } = {},
): CalculatorResult {
  const { now = new Date(), standVatRegistered = true } = options;
  const { isvDetail, ...deal } = computeDeal(
    {
      originPrice: p.price,
      fuel: p.fuel,
      displacementCc: p.displacementCc,
      co2: p.co2,
      firstRegistration: p.firstRegistration,
      country: p.country,
      referenceDate: now,
      sourceVatRegime: p.vatRegime as SourceVatRegime,
      priceNet: p.priceNet,
      postalCode: p.postalCode,
      km: p.km,
    },
    p.ptPrice,
    { tables, standVatRegistered },
  );

  const notes = [...isvDetail.assumptions];
  if (p.vatRegime === "dedutivel" && deal.vatRegime === "margem") {
    notes.push(
      p.country === "NL"
        ? "Nos Países Baixos o preço inclui a BPM, que fica fora do IVA. Sem o preço sem IVA publicado, fizemos a conta em regime da margem."
        : "Sem número de IVA válido no VIES, o IVA da origem não se deduz: fizemos a conta em regime da margem.",
    );
  }
  if (deal.newMeansOfTransport) {
    notes.push(
      "Até 6 000 km ou 6 meses desde a 1.ª matrícula, o carro conta como novo: paga IVA em Portugal e a revenda não pode ser em regime da margem.",
    );
  }
  if (deal.vatDeposit > 0) {
    notes.push(
      "O vendedor costuma pedir uma caução igual ao IVA até receber a prova de transporte. É dinheiro parado, não custo.",
    );
  }

  return {
    deal,
    ptPrice: p.ptPrice,
    verdict: verdictFromMargin(deal.grossMargin, deal.grossMarginPct),
    taxYear: tables.year,
    provisional: tables.provisional === true,
    notes,
  };
}

// ── Por link ─────────────────────────────────────────────────────

/**
 * Formas do mesmo URL que podem estar gravadas no `detail_url`: com e sem
 * `#…`, com e sem a query, com e sem a barra final, em https. Null se o texto
 * não for um URL http(s).
 */
export function listingUrlCandidates(raw: string): string[] | null {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  url.protocol = "https:";
  url.hash = "";
  const withQuery = url.toString();
  url.search = "";
  const withoutQuery = url.toString();
  const out = new Set<string>();
  for (const u of [withQuery, withoutQuery]) {
    out.add(u);
    out.add(u.endsWith("/") ? u.slice(0, -1) : `${u}/`);
  }
  return [...out];
}

/** O que a procura por link lê do anúncio (e da estimativa, quando a há). */
export interface ListingLookupRow {
  id: string;
  country: string | null;
  postal_code: string | null;
  price: number | null;
  km: number | null;
  year: number | null;
  fuel: string | null;
  displacement_cc: number | null;
  co2: number | null;
  first_registration: string | Date | null;
  /** `import_cost_estimates.inputs`: as specs efetivas que a ficha usou */
  inputs: {
    cc?: number | null;
    co2?: number | null;
    fuel?: string;
    firstRegistration?: string;
  } | null;
  pt_estimated_price: number | null;
}

/**
 * Anúncio → formulário. Com estimativa, as specs são as que o pipeline usou
 * (incluem o que veio do catálogo quando o anúncio não as trazia), para a conta
 * bater com a ficha. Sem estimativa, ficam as do anúncio. Sem data da 1.ª
 * matrícula, 1 de julho do ano — o mesmo fallback do pipeline
 * (scripts/pipeline/compute-costs.ts).
 */
export function listingToFields(row: ListingLookupRow): CalculatorFields {
  const s = (v: number | null | undefined) => (v == null ? "" : String(v));
  const fr = row.inputs?.firstRegistration ?? row.first_registration;
  const firstRegistration =
    fr instanceof Date
      ? fr.toISOString().slice(0, 10)
      : typeof fr === "string"
        ? fr.slice(0, 10)
        : row.year
          ? `${row.year}-07-01`
          : "";
  const fuel = row.inputs?.fuel ?? row.fuel ?? "";
  return {
    ...EMPTY_FIELDS,
    country: CALCULATOR_COUNTRIES.includes(row.country as CountryCode)
      ? (row.country as string)
      : EMPTY_FIELDS.country,
    postalCode: row.postal_code ?? "",
    price: s(row.price),
    fuel: CALCULATOR_FUELS.includes(fuel as FuelType) ? fuel : EMPTY_FIELDS.fuel,
    displacementCc: s(row.inputs?.cc ?? row.displacement_cc),
    co2: s(row.inputs?.co2 ?? row.co2),
    firstRegistration,
    km: s(row.km),
    ptPrice: s(row.pt_estimated_price),
  };
}

// ── Servidor ─────────────────────────────────────────────────────

export type CalculatorResponse =
  | { ok: true; result: CalculatorResult }
  | { ok: false; errors?: FieldErrors; message?: string };

export type LookupResponse =
  | { status: "invalid" }
  | { status: "not_found" }
  | { status: "error" }
  | {
      status: "found";
      fields: CalculatorFields;
      listing: { id: string; title: string; hasEstimate: boolean; unavailable: boolean };
    };

const NO_ACCESS = "A tua sessão terminou ou a subscrição não está ativa. Volta a entrar.";

/** Só stands com acesso fazem contas (a página está atrás do gate; a action não). */
async function standWithAccess(): Promise<boolean> {
  const { getStand } = await import("./data");
  const { temAcesso } = await import("./subscription");
  const stand = await getStand();
  return Boolean(stand && temAcesso(stand.subscription.status));
}

export async function runCalculator(fields: CalculatorFields): Promise<CalculatorResponse> {
  if (!(await standWithAccess())) return { ok: false, message: NO_ACCESS };
  const now = new Date();
  const parsed = parseCalculatorFields(fields, now);
  if (!parsed.ok) return { ok: false, errors: parsed.errors };

  try {
    const { db } = await import("../db");
    const { loadTaxTables } = await import("./engine/tax-tables");
    // O mesmo ano do pipeline (compute-costs.ts): o de hoje. Sem as tabelas
    // desse ano o loadTaxTables rebenta de propósito, e aqui dizemo-lo.
    const tables = await loadTaxTables(db, now.getFullYear());
    return { ok: true, result: calculate(parsed.value, tables, { now }) };
  } catch (err) {
    console.error("calculadora: falha a calcular", err);
    return {
      ok: false,
      message:
        "Não conseguimos fazer a conta agora: as tabelas de impostos deste ano podem ainda não estar carregadas. Tenta mais tarde.",
    };
  }
}

export async function findListingByUrl(rawUrl: string): Promise<LookupResponse> {
  if (!(await standWithAccess())) return { status: "error" };
  const candidates = listingUrlCandidates(rawUrl);
  if (!candidates) return { status: "invalid" };

  try {
    const { db } = await import("../db");
    const { sql } = await import("drizzle-orm");
    // Sem índice no detail_url: é um seq scan à montra publicada (dezenas de
    // milhares de linhas), por clique — aceitável. Se a tabela crescer, o índice
    // vem num pacote de schema (só o P01 cria migrations).
    const rows = (await db.execute(sql`
      select l.id, l.country, l.postal_code, l.price, l.km, l.year, l.fuel,
             l.displacement_cc, l.co2, l.first_registration, l.make_raw, l.model_raw,
             l.variant, l.deleted_at, e.inputs, e.pt_estimated_price
      from listings l
      left join import_cost_estimates e on e.listing_id = l.id
      where l.detail_url in (${sql.join(
        candidates.map((c) => sql`${c}`),
        sql`, `,
      )})
        and l.country = any(${`{${CALCULATOR_COUNTRIES.join(",")}}`}::text[])
      order by (l.deleted_at is null) desc, l.last_seen_at desc
      limit 1
    `)) as unknown as (ListingLookupRow & {
      make_raw: string | null;
      model_raw: string | null;
      variant: string | null;
      deleted_at: string | Date | null;
    })[];
    const row = rows[0];
    if (!row) return { status: "not_found" };
    return {
      status: "found",
      fields: listingToFields(row),
      listing: {
        id: row.id,
        title: [row.make_raw, row.variant ?? row.model_raw].filter(Boolean).join(" ") || "Anúncio",
        hasEstimate: row.pt_estimated_price != null,
        unavailable: row.deleted_at != null,
      },
    };
  } catch (err) {
    console.error("calculadora: falha a procurar o anúncio", err);
    return { status: "error" };
  }
}
