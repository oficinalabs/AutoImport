/**
 * Plausibilidade do preço de ORIGEM: mediana do preço do MESMO carro no MESMO
 * mercado estrangeiro (mesmo model_id, mesmo país, ano±1, km 0,6×–1,6×,
 * potência ±max(10%,15cv)), deduplicada por CARRO físico.
 *
 * Porquê existir. O motor tinha guardas SINTÁTICAS sobre o preço estrangeiro
 * (`price > 0`, `/leilao/`, `is_damaged`, `km > 6000`) e guardas de COERÊNCIA da
 * amostra PT (`lib/engine/pt-market.ts`) — e zero guardas sobre o preço
 * estrangeiro ser, ele próprio, um preço de mercado. Um anúncio a metade do que
 * o seu próprio mercado pede não é um negócio: é um erro de digitação, um sinal
 * de sinistro que o `is_damaged` não apanhou ("-Motorschaden-", "KEIN TÜV"), uma
 * venda só a profissionais ("nur an Händler/Export") ou um preço de entrada de
 * financiamento. Dois casos reais que estavam na montra:
 *   · VOLVO XC40 T5 Recharge 2022, 116 000 km, autocasion.com, 6 900 € →
 *     mediana de 25 comparáveis ES: 22 850 € (rácio 0,302) — "poupança" 71,6%.
 *   · PEUGEOT 3008 1.5 BlueHDi 2021, 44 000 km, autocasion.com, 5 900 € →
 *     mediana de 71 comparáveis ES: 18 790 € (rácio 0,314) — "poupança" 59,5%.
 * Não é viés de fonte: medida a mediana do autocasion face às outras fontes ES
 * nos MESMOS carros, dá 1,000 — a fonte não anuncia "outro preço", tem
 * outliers. Por isso a guarda é de amostra, não de fonte.
 *
 * Porquê MESMO país e não "todo o estrangeiro": os níveis de preço de DE e ES
 * não são o mesmo mercado; misturá-los faria a mediana mentir nos dois sentidos.
 *
 * O módulo só MEDE (mediana + n). Quem recusa é o
 * `scripts/pipeline/compute-costs.ts`, com o `MIN_ORIGIN_RATIO` abaixo — e é lá
 * que a ordem importa: a guarda corre DEPOIS do `estimatePtPrice`, porque dos
 * 325 005 anúncios elegíveis só ~79 000 chegam a ter amostra PT; adiá-la poupa
 * 3/4 das queries.
 */
import { sql } from "drizzle-orm";
import type { db as Db } from "../../db";
import { carIdentitySql } from "./car-identity";

export interface OriginEstimate {
  median: number;
  n: number;
}

// Mínimo de comparáveis para a mediana ser prova. Medido no armazém: 10 577 das
// 11 758 oportunidades ativas (90%) e 73 059 das 79 109 estimativas (92%) têm
// n≥5 no próprio mercado — a guarda cobre a esmagadora maioria sem inventar
// nada sobre o resto.
const MIN_SAMPLE = 5;

/**
 * Piso do rácio preço/mediana-do-próprio-mercado. Abaixo disto o anúncio não
 * recebe estimativa (ver compute-costs.ts).
 *
 * Uma oportunidade É, por definição, mais barata que o típico do seu mercado —
 * a distribuição prova-o: nas 11 758 oportunidades ativas o rácio tem mediana
 * 0,905 e p05 0,742. O corte não pode andar perto disso ou mata o produto. Massa
 * abaixo de cada limiar (oportunidades · estimativas): 0,5 → 35 · 50;
 * 0,6 → 98 · 137; 0,7 → 299 · 442.
 * Decisão do dono do produto: cortar em 0,50 — é onde estão os casos
 * indefensáveis (o XC40 a 0,302 e o 3008 a 0,314 acima; a lista dos 35 é
 * dominada por "Motorschaden", "KEIN TÜV" e "Verkauf nur an Gewerbe") e custa
 * 0,3% da montra. É um piso de INDEFENSABILIDADE, não uma medida de mercado
 * justo: acima dele o motor continua a não ter opinião sobre o preço de origem.
 */
