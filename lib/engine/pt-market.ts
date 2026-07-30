/**
 * Estimativa do preço de mercado PT para um modelo canónico.
 * Amostra primária: mesmo model_id, year±1, km_band±1, observações dos
 * últimos 60 dias (a mais recente por CARRO físico) → MEDIANA (robusta a
 * outliers), com mínimo de 5 anúncios, dispersão mínima de preços/vendedores,
 * um teto de dispersão ROBUSTA (p75−p25)/mediana — a amostra tem de ser um
 * mercado, não uma gama de trims — e um teto de EXCESSO de km do carro sobre a
 * mediana de km da amostra (a banda de 25 000 km não prova comparabilidade).
 * Fallback `alargada`: alarga SÓ a banda de km para ±2 (o ANO fica ±1, como a
 * primária — esticar o ano puxa gerações/facelifts vizinhos), mínimo 3, com as
 * MESMAS guardas mais um teto de spread absoluto (max−min)/mediana. Sem amostra
 * que passe as guardas → null (o anúncio não recebe veredito — nunca adivinhar,
 * nunca comparar fraco).
 */
import { sql } from "drizzle-orm";
import type { db as Db } from "../../db";
import { carIdentitySql } from "./car-identity";
import { kmBand } from "./normalize-vehicle";

export type PtConfidence = "normal" | "alargada";

export interface PtEstimate {
  estimatedPrice: number;
  sampleSize: number;
  confidence: PtConfidence;
}

/**
 * Janela de geração do carro estrangeiro (derivada da versão confirmada do
 * catálogo). Quando presente, as observações PT ficam confinadas à interseção
 * de `year±spread` com [start, end] — impede que a mediana de um anúncio da
 * geração nova seja contaminada por carros PT da geração velha de anos vizinhos
 * (fronteira de geração). `end` null = geração aberta (sem limite superior).
 */
export interface GenWindow {
  start: number;
  end: number | null;
}

