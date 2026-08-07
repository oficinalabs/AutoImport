/**
 * Cálculo do negócio por anúncio estrangeiro: custo total de importação
 * (cost engine) + preço PT estimado (pt-market) → poupança e veredito →
 * upsert em import_cost_estimates.
 *   pnpm exec tsx scripts/pipeline/compute-costs.ts          # só os pendentes
 *   pnpm exec tsx scripts/pipeline/compute-costs.ts --all    # recomputa tudo
 * Recomputa quando: sem estimativa, anúncio atualizado depois do cálculo, ou o
 * tier efetivo (exato/designacao) do anúncio diverge do gravado na estimativa
 * (backfill/rematch não tocam no updated_at — sem esta condição ficariam presos
 * com a estimativa antiga). `--all` ignora esta condição (o `elegivel` continua
 * a mandar): mudar as guardas da amostra PT não mexe em nenhum destes sinais.
 * Sem CO₂/cilindrada (não-elétricos) ou sem amostra PT → sem estimativa
 * (nunca adivinhar, nunca mostrar veredito fraco). Preço de origem implausível
 * face ao PRÓPRIO mercado estrangeiro (lib/engine/origin-market.ts) → também sem
 * estimativa: metade do que o mercado dele pede não é negócio, é avaria/erro.
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
import { assertWritable, dbUrl } from "../../lib/db-url";
import type { DesignationFacts } from "../../lib/engine/match-version";
import type { GenWindow } from "../../lib/engine/pt-market";
import type { CountryCode } from "../../lib/types";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const FOREIGN: CountryCode[] = ["DE", "FR", "BE", "NL", "ES"];

/**
 * Ano das tabelas fiscais a aplicar. **Deriva da data de hoje**, não é uma
 * constante — e isso é o ponto.
 *
 * Estava escrito `2026` à mão. As tabelas de ISV e IUC mudam todos os anos com o
 * Orçamento do Estado, e a 1 de janeiro de 2027 este número continuaria a dizer
 * 2026: o `loadTaxTables` encontrava as tabelas de 2026 na base, não se queixava
 * de nada, e o pipeline passava a publicar impostos do ano errado — em silêncio,
 * com dinheiro pelo meio, num produto cuja única promessa é a conta estar certa.
 *
 * Derivado de `now()`, o que acontece a 1 de janeiro é o oposto: as tabelas do
 * ano novo ainda não estão semeadas, o `loadTaxTables` **rebenta** com o ano e o
 * `kind` em falta, e o pipeline pára. É deliberado — é a mesma escolha do
 * `migrate-deploy` (migration a falhar falha o build de propósito) e do
 * `daily-batch` (vermelho honesto em vez de verde a mentir).
 *
 * Parar não apaga nada: as estimativas já calculadas ficam, com o
 * `isv_table_year` que lhes corresponde. O que deixa de haver são estimativas
 * NOVAS — e o alarme de frescura (`pnpm pipeline:frescura`) grita por isso ao
 * fim de 36 h, portanto ninguém fica sem saber.
 *
 * `ISV_YEAR=2026` no ambiente força um ano — serve para os testes não
 * dependerem da data e para recalcular um ano fechado.
 */
