# autohero.com — investigação técnica (spec do coletor)

> Como recolher dados do autohero.com (retalhista de usados de **stock próprio** do grupo AUTO1,
> multi-país; recolhemos o mercado **Alemanha /de/**).
> Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do `window.__APOLLO_STATE__`,
> do bundle JS da app e de probes reais à API GraphQL).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser → 200. Servidor **CloudFront**
  (SSR: header `x-ssr-timestamp`); anti-bot **PASSIVO** — sem challenge (Cloudflare/DataDome) em
  nenhuma probe.
- **Fonte = API GraphQL JSON interna, NO MESMO HOST.** A página `/de/search/` é uma SPA Apollo: o
  SSR embute o estado em `window.__APOLLO_STATE__` (string JSON escapada), mas **só traz os primeiros
  ~24-30 resultados** e ignora `?page=N` (a paginação real é por XHR/scroll infinito). A app aponta
  (`window.__config.API_URL`) para o **próprio host** `www.autohero.com`, e o endpoint de pesquisa é:

  ```
  POST https://www.autohero.com/v1/retail-customer-gateway/graphql
  Content-Type: application/json
  { "operationName":"searchAdV9AdsV2",
    "query":"query searchAdV9AdsV2($search: EsSearchRequestProjectionInput!, $tradeInId: UUID) { searchAdV9AdsV2(search: $search, tradeInId: $tradeInId) }",
    "variables":{ "search":{ "filter":{"field":"countryCode","op":"eq","value":"DE"},
                              "sort":"newest_eligible", "limit":100, "offset":0,
                              "properties":{"includeProspective":true} } } }
  ```

  **Sem autenticação.** O resolver devolve um **ESCALAR JSON** `{ total, data[] }` (sem sub-seleção de
  campos → vem tudo). Query e endpoint extraídos do bundle `main-*.js` da app.
- **Paginação por `limit`/`offset`** (probes: `limit` **≤ 100**; `offset` chega à cauda). Cobertura
  completa do catálogo DE (~7.442) em **~75 pedidos**, sem facetas nem lacunas.
- **Sort:** a API só aceita alguns valores (probes). **`newest_eligible`** (recência, por data de
  publicação/elegibilidade — **determinístico**) é o default: dá paginação por offset estável E serve
  de sinal de recência ao watch. `most_popular` também é estável (mas embaralhado por popularidade).
  Os rótulos de UI (`newest`, `price_asc`, …) **não** são valores válidos da API (dão erro).
- **~7.442 anúncios DE** (campo `total`). Multi-país (o robots lista sitemaps de de/fr/it/es/at/pl/
  se/nl/be) — trocar de mercado = mudar `MARKET` em `http.mjs`.
- **✅ Recência REAL:** cada anúncio traz `firstPublishedAt` e `publishedAt` (vantagem sobre
  aramisauto/autotrader, que não têm data). O watch pede o topo por `newest_eligible`.

## Acesso

- **Host canónico:** `https://www.autohero.com`. **API no mesmo host** (`/v1/retail-customer-gateway/graphql`).
- **Anti-bot:** CloudFront passivo — 200 com UA de browser, sem challenge. Cookies guardados pelo
  `lib/http`. Rate-limit + backoff (do lib) mitigam risco sob volume.
- **robots.txt** (`www.autohero.com/robots.txt`) — **permissivo**. Disallow **só** de:
  `/*/myhero/*`, `/*/inspection/`, `/*/checkout/*`, `/*/identify`, `/*/center`, `/*/unsubscribe/*`
  (o `/*/` é por-locale). **Sem `Crawl-delay`** → mantemos o default educado do lib (1500ms + jitter).
- **⚠️ robots do host da API (a verificação-chave):** ao contrário do Flexicar (onde a API estava
  noutro host com `Disallow: /`), aqui **a API está no MESMO host** e o path
  `/v1/retail-customer-gateway/graphql` **NÃO cai em nenhum disallow → é PERMITIDO**. A listagem
  humana `/de/search/` também. Ambos verificados com o guard `assertAllowed`. Instanciámos os
  disallow para o locale `/de/` em `autohero/http.mjs`.

## Fonte — anúncio da API (`searchAdV9AdsV2.data[]`)

Mapa (→ schema em `tools/collector/autohero/schema.mjs`):

| Campo API | → schema | Exemplo |
|---|---|---|
| `manufacturer` | make | Volvo |
| `model` | model | XC40 |
| `subType` + `subTypeExtra` | variant | 1.5 T5 Plug-in Hybrid R-Design 2WD |
| `firstRegistrationYear` | year | 2021 |
| `mileage.distance` | km | 87289 |
| `fuelType` (código) | fuel | 1039→Benzin, 1040→Diesel, 1044→Elektro, 1046→Hybrid… |
| `gearType` (código) | gearbox | 1138→Manuell, 1139→Automatik, 1140→Halbauto, 1141→Doppelkupplung |
| `ccm` | engine (cilindrada cm³) | 1477 |
| `offerPrice.amountMinorUnits`/100 | price | 25500 |
| `id` (UUID) | **id** (dedupe/chave natural) | 038d7f35-… |
| `carUrlTitle` + `id` (reconstruído) | detail_url | /de/volvo-xc-40/id/038d7f35-…/ |
| `mainImageUrl` (sem `{size}`) | image | https://img-eu-c1.autohero.com/img/… |
| `firstPublishedAt` | listing_first_published_at (recência) | 20260507T101006.000Z |

- **`country`='GERMANY'**, **`currency`='EUR'**, **`source`='Autohero'** (stock próprio — não é
  agregador de stands nem portal de particulares). **`region`/`postalCode` = null** (retalhista
  nacional; a sucursal de recolha fica em extras `branch_city`/`branch_zip`/`branch_name`).
- **`color`/`doors`/`category` = null** — não vêm nesta projeção da listagem.
- **Códigos** `fuelType`/`gearType` mapeados a partir do bundle da app (ver `FUEL_MAP`/`GEAR_MAP`).
- **Extras ricos:** `power_kw`/`power_ps`, `drive_train`, `co2`, `fuel_consumption_combined`,
  `built_year`, `first_registration`, `preowner_count`, `accidents`, `damages`, `has_service_book`,
  `emission_sticker`, `monthly_payment`, **`price_previous`/`price_first`** (histórico de preço —
  presente em ~13% dos carros, os com desconto), `is_coming_soon`, `retail_ad_state`.

## Cobertura (batch) e watch

- **Batch (`crawl.mjs`)** — pagina por `offset` (limit 100) com sort determinístico:
  - **default:** até `--max-pages` páginas (amostra).
  - **`--full`:** até esgotar o `total` (~75 páginas no DE). Dedupe global por `id`, checkpoint/resume
    (offset), NDJSON, stats. **Não há facetas** — a API já é paginável (mais simples que o Flexicar).
- **Watch (`watch.mjs`)** — poll das primeiras páginas por `newest_eligible`; novos/price_change por
  `id`; sinal de recência = `max(firstPublishedAt)` por ciclo.

## Verificação (dados reais, 2026-07-11)

- `run --max-pages 3` → **300 anúncios** (catálogo 7.442), 5s. Cobertura: make/model/variant/year/km/
  fuel/gearbox/price/detail_url/image/**recência 100%**, engine 98%; color/doors/category/region/
  postalCode 0% (por design).
- `--resume --max-pages 5` → 300→**500**, dedupe perfeito (500 linhas = 500 ids).
- `--full` (completo) → **7.442/7.442** em 75 páginas, ~20s (com resume a meio), 0 duplicados;
  `price_previous` presente em **944** carros (confirma o mapa condicional).
- `watch --interval 12 --cycles 2` → ciclo 1: 100 novos; ciclo 2: 0 (estado estável), recência logada.
- `assertAllowed`: API e `/de/search/` **PERMITIDOS**; `/de/checkout|myhero|unsubscribe` **BLOQUEADOS**.
- `detail_url` e `image` resolvem (200).

## Ficheiros

`tools/collector/autohero/{http,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-autohero.mjs` + `tools/collector/watch-autohero.mjs`. Reutiliza `lib/` sem alterar.
