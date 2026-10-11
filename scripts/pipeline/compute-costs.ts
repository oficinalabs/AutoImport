/**
 * Cálculo do negócio por anúncio estrangeiro: preço PT estimado (pt-market) +
 * conta do stand (`computeDeal` do cost engine: regime de IVA, custo efetivo,
 * caução, IVA de saída, margem bruta) → veredito pela MARGEM → upsert em
 * import_cost_estimates, com os comparáveis PT (`pt_sample`).
 * A montra é calculada para um stand com n.º de IVA no VIES e com os custos por
 * omissão (despachante, preparação — plano §5); o P09 recalcula para cada stand.
 * `savings`/`savings_pct` (PVP PT − custo total) continuam a ser escritas para
 * quem ainda as lê (cartões, ordenação, oportunidades).
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
 * Mais três razões para NÃO haver estimativa, todas contra margens infladas:
 *  - o anúncio DECLARA que o preço não é de retalho ("-Motorschaden-", "nur an
 *    Händler/Export") — no `elegivel` abaixo, ver lib/engine/not-retail.ts;
 *  - carro acima de `HIGH_VALUE_EUR` com amostra PT < `MIN_SAMPLE_HIGH_VALUE`
 *    (lib/engine/pt-market.ts): no topo da gama um model_id junta a escada de
 *    trims toda e a potência não a separa;
 *  - poupança ≥ `MAX_UNPROVEN_SAVINGS_PCT` SEM amostra de origem que a prove
 *    (lib/engine/origin-market.ts).
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
import type { SourceVatRegime } from "../../lib/cost-engine";
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

/**
 * A montra é calculada para um stand com n.º de IVA válido no VIES (DEFAULT,
 * plano §5: "é um stand"). Quem não tiver desliga-o nos seus custos (P09), que
 * recalculam à leitura sem mexer no que aqui se grava.
 */
const STAND_VAT_REGISTERED = true;

function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

