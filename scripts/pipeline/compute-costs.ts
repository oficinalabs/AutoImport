/**
 * Cálculo do negócio por anúncio estrangeiro: custo total de importação
 * (cost engine) + preço PT estimado (pt-market) → poupança e veredito →
 * upsert em import_cost_estimates.
 *   pnpm exec tsx scripts/pipeline/compute-costs.ts
 * Recomputa quando: sem estimativa, anúncio atualizado depois do cálculo, ou o
 * tier efetivo (exato/designacao) do anúncio diverge do gravado na estimativa
 * (backfill/rematch não tocam no updated_at — sem esta condição ficariam presos
 * com a estimativa antiga).
 * Sem CO₂/cilindrada (não-elétricos) ou sem amostra PT → sem estimativa
 * (nunca adivinhar, nunca mostrar veredito fraco).
 *
 * Specs efetivas do catálogo (fill-only-missing) por tier do match:
 *  - `exato`: cc/CO₂/potência em falta vêm da versão canónica; a janela de
 *    geração da versão confina a mediana PT (evita contaminar com a geração
 *    vizinha);
 *  - `designacao`: vêm dos factos gravados (specs medianas + janela direta),
 *    sem versão canónica (o motor está provado, a variante não);
 *  - resto: só o anúncio.
 * A norma do CO₂ segue sempre o ano de matrícula (isv.ts), sem cross-norma.
 */
import type { DesignationFacts } from "../../lib/engine/match-version";
import type { GenWindow } from "../../lib/engine/pt-market";
import type { CountryCode } from "../../lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const FOREIGN: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];
const ISV_YEAR = 2026;