const MIN_SAMPLE_NORMAL = 5;
const MIN_SAMPLE_WIDE = 3;
const WINDOW_DAYS = 60;
// Guarda anti-frota (auditoria): amostras de um único stand a preço de tabela
// (ex.: 6× "La Prima" santogal a 23.490 €) não são mercado — TODA a estimativa
// (normal e alargada) exige dispersão mínima de preços e de vendedores.
const MIN_DISTINCT_PRICES = 3;
const MIN_DISTINCT_SELLERS = 2;
// Teto de spread relativo (max−min)/mediana da amostra ALARGADA. Calibração
// read-only na produção (21 jul, 1970 estimativas): das amostras que o novo
// fallback recupera, o spread relativo tem p50 0,22 · p75 0,29 · p95 0,46 ·
// máx 0,85. Cortar em 0,30 (≈p75) mata o quartil patológico — o típico "n=3,
// 57,5k–75k" que não é um preço de mercado, é um intervalo. Sobrevivência por
// teto medida: 0,25→427 · 0,30→550 · 0,35→617. Escolhido 0,30 (honestidade >
// cobertura: as ~550 que passam são amostras coerentes).
const MAX_WIDE_SPREAD = 0.3;
// Teto de dispersão ROBUSTA (p75−p25)/mediana — nos DOIS ramos. Era a lacuna: o
// MAX_WIDE_SPREAD acima só corre no fallback e a montra publica exclusivamente
// `normal` (flag-opportunities, publish e lib/queries filtram por
// pt_confidence='normal'), logo o ramo que chega ao produto não tinha guarda de
// coerência nenhuma — um n=5 de 175k/190k/215k/280k/330k passava n≥5 + ≥3 preços
// + ≥2 vendedores e devolvia "mercado 215k". Caso real medido: Porsche 911 2024,
// n=33 → p25 199 900 € · mediana 243 000 € · p75 375 000 € (IQR 0,72). São
// Carrera, GTS, GT3 e Turbo na mesma amostra: `porsche|911|gasolina` é UM
// model_id e ±10% de potência a 480 cv são ±48 cv, que não separa nada.
// Porquê o IQR e não o (max−min)/mediana do fallback — os dois medidos nas
// 14 741 oportunidades ativas do armazém: (max−min)/mediana tem p50 0,44 abaixo
// de 20 k€ e 68% de TODA a montra excede 0,30 (dois outliers ditam a métrica —
// cortaria uma montra que, na massa, está sã); (p75−p25)/mediana tem p50
// 0,11–0,13 em todas as faixas e só 4,8% excede 0,25. Cortar em 0,25 tira 5,3%
// abaixo de 20 k€ · 4,1% 20–40 k€ · 3,7% 40–80 k€ · 19,3% acima de 80 k€ (é lá
// que o p90 salta de ~0,22 para 0,46) — e apanha 6 dos 10 e 34 dos 100 maiores
// "savings" da montra, quase todos 911. Soma-se ao MAX_WIDE_SPREAD, não o
// substitui: as guardas deste ficheiro só APERTAM, nunca relaxam — quem cair
// fica sem estimativa, e isso é melhor do que um veredito assente numa amostra
// que não é um mercado.
const MAX_IQR_SPREAD = 0.25;
// Teto de EXCESSO de km do carro sobre a amostra: (km+1000)/(mediana de km da
// amostra+1000). Os km NÃO eram critério de comparabilidade — a banda tem 25 000
// km (normalize-vehicle.kmBand) e a amostra usa banda±1, portanto um carro de
// 44 500 km era comparado com a janela 0–74 999 (0–99 999 no fallback ±2). Caso
// real, o nº 1 da montra: Lamborghini Huracán ES 2023, 44 500 km, 254 900 € →
// "poupança" de 123 227 € contra uma amostra n=12 de mediana 419 000 € cuja
// mediana de km é 7 322 — 5,5× menos rodados. E é uma amostra internamente
// COERENTE (IQR 0,09), logo o MAX_IQR_SPREAD acima não lhe toca: só uma guarda de
// km a apanha.
// UNILATERAL de propósito, não é esquecimento: um carro com MENOS km que a
// amostra vale MAIS que a mediana → a poupança fica subestimada, que é o lado
// seguro do erro. Só o EXCESSO de km a inflaciona. O +1000 nos dois lados evita a
// explosão do rácio junto ao zero (um carro de 2 000 km contra uma amostra de
// mediana 100 km não é 20× pior).
// Medido nas 14 741 oportunidades ativas do armazém (amostra primária
// reconstruída em 13 893): rácio p50 1,02 · p90 1,55 · p95 2,14. Cortar em 1,6
// tira 8,2% da montra — 3,7% abaixo de 20 k€ · 16,7% 20–40 k€ · 14,1% 40–80 k€ ·
// 20,3% acima de 80 k€ (a mesma assimetria do IQR: o dano concentra-se no caro) —
// e 1 110 dessas 1 137 (8,0% do total) passariam INCÓLUMES ao MAX_IQR_SPREAD, ou
// seja são exclusivamente desta guarda. Nos maiores "savings" apanha 3 do top 10
// (2 só ela) e 24 do top 100 (14 só ela). Como as anteriores, SOMA-se — as
// guardas deste ficheiro só APERTAM, nunca relaxam.
const MAX_KM_RATIO = 1.6;
/** Piso do rácio de km, em km — os +1000 dos dois lados (ver MAX_KM_RATIO). */
const KM_RATIO_FLOOR = 1000;