const ISV_YEAR = Number(process.env.ISV_YEAR) || new Date().getFullYear();

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function computeCosts(opts: { all?: boolean } = {}) {
  const all = opts.all ?? false;
  assertWritable(dbUrl());
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const {
    computeCostBreakdown,
    co2Norm,
    ES_ISLAND_POSTAL_PREFIXES,
    ES_ISLAND_REGION_REGEX_SOURCE,
  } = await import("../../lib/cost-engine");
  const { MIN_ORIGIN_RATIO, estimateOriginPrice } = await import("../../lib/engine/origin-market");
  const { estimatePtPrice } = await import("../../lib/engine/pt-market");
  const { loadTaxTables } = await import("../../lib/engine/tax-tables");
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

  // Quem PODE ter estimativa. Fonte única: serve o `pending` (abaixo) e a limpeza
  // das órfãs. Sem a partilha, apertar a regra aqui deixava para trás as estimativas
  // já gravadas — o `dropStale` só visita quem entra no `pending`, portanto o que a
  // regra passa a excluir nunca mais é visitado. Foi assim que 4 anúncios "sob
  // consulta" continuaram a ser oportunidades depois da guarda do preço 0.
  const elegivel = sql`
        l.country = any(${`{${FOREIGN.join(",")}}`}::text[])
    and l.deleted_at is null
    and l.model_id is not null -- o join a vehicle_models é inner
    and l.is_damaged is not true -- sinistrado barato ≠ oportunidade
    and l.detail_url not like '%/leilao/%' -- leilões (autoline): o preço é a licitação corrente, não um preço de venda
    and l.price > 0 -- 0 = "sob consulta", não é um preço: sem ele a poupança seria a mediana PT inteira
    and l.year is not null
    and l.km is not null
    and l.fuel is not null

    -- RITI: ≤6 000 km OU <6 meses desde a 1.ª matrícula = "meio de transporte
    -- novo" → 23% de IVA em Portugal, que o motor NÃO modela (cost-engine soma
    -- preço+transporte+ISV+IUC+legalização, sem IVA). Decisão do dono do
    -- produto: excluir em vez de modelar — a semântica do IVA no preço anunciado
    -- em ES/DE é ambígua (com/sem, regime de margem vs. geral) e não a sabemos
    -- por anúncio; modelar era adivinhar. Nos casos do topo o IVA em falta era
    -- maior que a "poupança" (F8 Tributo com 900 km: poupança 47.681, IVA
    -- 69.667) — prejuízo apresentado como negócio.
    and l.km > 6000
    -- Matrícula desconhecida (~2/3 dos estrangeiros) não exclui: só a que se
    -- SABE recente. O "is null or" mantém o predicado booleano (nunca NULL) —
    -- a limpeza das órfãs abaixo lê not coalesce(…, false).
    and (l.first_registration is null or l.first_registration <= now() - interval '6 months')
    -- Ilhas espanholas (Canárias/Baleares): o motor não as sabe calcular
    -- (transporte é um fixo de camião, e as Canárias estão fora do território
    -- IVA da UE) → fora da montra. Ver lib/cost-engine/territory.ts.
    -- Os coalesce mantêm o fragmento estritamente booleano: sem CP nem região
    -- o predicado dá false (não excluir por falta de dados), nunca NULL.
    and not (
      coalesce(l.country, '') = 'ES'
      and (
        left(coalesce(l.postal_code, ''), 2) = any(${`{${ES_ISLAND_POSTAL_PREFIXES.join(",")}}`}::text[])
        or coalesce(l.region, '') ~* ${ES_ISLAND_REGION_REGEX_SOURCE}
      )
    )
  `;

  // Estimativas de anúncios que já não são elegíveis. `coalesce(…, false)`: um
  // predicado NULL (ex.: preço nulo) é inelegível, não "desconhecido logo fica".
  const orfas = (await db.execute(sql`
    delete from import_cost_estimates e
    using listings l
    where l.id = e.listing_id and not coalesce((${elegivel}), false)
    returning e.id
  `)) as unknown as { id: string }[];
  if (orfas.length) console.log(`compute-costs: ${orfas.length} estimativas órfãs apagadas`);

  // recompute: novo/atualizado, OU o tier efetivo (exato/designacao) do
  // anúncio diverge do gravado na estimativa, OU o DERIVADO que confina a
  // amostra PT mudou (o rematch reescreve facts/versão sem tocar no
  // updated_at — sem isto, uma estimativa calculada com a amostra antiga
  // contaminada por outro corpo ficava presa). Tudo estabiliza à 1.ª
  // recomputação: designacao compara facts↔inputs; exato só recomputa
  // enquanto a estimativa ainda não gravou derivative (as novas gravam sempre).
  // `--all` ignora esta condição — e SÓ esta: o `elegivel` continua a mandar em
  // quem PODE ter estimativa. É a saída para mudanças que não deixam rasto em
  // nenhum destes sinais (ex.: guardas da amostra PT em lib/engine/pt-market.ts
  // ou a do preço de origem em lib/engine/origin-market.ts), que de outro modo
  // deixariam as estimativas gravadas presas nos valores velhos.
  const recompute = all
    ? sql`true`
    : sql`(
        e.id is null
        or l.updated_at > e.computed_at
        or (case when l.match_confidence = 'exato' and l.us_version_id is not null then 'exato'
                 when l.match_confidence = 'designacao' and l.designation_facts is not null then 'designacao' end)
           is distinct from e.inputs->>'matchKind'
        or (l.match_confidence = 'designacao'
            and (l.designation_facts->>'derivative') is distinct from e.inputs->>'derivative')
        or (l.match_confidence = 'exato' and l.us_version_id is not null
            and e.inputs->>'derivative' is null)
      )`;

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
    where (${elegivel})
      and ${recompute}
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

  if (all)
    console.log(
      `compute-costs: --all — ${pending.length} anúncios elegíveis a recomputar (ignora a condição de recompute)`,
    );

  let computed = 0;
  let semDados = 0;
  let semAmostra = 0;
  let origemImplausivel = 0;
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
      l.km,
      powerEfetivo,
      genWindow,
      excludeMids,
    );
    if (!pt) {
      semAmostra++;
      await dropStale(l.est_id);
      continue;
    }

    // Plausibilidade do preço de ORIGEM (lib/engine/origin-market.ts): metade do
    // que o próprio mercado estrangeiro pede pelo mesmo carro não é negócio — é
    // avaria não declarada, erro de digitação ou venda só a profissionais.
    // DEPOIS do estimatePtPrice de propósito: dos 325 005 elegíveis só ~79 000
    // chegam a ter amostra PT, e adiar a guarda poupa 3/4 destas queries.
    // Sem amostra de origem (n<5, ~8% dos casos) PASSA — sem prova não se recusa.
    const origin = await estimateOriginPrice(
      db,
      l.model_id,
      l.country,
      l.year,
      l.km,
      powerEfetivo,
      l.id,
    );
    if (origin && l.price / origin.median < MIN_ORIGIN_RATIO) {
      origemImplausivel++;
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
      // Guarda de plausibilidade do preço de origem: a mediana do próprio mercado
      // e o n que a sustentam. null/null = sem amostra (n<5) — a estimativa
      // passou por falta de prova, não por ter sido validada.
      originMedian: origin?.median ?? null,
      originSampleSize: origin?.n ?? null,
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
    `compute-costs: ${computed}/${pending.length} calculados · sem cc/CO₂ ${semDados} · sem amostra PT ${semAmostra} · preço de origem implausível ${origemImplausivel} · vereditos ${JSON.stringify(verdicts)}`,
  );
  return { pending: pending.length, computed, semDados, semAmostra, origemImplausivel, verdicts };
}

if (process.argv[1]?.endsWith("compute-costs.ts")) {
  computeCosts({ all: flag("all") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