export async function computeCosts() {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const { computeCostBreakdown, co2Norm } = await import("../../lib/cost-engine");
  const { estimatePtPrice } = await import("../../lib/engine/pt-market");
  const { loadTaxTables } = await import("../../lib/engine/tax-tables");
  const { kmBand } = await import("../../lib/engine/normalize-vehicle");
  const { buildUsCatalog } = await import("../../lib/engine/us-catalog");
  const { verdictFromSavings } = await import("../../lib/verdict");

  const tables = await loadTaxTables(db, ISV_YEAR);

  // Índice do catálogo (para as janelas de geração das versões confirmadas).
  const catalog = await buildUsCatalog(db);
  /** Janela de geração da versão (via mid → geração do índice); indatada → sem guard. */
  function genWindowOfMid(mid: string | null): GenWindow | undefined {
    if (!mid) return undefined;
    const info = catalog.midInfo.get(mid);
    if (!info) return undefined;
    const family = catalog.byFamily.get(`${info.makeSlug}|${info.family}`);
    const gen = family?.generations.find((g) => g.id === info.generationId);
    if (!gen || gen.yearStart == null) return undefined;
    return { start: gen.yearStart, end: gen.yearEnd };
  }

  /** Mids da família `family` (chave `make|família` da evidência) cujo derivado
   * DIFERE do do estrangeiro — para confinar a amostra PT ao mesmo corpo/derivado.
   * `""` (base) é derivado válido e ≠ null: um estrangeiro base exclui os Gran
   * Coupé/Cabrio (mais caros → margem falsa), mas nunca os outros base. */
  function excludeMidsForDerivative(family: string, foreignDerivative: string): string[] {
    const out: string[] = [];
    for (const [mid, info] of catalog.midInfo) {
      if (`${info.makeSlug}|${info.family}` === family && info.derivative !== foreignDerivative)
        out.push(mid);
    }
    return out;
  }

  // cc/CO₂ vêm SÓ do próprio anúncio — nada de fallback às medianas do modelo:
  // o ISV é €5,61/cm³ e uma mediana envenenada/entre-trims produz impostos
  // confiantemente errados (caso real: Série 8 com mediana cc=844 → ISV 1k
  // em vez de ~7k). Sem dados → sem estimativa (nunca adivinhar).
  const pending = (await db.execute(sql`
    select l.id, l.price, l.year, l.km, l.fuel, l.country, l.first_registration,
           l.displacement_cc as cc,
           l.co2 as co2,
           l.power_hp,
           l.model_id,
           l.match_confidence,
           l.match_evidence,
           l.us_version_id,
           l.designation_facts,
           v.mid as v_mid,
           v.displacement_cc as v_cc,
           v.co2_wltp as v_co2_wltp,
           v.co2_nedc as v_co2_nedc,
           v.power_hp as v_power,
           e.id as est_id
    from listings l
    join vehicle_models vm on vm.id = l.model_id
    left join us_versions v on v.version_id = l.us_version_id
    left join import_cost_estimates e on e.listing_id = l.id
    where l.country = any(${`{${FOREIGN.join(",")}}`}::text[])
      and l.deleted_at is null
      and l.is_damaged is not true -- sinistrado barato ≠ oportunidade
      and l.detail_url not like '%/leilao/%' -- leilões (autoline): o preço é a licitação corrente, não um preço de venda
      and l.price is not null
      and l.year is not null
      and l.km is not null
      and l.fuel is not null
      -- recompute: novo/atualizado, OU o tier efetivo (exato/designacao) do
      -- anúncio diverge do gravado na estimativa, OU o DERIVADO que confina a
      -- amostra PT mudou (o rematch reescreve facts/versão sem tocar no
      -- updated_at — sem isto, uma estimativa calculada com a amostra antiga
      -- contaminada por outro corpo ficava presa). Tudo estabiliza à 1.ª
      -- recomputação: designacao compara facts↔inputs; exato só recomputa
      -- enquanto a estimativa ainda não gravou derivative (as novas gravam sempre).
      and (
        e.id is null
        or l.updated_at > e.computed_at
        or (case when l.match_confidence = 'exato' and l.us_version_id is not null then 'exato'
                 when l.match_confidence = 'designacao' and l.designation_facts is not null then 'designacao' end)
           is distinct from e.inputs->>'matchKind'
        or (l.match_confidence = 'designacao'
            and (l.designation_facts->>'derivative') is distinct from e.inputs->>'derivative')
        or (l.match_confidence = 'exato' and l.us_version_id is not null
            and e.inputs->>'derivative' is null)
      )
  `)) as unknown as {
    id: string;
    price: number;
    year: number;
    km: number;
    fuel: string;
    country: string;
    first_registration: string | null;
    cc: number | null;
    co2: number | null;
    power_hp: number | null;
    model_id: string;
    match_confidence: string | null;
    match_evidence: { geracaoAmbigua?: boolean; family?: string } | null;
    us_version_id: string | null;
    designation_facts: DesignationFacts | null;
    v_mid: string | null;
    v_cc: number | null;
    v_co2_wltp: number | null;
    v_co2_nedc: number | null;
    v_power: number | null;
    est_id: string | null;
  }[];

  let computed = 0;
  let semDados = 0;
  let semAmostra = 0;
  const verdicts: Record<string, number> = {};

  // Apaga a estimativa pré-existente de um anúncio que, ao recomputar, deixou de
  // ser elegível (ex.: janela de geração cortou a amostra) — não deixar veredito
  // órfão. Só toca quando o anúncio tinha mesmo estimativa (est_id não-nulo).
  const dropStale = async (estId: string | null) => {
    if (estId) await db.execute(sql`delete from import_cost_estimates where id = ${estId}`);
  };

  for (const l of pending) {
    const isEv = l.fuel === "elétrico";

    // 1.ª matrícula (fallback 1 de julho do ano do anúncio) — fixa a norma do CO₂.
    const firstReg = l.first_registration
      ? new Date(l.first_registration)
      : new Date(`${l.year}-07-01`);
    const regYear = firstReg.getFullYear();

    // Specs efetivas: fill-only-missing (nunca substituímos um valor que o
    // anúncio traz). 3 ramos consoante o tier do match:
    //  - exato: a versão do catálogo via join; janela de geração da versão
    //    (off se geracaoAmbigua);
    //  - designacao: os factos gravados (specs medianas + janela direta);
    //  - resto: só o anúncio.
    const exato = l.match_confidence === "exato" && l.us_version_id != null;
    let matchKind: "exato" | "designacao" | null = null;
    const fromCatalog: string[] = [];
    let ccEfetivo = l.cc;
    let co2Efetivo = l.co2;
    let powerEfetivo = l.power_hp;
    let genWindow: GenWindow | undefined;
    // Derivado/corpo PROVADO do estrangeiro (ramo exato → do índice pelo mid da
    // versão; ramo designacao → dos factos). "" = base; null = desconhecido.
    let foreignDerivative: string | null = null;
    if (exato) {
      matchKind = "exato";
      foreignDerivative = l.v_mid ? (catalog.midInfo.get(l.v_mid)?.derivative ?? null) : null;
      if (ccEfetivo == null && l.v_cc != null) {
        ccEfetivo = l.v_cc;
        fromCatalog.push("cc");
      }
      if (co2Efetivo == null) {
        // norma do ano de matrícula (isv.ts): sem cross-norma — se a versão não
        // tem o CO₂ dessa norma, fica null (continua semDados; nunca converter).
        const vCo2 = co2Norm(regYear) === "wltp" ? l.v_co2_wltp : l.v_co2_nedc;
        if (vCo2 != null) {
          co2Efetivo = vCo2;
          fromCatalog.push("co2");
        }
      }
      if (powerEfetivo == null && l.v_power != null) {
        powerEfetivo = l.v_power;
        fromCatalog.push("power");
      }
      // Janela de geração da versão — desligada quando a geração ficou ambígua.
      if (!l.match_evidence?.geracaoAmbigua) genWindow = genWindowOfMid(l.v_mid);
    } else if (l.match_confidence === "designacao" && l.designation_facts != null) {
      matchKind = "designacao";
      const f = l.designation_facts;
      // linhas antigas de designacao não têm `derivative` gravado → null.
      foreignDerivative = f.derivative ?? null;
      if (ccEfetivo == null && f.displacementCc != null) {
        ccEfetivo = f.displacementCc;
        fromCatalog.push("cc");
      }
      if (co2Efetivo == null) {
        // mesma norma pela matrícula; sem cross-norma (a designação guarda ambas).
        const fCo2 = co2Norm(regYear) === "wltp" ? f.co2Wltp : f.co2Nedc;
        if (fCo2 != null) {
          co2Efetivo = fCo2;
          fromCatalog.push("co2");
        }
      }
      if (powerEfetivo == null && f.powerHp != null) {
        powerEfetivo = f.powerHp;
        fromCatalog.push("power");
      }
      // Janela de geração direta dos factos (sem lookup no catálogo).
      genWindow = f.genWindow ?? undefined;
    }

    if (!isEv && (ccEfetivo == null || co2Efetivo == null)) {
      semDados++;
      await dropStale(l.est_id);
      continue;
    }
    // Potência obrigatória (regra do produto: matching só com o mesmo
    // modelo/designação — a potência é a assinatura que o garante).
    if (powerEfetivo == null) {
      semDados++;
      await dropStale(l.est_id);
      continue;
    }

    // Confina a amostra PT ao mesmo derivado/corpo do estrangeiro: exclui os mids
    // da família cujo derivado é OUTRO (caso real: um 216d Gran Tourer comparado
    // com Gran Coupés, mais caros → margem falsa). Só quando o derivado é conhecido
    // e a evidência traz a família; lista vazia → não passa (nada a excluir).
    let excludeMids: string[] | undefined;
    if (foreignDerivative != null && l.match_evidence?.family) {
      const mids = excludeMidsForDerivative(l.match_evidence.family, foreignDerivative);
      if (mids.length) excludeMids = mids;
    }

    const pt = await estimatePtPrice(
      db,
      l.model_id,
      l.year,
      kmBand(l.km),
      powerEfetivo,
      genWindow,
      excludeMids,
    );
    if (!pt) {
      semAmostra++;
      await dropStale(l.est_id);
      continue;
    }

    const { breakdown, isvDetail } = computeCostBreakdown(
      {
        originPrice: l.price,
        fuel: l.fuel as never,
        displacementCc: ccEfetivo ?? undefined,
        co2: co2Efetivo ?? undefined,
        firstRegistration: firstReg,
        country: l.country as CountryCode,
      },
      tables,
    );

    const savings = pt.estimatedPrice - breakdown.totalPt;
    const savingsPct = Math.round((savings / pt.estimatedPrice) * 1000) / 10;
    const verdict = verdictFromSavings(savingsPct);
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;

    const inputs = {
      cc: ccEfetivo,
      co2: co2Efetivo,
      fuel: l.fuel,
      firstRegistration: firstReg.toISOString().slice(0, 10),
      firstRegistrationAssumed: !l.first_registration,
      // Proveniência (auditabilidade): o tier efetivo + de onde vieram as specs.
      // exato → version_id; designacao → só factos (fromCatalog + janela).
      matchKind,
      // derivado/corpo que confinou a amostra PT (quando conhecido): "" = base.
      ...(foreignDerivative != null ? { derivative: foreignDerivative } : {}),
      ...(matchKind === "exato"
        ? { versionId: l.us_version_id, fromCatalog, genWindow: genWindow ?? null }
        : matchKind === "designacao"
          ? { fromCatalog, genWindow: genWindow ?? null }
          : {}),
      isv: isvDetail,
    };

    await db.execute(sql`
      insert into import_cost_estimates (
        listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
        pt_estimated_price, pt_sample_size, pt_confidence,
        savings, savings_pct, verdict, isv_table_year, inputs, computed_at
      ) values (
        ${l.id}, ${breakdown.originPrice}, ${breakdown.transport}, ${breakdown.isv},
        ${breakdown.iuc}, ${breakdown.legalization}, ${breakdown.totalPt},
        ${pt.estimatedPrice}, ${pt.sampleSize}, ${pt.confidence},
        ${savings}, ${savingsPct}, ${verdict}, ${ISV_YEAR},
        ${JSON.stringify(inputs)}::jsonb, now()
      )
      on conflict (listing_id) do update set
        origin_price = excluded.origin_price,
        transport = excluded.transport,
        isv = excluded.isv,
        iuc = excluded.iuc,
        legalization = excluded.legalization,
        total_pt = excluded.total_pt,
        pt_estimated_price = excluded.pt_estimated_price,
        pt_sample_size = excluded.pt_sample_size,
        pt_confidence = excluded.pt_confidence,
        savings = excluded.savings,
        savings_pct = excluded.savings_pct,
        verdict = excluded.verdict,
        isv_table_year = excluded.isv_table_year,
        inputs = excluded.inputs,
        computed_at = now()
    `);
    computed++;
  }

  console.log(
    `compute-costs: ${computed}/${pending.length} calculados · sem cc/CO₂ ${semDados} · sem amostra PT ${semAmostra} · vereditos ${JSON.stringify(verdicts)}`,
  );
  return { pending: pending.length, computed, semDados, semAmostra, verdicts };
}

if (process.argv[1]?.endsWith("compute-costs.ts")) {
  computeCosts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