export const MIN_ORIGIN_RATIO = 0.5;

/** Janela de ano da amostra (a mesma do pt-market: ±1 não atravessa gerações). */
const YEAR_SPREAD = 1;
// Janela de km, SIMÉTRICA em log — 1,6× é o mesmo teto de excesso do pt-market
// (MAX_KM_RATIO) e 0,6× ≈ 1/1,6 fecha o outro lado. A guarda de km do pt-market é
// unilateral de propósito (lá, menos km que a amostra subestima a poupança — o
// lado seguro do erro); aqui a mediana joga CONTRA o anúncio, portanto encher a
// amostra de carros pouco rodados inflaria-a e recusaria carros sãos. Sem
// leniência para nenhum lado: janela nos dois.
const KM_LO = 0.6;
const KM_HI = 1.6;

/**
 * Mediana do preço dos comparáveis do PRÓPRIO mercado do anúncio, ou null se não
 * houver amostra que a prove (n < MIN_SAMPLE). Null NÃO é suspeita: sem prova não
 * se recusa — é a mesma regra do resto do motor ("nunca adivinhar"), que corta
 * nos dois sentidos.
 *
 * `excludeListingId` é o próprio anúncio: sem ele o carro entrava na sua própria
 * amostra e puxava a mediana na direção que o inocenta.
 */
export async function estimateOriginPrice(
  db: typeof Db,
  modelId: string,
  country: string,
  year: number,
  km: number,
  powerHp: number,
  excludeListingId: string,
): Promise<OriginEstimate | null> {
  // Mesma tolerância de potência do pt-market: a potência é a assinatura objetiva
  // da designação (840i 333cv ≠ M850i 530cv) e `power_hp` desconhecido fica FORA —
  // sem o dado não há prova de que é o mesmo modelo.
  const powerTol = Math.max(Math.round(powerHp * 0.1), 15);
  // Dedupe por CARRO físico (ver lib/engine/car-identity.ts): o cross-listing não
  // é só português — na fase 1 encontrámos o mesmo Porsche publicado por
  // autoboerse.de e meinauto.de. Contar 2× o mesmo carro reforça artificialmente
  // a amostra que vai recusar o anúncio.
  // Desempate do grupo: o preço MAIS BAIXO do clone (o `order by identity, price`).
  // Os clones diferem no preço (montra financiada vs. contado, arredondamentos) e
  // uma mediana mais baixa recusa MENOS — uma guarda que recusa nunca deve
  // escolher o valor que a faz recusar mais.
  // O `distinct on (identity)` exige que o ORDER BY comece pela MESMA expressão
  // ("DISTINCT ON expressions must match initial ORDER BY expressions"), daí a
  // identidade sair no select do sub-select e não ser recalculada em cima.
  const rows = (await db.execute(sql`
    select percentile_cont(0.5) within group (order by price)::int as median,
           count(*)::int as n
    from (
      select distinct on (identity) identity, price
      from (
        select ${carIdentitySql("l")} as identity, l.price
        from listings l
        where l.model_id = ${modelId}
          and l.country = ${country}
          and l.id <> ${excludeListingId}
          and l.deleted_at is null
          and l.price > 0
          and l.year between ${year - YEAR_SPREAD} and ${year + YEAR_SPREAD}
          and l.km between ${Math.round(km * KM_LO)} and ${Math.round(km * KM_HI)}
          and l.power_hp is not null
          and abs(l.power_hp - ${powerHp}) <= ${powerTol}
      ) c
      order by identity, price
    ) d
  `)) as unknown as { median: number | null; n: number }[];
  const row = rows[0];
  return row?.median != null && row.n >= MIN_SAMPLE ? { median: row.median, n: row.n } : null;
}
