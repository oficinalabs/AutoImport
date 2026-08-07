/**
 * Anúncios estrangeiros cujo PREÇO NÃO É UM PREÇO DE RETALHO — declarado pelo
 * próprio vendedor, no texto do anúncio.
 *
 * Porquê existir. O `lib/engine/origin-market.ts` já recusa preços implausíveis
 * face ao próprio mercado estrangeiro, e o seu docstring nomeia estes casos
 * ("-Motorschaden-", "KEIN TÜV", "Verkauf nur an Gewerbe") como o alvo. Só que
 * lá o sinal é ESTATÍSTICO: exige `n≥5` comparáveis no mesmo país e, sem
 * amostra, PASSA (sem prova não se recusa). Medido no topo da montra — 200
 * oportunidades por `savings_pct` desc, que é a ordenação por omissão do
 * `/pesquisar` e portanto o que o cliente vê primeiro — a guarda corta 27 e
 * deixa passar 43 por falta de amostra. E os que passam são precisamente os
 * piores: carros velhos ou muito rodados, cujo mercado tem poucos comparáveis
 * *por serem eles próprios anómalos*.
 *
 * Aqui o sinal é DIRETO — o vendedor escreve o que se passa — e por isso não
 * depende de amostra nenhuma. Casos reais que estavam na montra:
 *   · BMW 116 i "Motorstörung läuft auf 3 Zylinder" (motor a 3 cilindros),
 *     3 650 €, "poupança" 45,1 %;
 *   · Opel Astra K "/Motorschaden", 4 400 €, 44,6 %;
 *   · VW up! "+nur an Händler/Export+", 1 950 €, 43,9 %;
 *   · Fiat Tipo Cross "**Verkauf nur an Gewerbe!**", 6 787 €, 43,0 %.
 * Os dois primeiros não são carros que se importam; os dois últimos não têm um
 * preço que um particular possa pagar (venda só a profissionais / a exportação,
 * tipicamente sem IVA — e o motor soma preço+transporte+ISV+IUC+legalização,
 * sem IVA, exatamente como no caso RITI do `compute-costs.ts`).
 *
 * O `listings.is_damaged` não substitui isto: é o campo ESTRUTURADO
 * (`isCurrentlyDamaged`) e só o AutoScout24 o traz — medido, é `null` em TODO o
 * topo da montra.
 *
 * Medido no armazém (664 264 anúncios): 336 anúncios estrangeiros ativos batem,
 * 14 deles são oportunidades ativas — 8 com poupança ≥30 %, 4 com ≥40 %. Custo
 * da montra: 14 em 8 320 (0,17 %).
 *
 * Só o `listings.variant` é lido: medido, o `raw->>'title'` não acrescenta
 * NENHUM caso (0 de 336) e poupa-se a extração de jsonb num predicado que
 * percorre o corpus.
 *
 * Lacunas conhecidas, deixadas de fora de propósito (não são esquecimento):
 *   · Preço líquido de IVA ("netto", "zzgl. MwSt"): 43 anúncios no corpus, ZERO
 *     na montra, e o padrão apanha prestações de leasing — "433€ netto/mtl.",
 *     "568.- netto Leasingübern" — que são anúncios normais com preço normal.
 *     Padrão ruidoso e sem rendimento medido: fica de fora até haver um sinal
 *     que separe o preço do anúncio da mensalidade.
 *   · Equivalentes ES/FR ("siniestro", "despiece", "accidenté"): 1 anúncio no
 *     corpus inteiro. Estas fontes não põem o sinal no `variant`.
 */

/**
 * Padrões, agrupados pelo que provam. Todos em minúsculas e casados de forma
 * insensível a maiúsculas (`~*` no SQL, `i` no TS).
 *
 * As vogais com trema vêm como `(ä|ae)`, não `(ä|a)`: medido no corpus, os
 * coletores PRESERVAM o trema (2 213 "tüv", 128 "händler", 8 "beschädigt") e a
 * forma de vogal nua nunca aparece — zero "tuv", zero "handler", zero
 * "beschadigt". A única variação real é o dígrafo alemão ("haendler", 2 casos).
 *
 * ⚠️ `unfall(?!frei)` — o lookahead negativo é o ponto todo do padrão, não um
 * detalhe: "unfallfrei" quer dizer SEM acidentes e aparece em 235 anúncios
 * (incluindo bons, "Urus - Grigio Lynx - B&O - 1.Hand - Unfallfrei"). Sem ele a
 * guarda excluiria exatamente os anúncios que declaram estar sãos. Verificado
 * nos 235: zero apanhados. Pelo mesmo motivo `(?<!un)besch(ä|a)digt` —
 * "unbeschädigt" = não danificado.
 *
 * O PostgreSQL suporta lookahead e lookbehind nas suas regex (ARE) desde a 9.5,
 * portanto o mesmo texto serve o SQL e o TS. É o `tests/pipeline/integration`
 * que o prova ponta-a-ponta — um teste de unidade em JS não provaria o SQL.
 */
export const NOT_RETAIL_PATTERNS = [
  // Avaria mecânica declarada.
  "motorschaden",
  "getriebeschaden",
  "motorst(ö|oe)rung",
  // Para peças / não circula.
  "bastler",
  "teiletr(ä|ae)ger",
  "schlachtfest",
  "ausschlachten",
  "nicht fahrbereit",
  "springt nicht an",
  // Sinistro.
  "unfall(?!frei)",
  "(?<!un)besch(ä|ae)digt",
  // Sem inspeção (não pode circular sem passar por ela primeiro).
  "kein t(ü|ue)v",
  "ohne t(ü|ue)v",
  // Venda só a profissionais / a exportação: o preço não é o que um particular
  // paga (tipicamente sem IVA).
  "nur an h(ä|ae)ndler",
  "nur an gewerbe",
  "h(ä|ae)ndler ?/ ?export",
  "gewerbe ?/ ?export",
  "nur export",
  "export only",
] as const;

/** Alternância única, para reutilizar no SQL do pipeline sem duplicar a lista. */
export const NOT_RETAIL_REGEX_SOURCE = `(${NOT_RETAIL_PATTERNS.join("|")})`;

const NOT_RETAIL_RE = new RegExp(NOT_RETAIL_REGEX_SOURCE, "i");

/**
 * O anúncio declara que o preço não é de retalho (ou que o carro não circula)?
 *
 * Fecha ABERTO: sem `variant` → `false` (incluído). É a mesma escolha do
 * `isExcludedTerritory` e da guarda do preço de origem — não excluir por
 * ausência de dados. O que se exclui aqui é só o que está ESCRITO.
 */
export function isNotRetailListing(variant: string | null | undefined): boolean {
  return NOT_RETAIL_RE.test(variant ?? "");
}