export async function computeCosts(opts: { all?: boolean } = {}) {
  const all = opts.all ?? false;
  assertWritable(dbUrl());
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const {
    computeDeal,
    co2Norm,
    ES_EXCLUDED_POSTAL_PREFIXES,
    ES_EXCLUDED_REGION_REGEX_SOURCE,
    FR_EXCLUDED_POSTAL_PREFIXES,
    FR_EXCLUDED_REGION_REGEX_SOURCE,
    NEW_VEHICLE_MAX_KM,
    NEW_VEHICLE_MAX_MONTHS,
  } = await import("../../lib/cost-engine");
  const { NOT_RETAIL_REGEX_SOURCE } = await import("../../lib/engine/not-retail");
  const { MAX_UNPROVEN_SAVINGS_PCT, MIN_ORIGIN_RATIO, estimateOriginPrice } = await import(
    "../../lib/engine/origin-market"
  );
  const { HIGH_VALUE_EUR, MIN_SAMPLE_HIGH_VALUE, estimatePtPrice } = await import(
    "../../lib/engine/pt-market"
  );
  const { loadTaxTables } = await import("../../lib/engine/tax-tables");
  const { buildUsCatalog } = await import("../../lib/engine/us-catalog");
  const { verdictFromMargin } = await import("../../lib/verdict");

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

    -- O anúncio DECLARA que o preço não é de retalho, ou que o carro não circula
    -- ("-Motorschaden-", "KEIN TÜV", "+nur an Händler/Export+", "Verkauf nur an
    -- Gewerbe"). Ver lib/engine/not-retail.ts: é o sinal DIRETO dos casos que a
    -- guarda estatística do preço de origem só apanha quando tem n≥5 comparáveis
    -- no mesmo país — e no topo da montra 43 dos 200 primeiros passavam por falta
    -- de amostra, precisamente por serem carros anómalos. O coalesce mantém o
    -- fragmento estritamente booleano: sem variant o predicado dá false (não
    -- excluir por falta de dados), nunca NULL — a limpeza das órfãs acima lê
    -- "not coalesce(…, false)".
    and not coalesce(l.variant ~* ${NOT_RETAIL_REGEX_SOURCE}, false)
    and l.year is not null
    and l.km is not null
    and l.fuel is not null

    -- "Meio de transporte novo" (RITI; isNewMeansOfTransport em
    -- lib/cost-engine/new-vehicle.ts): ≤6 000 km OU ≤6 meses desde a 1.ª
    -- matrícula → paga sempre IVA PT e não pode ir para a margem. Continua FORA
    -- da montra: nos casos do topo o IVA era maior que a "poupança" (F8 Tributo
    -- com 900 km: poupança 47.681, IVA 69.667). As constantes são as do motor,
    -- para a regra SQL e a do TS não se afastarem.
    and l.km > ${NEW_VEHICLE_MAX_KM}
    -- Matrícula desconhecida (~2/3 dos estrangeiros) não exclui aqui: só a que
    -- se SABE recente (o ciclo abaixo apanha a data ASSUMIDA). O "is null or"
    -- mantém o predicado booleano (nunca NULL) — a limpeza das órfãs abaixo lê
    -- not coalesce(…, false).
    and (l.first_registration is null
         or l.first_registration <= now() - make_interval(months => ${NEW_VEHICLE_MAX_MONTHS}))
    -- Territórios que o motor não sabe calcular (lib/cost-engine/territory.ts):
    -- ES ilhas + Ceuta e Melilla; FR DOM (97x) e Córsega (20xxx, 2A/2B). Fora do
    -- território IVA da UE ou sem transporte conhecido → fora da montra.
    -- Os coalesce mantêm o fragmento estritamente booleano: sem CP nem região
    -- o predicado dá false (não excluir por falta de dados), nunca NULL.
    and not (
      coalesce(l.country, '') = 'ES'
      and (
        left(coalesce(l.postal_code, ''), 2) = any(${`{${ES_EXCLUDED_POSTAL_PREFIXES.join(",")}}`}::text[])
        or coalesce(l.region, '') ~* ${ES_EXCLUDED_REGION_REGEX_SOURCE}
      )
    )
    and not (
      coalesce(l.country, '') = 'FR'
      and (
        upper(left(trim(coalesce(l.postal_code, '')), 2)) = any(${`{${FR_EXCLUDED_POSTAL_PREFIXES.join(",")}}`}::text[])
        or coalesce(l.region, '') ~* ${FR_EXCLUDED_REGION_REGEX_SOURCE}
      )
    )
    -- Veredito oficial de km incoerente (RDW "onlogisch", NL §6.1): o conta-km
    -- recuou. Não se faz a conta de um carro em que os km não merecem confiança.
    and coalesce(l.km_check->>'verdict', '') <> 'incoerente'
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
        -- estimativa da conta antiga (antes do motor de IVA/margem): recalcular
        -- uma vez, sem precisar de --all.
        or e.origin_price_net is null
      )`;

  // cc/CO₂ vêm SÓ do próprio anúncio — nada de fallback às medianas do modelo:
  // o ISV é €5,61/cm³ e uma mediana envenenada/entre-trims produz impostos
  // confiantemente errados (caso real: Série 8 com mediana cc=844 → ISV 1k
  // em vez de ~7k). Sem dados → sem estimativa (nunca adivinhar).
  const pending = (await db.execute(sql`
    select l.id, l.price, l.year, l.km, l.fuel, l.country, l.first_registration,
           l.postal_code, l.vat_regime, l.price_net,
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
    postal_code: string | null;
    vat_regime: SourceVatRegime | null;
    price_net: number | null;
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
  let amostraFracaTopo = 0;
  let poupancaNaoProvada = 0;
  let carroNovo = 0;
  const verdicts: Record<string, number> = {};
  const regimes: Record<string, number> = {};

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

    // Carro de alto valor com amostra PT pequena (ver HIGH_VALUE_EUR em
    // lib/engine/pt-market.ts): no topo da gama um model_id junta a escada de
    // trims toda (Urus 4.0 V8 / S / Performante partilham mid E potência), e é
    // onde cada erro de margem vale mais dinheiro por anúncio.
    if (l.price >= HIGH_VALUE_EUR && pt.sampleSize < MIN_SAMPLE_HIGH_VALUE) {
      amostraFracaTopo++;
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

    // A conta de um stand com VIES (DEFAULT, plano §5; o P09 recalcula para quem
    // não tem) e com os custos por omissão do motor (despachante, preparação).
    const deal = computeDeal(
      {
        originPrice: l.price,
        fuel: l.fuel as never,
        displacementCc: ccEfetivo ?? undefined,
        co2: co2Efetivo ?? undefined,
        firstRegistration: firstReg,
        country: l.country as CountryCode,
        sourceVatRegime: l.vat_regime,
        priceNet: l.price_net,
        postalCode: l.postal_code,
        km: l.km,
      },
      pt.estimatedPrice,
      { tables, standVatRegistered: STAND_VAT_REGISTERED },
    );

    // O `elegivel` já tirou os carros que se SABE serem novos; aqui fica o que só
    // a data ASSUMIDA (1 de julho do ano) torna novo — um carro deste ano sem
    // matrícula conhecida. O lado seguro é não o mostrar: a conta dele seria em
    // regime normal, com IVA PT sobre o PVP todo.
    if (deal.newMeansOfTransport) {
      carroNovo++;
      await dropStale(l.est_id);
      continue;
    }

    const savings = pt.estimatedPrice - deal.totalPt;
    const savingsPct = Math.round((savings / pt.estimatedPrice) * 1000) / 10;

    // Poupança extrema que NINGUÉM pôde provar: o `origin` é null (n<5 no próprio
    // mercado) e a margem é grande demais para se publicar sem medição por trás.
    // Ver MAX_UNPROVEN_SAVINGS_PCT em lib/engine/origin-market.ts — não é um tecto
    // cego à margem: quem está acima do limiar MAS tem amostra de origem que o
    // valida passa. Tem de vir aqui (e não junto do MIN_ORIGIN_RATIO acima) porque
    // depende da conta. Mede-se sobre o preço ANUNCIADO (a caução de IVA volta a
    // somar-se): o limiar foi calibrado assim, e o desconto do IVA dedutível não
    // é poupança — volta a pagar-se em IVA de saída na revenda.
    const advertisedSavingsPct =
      Math.round(((savings - deal.vatDeposit) / pt.estimatedPrice) * 1000) / 10;
    if (!origin && advertisedSavingsPct >= MAX_UNPROVEN_SAVINGS_PCT) {
      poupancaNaoProvada++;
      await dropStale(l.est_id);
      continue;
    }

    const verdict = verdictFromMargin(deal.grossMargin, deal.grossMarginPct);
    verdicts[verdict] = (verdicts[verdict] ?? 0) + 1;
    regimes[deal.vatRegime] = (regimes[deal.vatRegime] ?? 0) + 1;

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
      isv: deal.isvDetail,
    };

    await db.execute(sql`
      insert into import_cost_estimates (
        listing_id, origin_price, transport, isv, iuc, legalization, total_pt,
        pt_estimated_price, pt_sample_size, pt_confidence,
        savings, savings_pct, verdict, isv_table_year, inputs,
        vat_regime, origin_price_net, vat_deposit, preparation, despachante,
        output_vat, gross_margin, gross_margin_pct, pt_sample, computed_at
      ) values (
        ${l.id}, ${deal.originPrice}, ${deal.transport}, ${deal.isv},
        ${deal.iuc}, ${deal.legalization}, ${deal.totalPt},
        ${pt.estimatedPrice}, ${pt.sampleSize}, ${pt.confidence},
        ${savings}, ${savingsPct}, ${verdict}, ${ISV_YEAR},
        ${JSON.stringify(inputs)}::jsonb,
        ${deal.vatRegime}, ${deal.originPriceNet}, ${deal.vatDeposit}, ${deal.preparation},
        ${deal.despachante}, ${deal.outputVat}, ${deal.grossMargin}, ${deal.grossMarginPct},
        ${JSON.stringify(pt.sample)}::jsonb, now()
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
        vat_regime = excluded.vat_regime,
        origin_price_net = excluded.origin_price_net,
        vat_deposit = excluded.vat_deposit,
        preparation = excluded.preparation,
        despachante = excluded.despachante,
        output_vat = excluded.output_vat,
        gross_margin = excluded.gross_margin,
        gross_margin_pct = excluded.gross_margin_pct,
        pt_sample = excluded.pt_sample,
        computed_at = now()
    `);
    computed++;
  }

  console.log(
    `compute-costs: ${computed}/${pending.length} calculados · sem cc/CO₂ ${semDados} · sem amostra PT ${semAmostra} · preço de origem implausível ${origemImplausivel} · amostra fraca no topo ${amostraFracaTopo} · poupança não provada ${poupancaNaoProvada} · carro novo (data assumida) ${carroNovo} · vereditos ${JSON.stringify(verdicts)} · regimes ${JSON.stringify(regimes)}`,
  );
  return {
    pending: pending.length,
    computed,
    semDados,
    semAmostra,
    origemImplausivel,
    amostraFracaTopo,
    poupancaNaoProvada,
    carroNovo,
    verdicts,
    regimes,
  };
}

if (process.argv[1]?.endsWith("compute-costs.ts")) {
  computeCosts({ all: flag("all") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