async function sample(
  db: typeof Db,
  modelId: string,
  year: number,
  band: number,
  yearSpread: number,
  kmSpread: number,
  powerHp?: number | null,
  genWindow?: GenWindow,
  excludeMids?: string[],
): Promise<{
  median: number;
  medianKm: number | null;
  n: number;
  distinctPrices: number;
  distinctSellers: number;
  min: number;
  max: number;
  p25: number;
  p75: number;
} | null> {
  // Interseção da janela year±yearSpread com a janela de geração (quando
  // presente): o guard NUNCA relaxa (só aperta) — mantém-se mesmo no fallback.
  // Interseção vazia (lo>hi) → o `between` não devolve nada.
  const yearLo = genWindow ? Math.max(year - yearSpread, genWindow.start) : year - yearSpread;
  const yearHi =
    genWindow?.end != null ? Math.min(year + yearSpread, genWindow.end) : year + yearSpread;
  // Matching ESTRITO por designação (regra do produto: um veículo só compara
  // com o mesmo modelo): a potência é a assinatura objetiva da designação
  // (840i 333cv ≠ M850i 530cv; xDrive40 326 ≠ xDrive45 408; Golf 1.5 150 ≠
  // GTI 245). Tolerância apertada ±10% OU ±15cv (facelifts/afinações da MESMA
  // designação) e observações SEM potência conhecida ficam FORA — sem dado
  // não há prova de que é o mesmo modelo (nunca adivinhar).
  const powerFilter =
    powerHp != null
      ? sql`and l.power_hp is not null and abs(l.power_hp - ${powerHp}) <= ${Math.max(Math.round(powerHp * 0.1), 15)}`
      : sql``;
  // Exclusão por derivado/corpo (auditoria): uma observação PT cujo carro está
  // PROVADO ser de OUTRO derivado (um Gran Coupé quando o estrangeiro é Gran
  // Tourer, mais caro → margem falsa) sai da amostra. O mid provado vem da versão
  // exata (uv.mid) ou dos factos de designação (designation_facts->>'mid');
  // observação SEM match (mid null) FICA — nunca adivinhar, só excluir o que está
  // provado diferente. Como a genWindow, NUNCA relaxa (só aperta).
  const midExclusion = excludeMids?.length
    ? sql`and (coalesce(uv.mid, l.designation_facts->>'mid') is null
              or not (coalesce(uv.mid, l.designation_facts->>'mid') = any(${`{${excludeMids.join(",")}}`}::text[])))`
    : sql``;
  // Dedupe por CARRO físico, não por anúncio (ver lib/engine/car-identity.ts):
  // grupos como Caetano/CarPlus listam o mesmo stock em vários sites — contar
  // 2× inflaciona a amostra. min/max saem para o teto de spread do fallback;
  // p25/p75 para o teto de dispersão robusta dos dois ramos (MAX_IQR_SPREAD); a
  // mediana de km (do `listings`, que é onde os km em bruto vivem — a observação
  // só guarda a banda) para o teto de excesso de km (MAX_KM_RATIO). Os km entram
  // no `distinct on` como o preço: por CARRO, não por anúncio.
  const rows = (await db.execute(sql`
    select percentile_cont(0.5) within group (order by price)::int as median,
           percentile_cont(0.25) within group (order by price)::int as p25,
           percentile_cont(0.75) within group (order by price)::int as p75,
           percentile_cont(0.5) within group (order by km)::int as median_km,
           count(*)::int as n,
           count(distinct price)::int as distinct_prices,
           count(distinct seller_key)::int as distinct_sellers,
           min(price)::int as min_price,
           max(price)::int as max_price
    from (
      select distinct on (identity) price, seller_key, km
      from (
        select ${carIdentitySql("l")} as identity,
               coalesce(l.seller_name, l.id::text) as seller_key,
               o.price, o.observed_at, l.km
        from pt_price_observations o
        join listings l on l.id = o.listing_id
        left join us_versions uv on uv.version_id = l.us_version_id
        where o.model_id = ${modelId}
          and o.year between ${yearLo} and ${yearHi}
          and o.km_band between ${band - kmSpread} and ${band + kmSpread}
          and o.observed_at > now() - make_interval(days => ${WINDOW_DAYS})
          ${powerFilter}
          ${midExclusion}
      ) obs
      order by identity, observed_at desc
    ) latest
  `)) as unknown as {
    median: number | null;
    p25: number;
    p75: number;
    median_km: number | null;
    n: number;
    distinct_prices: number;
    distinct_sellers: number;
    min_price: number;
    max_price: number;
  }[];
  const row = rows[0];
  return row?.median != null
    ? {
        median: row.median,
        medianKm: row.median_km,
        n: row.n,
        distinctPrices: row.distinct_prices,
        distinctSellers: row.distinct_sellers,
        min: row.min_price,
        max: row.max_price,
        p25: row.p25,
        p75: row.p75,
      }
    : null;
}

