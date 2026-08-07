/**
 * As nove chaves de `/pesquisar` no URL — a fronteira entre o que qualquer
 * pessoa pode escrever na barra de endereço e o `SearchFilters` que vai para a
 * query. Função pura, sem Next e sem base de dados: dá para testar a sério e
 * barato, ao contrário do resto da página.
 *
 * O que aqui se prova: (1) lixo no URL é ignorado em vez de virar filtro ou 500;
 * (2) as duas pontas concordam — quem escreve o URL é o cliente
 * (components/search-view.tsx via `searchFiltersToQuery`) e quem o lê é o
 * servidor, e um desalinhamento entre eles seria um filtro que se perde ao
 * recarregar a página.
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import {
  parseSearchFilters,
  searchFiltersToQuery,
} from "../../app/(app)/(gated)/pesquisar/filters";
import type { SearchFilters } from "../../lib/data";

/** "?a=1&b=2" como o Next o entrega ao `page.tsx`. */
const params = (qs: string) => Object.fromEntries(new URLSearchParams(qs));

test("URL vazio não filtra nada", () => {
  assert.deepEqual(parseSearchFilters({}), {
    query: undefined,
    countries: undefined,
    onlyOpportunities: false,
    page: undefined,
    minYear: undefined,
    maxKm: undefined,
    maxPrice: undefined,
    fuel: undefined,
    gearbox: undefined,
    sort: undefined,
  });
});

test("os nove filtros vêm do URL", () => {
  const f = parseSearchFilters(
    params(
      "texto=golf+gti&pais=DE,FR&oportunidades=1&ano=2021&km=100000" +
        "&preco=30000&combustivel=diesel&caixa=manual&ordenar=savingsPct",
    ),
  );
  assert.deepEqual(f, {
    query: "golf gti",
    countries: ["DE", "FR"],
    onlyOpportunities: true,
    page: undefined,
    minYear: 2021,
    maxKm: 100_000,
    maxPrice: 30_000,
    fuel: "diesel",
    gearbox: "manual",
    sort: "savingsPct",
  });
});

test("valores inválidos são ignorados, não rebentam nem filtram", () => {
  // Tudo o que aqui está é escrito à mão por alguém a brincar com o URL.
  const f = parseSearchFilters(
    params(
      "texto=+++&pais=ZZ,XX&oportunidades=talvez&ano=abc&km=-1" +
        "&preco=0&combustivel=nuclear&caixa=cvt&ordenar=drop+table",
    ),
  );
  assert.deepEqual(f, {
    query: undefined,
    countries: undefined,
    onlyOpportunities: false,
    page: undefined,
    minYear: undefined,
    maxKm: undefined,
    maxPrice: undefined,
    fuel: undefined,
    gearbox: undefined,
    sort: undefined,
  });
});

test("países: só os válidos sobrevivem à lista", () => {
  assert.deepEqual(parseSearchFilters(params("pais=DE,ZZ,ES")).countries, ["DE", "ES"]);
  assert.equal(parseSearchFilters(params("pais=DE")).countries?.length, 1);
});

test("números: decimais e enormes ficam de fora", () => {
  assert.equal(parseSearchFilters(params("ano=2021.5")).minYear, undefined);
  assert.equal(parseSearchFilters(params("km=1e30")).maxKm, undefined);
  assert.equal(parseSearchFilters(params("preco=30000")).maxPrice, 30_000);
});

test("chave repetida (?pais=DE&pais=FR) fica pela primeira, sem rebentar", () => {
  assert.deepEqual(parseSearchFilters({ pais: ["DE", "FR"] }).countries, ["DE"]);
  assert.equal(parseSearchFilters({ ordenar: ["recent", "price"] }).sort, "recent");
});

test("os links do painel continuam a dizer o que diziam", () => {
  const opps = parseSearchFilters(params("oportunidades=1"));
  assert.equal(opps.onlyOpportunities, true);
  assert.equal(opps.sort, undefined, "sem ordenar no link, a ordenação é a de omissão");

  assert.equal(parseSearchFilters(params("oportunidades=1&ordenar=recent")).sort, "recent");
  assert.equal(parseSearchFilters(params("oportunidades=1&ordenar=savings")).sort, "savings");
});

test("ida e volta: o que o cliente escreve no URL é o que o servidor lê", () => {
  const casos: SearchFilters[] = [
    {},
    { query: "golf gti", onlyOpportunities: true },
    { countries: ["DE", "NL"], sort: "recent" },
    { minYear: 2022, maxKm: 60_000, maxPrice: 40_000 },
    { fuel: "elétrico", gearbox: "automática" },
    { fuel: "híbrido", sort: "price", countries: ["ES"] },
  ];
  for (const original of casos) {
    const lido = parseSearchFilters(params(searchFiltersToQuery(original)));
    for (const [chave, valor] of Object.entries(original)) {
      assert.deepEqual(
        lido[chave as keyof SearchFilters],
        valor,
        `${chave} não sobreviveu a ${searchFiltersToQuery(original) || "(vazio)"}`,
      );
    }
  }
});

test("o valor de omissão não vai para o URL — links curtos", () => {
  // O default passou a ser `savingsPct`: ordenar por poupança ABSOLUTA punha
  // supercarros no topo (preço médio dos 60 primeiros: 147 169 €) quando 87%
  // das oportunidades estão abaixo dos 40 000 €. `savings` continua a existir —
  // é para lá que apontam os KPIs do painel, que são em euros.
  assert.equal(searchFiltersToQuery({ sort: "savingsPct" }), "");
  assert.equal(searchFiltersToQuery({ onlyOpportunities: false }), "");
  assert.equal(searchFiltersToQuery({ sort: "recent" }), "ordenar=recent");
  assert.equal(searchFiltersToQuery({ sort: "savings" }), "ordenar=savings");
  // A página 1 também não suja o URL.
  assert.equal(searchFiltersToQuery({ page: 1 }), "");
  assert.equal(searchFiltersToQuery({ page: 3 }), "pagina=3");
});