/**
 * Dispersão robusta da amostra: (p75−p25)/mediana. Mediana ≤ 0 não é um preço —
 * devolve +∞ para FALHAR a guarda (em vez de dividir por zero e passar com NaN).
 */
function iqrSpread(s: { median: number; p25: number; p75: number }): number {
  return s.median > 0 ? (s.p75 - s.p25) / s.median : Number.POSITIVE_INFINITY;
}

/**
 * Excesso de km do carro sobre a amostra (ver MAX_KM_RATIO). Amostra sem km
 * conhecidos devolve +∞ para FALHAR a guarda: sem o dado não há prova de
 * comparabilidade, e a regra é nunca adivinhar. (Na prática não acontece — o
 * scripts/pipeline/pt-market.ts só observa anúncios com km.)
 */
function kmExcess(km: number, medianKm: number | null): number {
  return medianKm != null
    ? (km + KM_RATIO_FLOOR) / (medianKm + KM_RATIO_FLOOR)
    : Number.POSITIVE_INFINITY;
}

export async function estimatePtPrice(
  db: typeof Db,
  modelId: string,
  year: number,
  km: number,
  powerHp?: number | null,
  genWindow?: GenWindow,
  excludeMids?: string[],
): Promise<PtEstimate | null> {
  // A banda sai daqui, não do chamador: a guarda de km precisa dos km EM BRUTO
  // (a banda de 25 000 km é grosseira demais para provar comparabilidade) e os
  // dois valores têm de sair do MESMO número — passar banda e km em separado era
  // deixar o chamador contradizer-se.
  const band = kmBand(km);
  const primary = await sample(db, modelId, year, band, 1, 1, powerHp, genWindow, excludeMids);
  if (
    primary &&
    primary.n >= MIN_SAMPLE_NORMAL &&
    primary.distinctPrices >= MIN_DISTINCT_PRICES &&
    primary.distinctSellers >= MIN_DISTINCT_SELLERS &&
    iqrSpread(primary) <= MAX_IQR_SPREAD &&
    kmExcess(km, primary.medianKm) <= MAX_KM_RATIO
  ) {
    return { estimatedPrice: primary.median, sampleSize: primary.n, confidence: "normal" };
  }
  // Fallback alargado: ano ±1 (como a primária), só a banda de km alarga para ±2.
  // As guardas de dispersão aplicam-se na mesma (incluindo a robusta e a de km,
  // ainda mais necessária aqui: a janela de km passa a 100 000), mais o
  // teto de spread absoluto — a alargada é a amostra mais fraca, leva-as todas.
  const wide = await sample(db, modelId, year, band, 1, 2, powerHp, genWindow, excludeMids);
  if (
    wide &&
    wide.n >= MIN_SAMPLE_WIDE &&
    wide.distinctPrices >= MIN_DISTINCT_PRICES &&
    wide.distinctSellers >= MIN_DISTINCT_SELLERS &&
    wide.median > 0 &&
    (wide.max - wide.min) / wide.median <= MAX_WIDE_SPREAD &&
    iqrSpread(wide) <= MAX_IQR_SPREAD &&
    kmExcess(km, wide.medianKm) <= MAX_KM_RATIO
  ) {
    return { estimatedPrice: wide.median, sampleSize: wide.n, confidence: "alargada" };
  }
  return null;
}

/** Histórico mensal (médias) para o gráfico PtMarket.history — últimos 6 meses. */
export async function ptPriceHistory(
  db: typeof Db,
  modelId: string,
): Promise<{ month: string; price: number }[]> {
  const rows = (await db.execute(sql`
    select to_char(date_trunc('month', observed_at), 'YYYY-MM') as month,
           round(avg(price))::int as price
    from pt_price_observations
    where model_id = ${modelId}
      and observed_at > now() - interval '6 months'
    group by 1
    order by 1
  `)) as unknown as { month: string; price: number }[];
  return rows;
}
