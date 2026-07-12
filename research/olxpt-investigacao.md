# olx.pt — investigação técnica (spec do coletor)

> Como recolher anúncios de **carros usados** do **OLX Portugal** (olx.pt — grupo OLX/Adevinta),
> secção `/carros-motos-e-barcos/carros/`. Mistura **stands (profissionais)** e **particulares**.
> Data: 2026-07-12. Método: reconhecimento estático (`curl` + análise do `window.__PRERENDERED_STATE__`
> e probes reais à listagem SSR, paginação e facetas).

## TL;DR — como recolhemos

- **HTTP puro (sem browser, sem proxies/stealth).** `curl`/`fetch` com UA de browser + `Accept-Language:
  pt-PT` → **200** em todas as probes. Anti-bot **PASSIVO** (as ocorrências de "captcha"/"challenge" no
  HTML são apenas strings do bundle JS, não um desafio ativo). Rate-limit + backoff do `lib/` chegam.
- **Fonte = SSR `window.__PRERENDERED_STATE__`** (NÃO a API). A página de listagem é uma React SPA, mas o
  servidor **embute o estado completo** num literal de string JS `window.__PRERENDERED_STATE__ = "…"`
  (JSON escapado). Depois de o desescapar: `state.listing.listing.ads[]` traz **52 anúncios/página**,
  com `totalElements`, `totalPages` e — o essencial — o array **`params[]`** (atributos do carro
  chave→valor) + `createdTime` (recência REAL), `price`, `location`, `user`, `isBusiness`, `url`, `photos`.
- **⚠️ A API JSON é robots-PROIBIDA — NÃO a usamos.** O `robots.txt` de `www.olx.pt` tem `Disallow: /api/`
  (e `/api/open/oauth/token/`). Os `links.next` do estado apontam para `https://www.olx.pt/api/v1/offers?…`
  (a tal API pública paginável por `offset`/`limit`), mas esse path **cai no disallow** → recorremos ao
  **SSR HTML** da página humana, que **é permitido** (`Allow: /`, e o path `/carros-motos-e-barcos/carros/`
  não cai em nenhum disallow). Contraste com o autohero (onde a API estava no mesmo host e era permitida):
  aqui é o OPOSTO, por isso ficamos no SSR — que felizmente traz os mesmos dados.
- **Paginação por `?page=N`** (1..**100**, teto duro do OLX). Cada faceta satura em ~100 páginas × 52 ≈
  **5 200** anúncios → para cobrir os ~50,8 mil, o `--full` **fateia por MARCA** (path SEO
  `/carros-motos-e-barcos/carros/{marca}/`, ex. `/carros/bmw/`), tal como o autoboerse fateia por marca.
- **✅ Recência REAL:** o parâmetro de ordenação **`?search[order]=created_at:desc`** É honrado pelo SSR
  (probe: 200 com estado, topo por data) e cada anúncio traz `createdTime`. O `watch` usa esse sort → os
  anúncios novos aparecem no topo; sinal de deriva = `max(createdTime)` por ciclo. (Alguns anúncios
  promovidos são injetados no topo independentemente do sort — o estado id→linha do watch dedupe-os.)
- **Volume:** **~50 832** carros em PT (campo `totalElements` na raiz da secção). Facetas medidas: `porto`
  11 366, `lisboa` 15 100; marcas: `bmw` 5 653, `mercedes-benz` 5 552, `peugeot` 4 810, `renault` 3 908,
  `volkswagen-vw` 3 261, … (ver seed em `schema.mjs`).

## Acesso

- **Host canónico:** `https://www.olx.pt`. Secção de carros: `/carros-motos-e-barcos/carros/`
  (`category_id` 378). **Sem autenticação, sem cookies obrigatórios.**
- **Anti-bot:** passivo — 200 com UA de browser em todas as probes (listagem, paginação, facetas de
  marca e distrito, sort). Cookies guardados pelo `lib/http`. Rate-limit (1500ms + jitter) + backoff.
- **robots.txt** (`www.olx.pt/robots.txt`) — `Allow: /` com disallows específicos. Os relevantes:
  `Disallow: /api/`, `/api/open/oauth/token/`, `/adminpanel/`, `/adprint/`, `/anuncio/leaflet/`,
  `/anuncio/contact/`, `/payment/`, `/searchform/`, `/anunciar/confirm(page)/`, `/i2/anuncio/…`,
  `/m/anuncio/abuse/`, e wildcards `*/ajax/`, `*/account/`, `*/myaccount/`, `*/facebook/`, `*/rss/`,
  `*/i2/*`. **Sem `Crawl-delay`** → mantemos o default educado do lib.
- **⚠️ A verificação-chave:** o path da **API** (`/api/v1/offers…`) **cai em `Disallow: /api/` → PROIBIDO**.
  Por isso **não lhe tocamos**; incluímos `/api/` (e os restantes) nos `ROBOTS_DISALLOW` do `http.mjs`, de
  forma que o guard `assertAllowed` **rejeita** qualquer URL de API por engano. A listagem SSR humana
  (`/carros-motos-e-barcos/carros/…`) **é permitida** — verificado com `assertAllowed`.

## Fonte — anúncio SSR (`state.listing.listing.ads[]`)

Cada anúncio tem `params[]` (array `{key,name,type,value,normalizedValue}`) com os atributos do carro.
Chaves observadas: `body_type` (Segmento/carroçaria), `year` (Ano), `modelo` (Modelo), `combustivel`,
`gearbox`, `engine_capacity` (cilindrada), `engine_power` (potência, cv), `quilometros`, `portas`
(bucket "4-5"/"1-3"), `nr_seats`, `first_registration_month`, `condicao`, `origin`
(nacional/importado), `matricula`, `vin`, `co2_emissions` (string de gama). **Não há `marca` nem `cor`**
nos params.

Mapa (→ `tools/collector/olxpt/schema.mjs`):

| Fonte | → schema | Notas |
|---|---|---|
| `title` (deteção por dicionário) / faceta `--full` | make | Não há param de marca; deteta-se pelo título (dicionário canónico) e, no `--full`, carimba-se a marca da faceta |
| `params.modelo.value` | model | ex. "Bayon" |
| `title` menos make+model | variant | melhor-esforço (ex. "1.2 Select") |
| `params.year` | year | |
| `params.quilometros.normalizedValue` | km | "75.000 km"→75000 |
| `params.combustivel.value` | fuel | Gasolina/Diesel/… |
| `params.gearbox.value` | gearbox | Manual/Automática |
| `params.engine_capacity.normalizedValue` | engine | cilindrada cm³ (1197) |
| — | color | **null** (OLX não expõe cor na listagem) |
| `params.portas.value` | doors | bucket "4-5" → base fica **null**; extra `doors_bucket` guarda o bucket |
| `params.body_type.value` | category | carroçaria (SUV/TT, Citadino, …) |
| `price.regularPrice.value` | price | null quando "a combinar"/sem preço (~2%) |
| `price.regularPrice.currencyCode` | currency | EUR |
| — | country | **PORTUGAL** |
| `location.regionName` | region | distrito (Porto, Lisboa, …) |
| — | postalCode | **null** (OLX dá cidade, não CP; cidade em extra `city`) |
| `isBusiness ? user.name : 'OLX (particular)'` | source | stand concreto p/ profissionais; rótulo genérico p/ particulares |
| `url` | detail_url | absoluto (`/d/anuncio/…-ID….html`) |
| `photos[0]` | image | URL do CDN apollo (já com `;s=1920x1081`) |

- **Extras:** `source_site`='olx.pt', `id` (numérico, chave natural), `seller_type` (**business/private**
  ← `isBusiness`), `user_name`, `user_id`, `city`, `power_hp` (`engine_power`), `body_type`, `seats`
  (`nr_seats`), `origin` (nacional/importado), `condition`, `first_registration` ("YYYY-MM"), `matricula`,
  `vin`, `co2` (string), `doors_bucket`, `is_promoted`, `is_highlighted`, `partner_code` (ex. cross-post
  do `standvirtual`), `external_url`, `created_time` (**recência REAL**), `last_refresh_time`,
  `valid_to_time`, `title`, `photos` (contagem).
- **`isBusiness`** distingue **stand (business)** de **particular (private)** — o pedido explícito.

## Cobertura (batch) e watch

- **Batch (`crawl.mjs`)** — pagina por `?page=N` (52/pág, teto 100):
  - **default:** uma query (toda a secção, ou `--make`/`--region`), até `--max-pages`.
  - **`--full`:** uma query **por marca** (seed de ~40 marcas validadas em `schema.mjs`, ordenadas por
    densidade), `/carros/{marca}/`. Dedupe global por `id`, checkpoint/resume (por marca+página), NDJSON,
    stats. **Limitação conhecida** (como o autoboerse): as marcas densas (BMW 5 653, Mercedes 5 552) passam
    ligeiramente o teto de 100 páginas × 52 ≈ 5 200 → truncam nesse teto; o corte fino seguinte seria
    marca×distrito ou marca×ano (não implementado). O `--region` permite refazer a recolha por distrito.
- **Watch (`watch.mjs`)** — poll das primeiras páginas com `?search[order]=created_at:desc`; novos/
  price_change por `id`; sinal de recência = `max(createdTime)` por ciclo.

## Verificação (dados reais, 2026-07-12)

- `run --max-pages 3` → **149 anúncios** (catálogo 50 830), 6s. Split **business 96 / private 53**.
  Cobertura: price/currency/region/detail_url/image/**created_time (recência)**/seller_type **100%**,
  model 98%, year 98%, fuel 98%, variant 95%, km 95%, gearbox 95%, make **93%** (≈7% título sem marca
  reconhecida), category 89%, power_hp 86%, engine 78%; color/doors/postalCode **0%** (por design).
- `--resume --max-pages 5` → 149→**248**, dedupe perfeito (248 linhas = 248 ids).
- Fatia do `--full`: `--make bmw --max-pages 2` → **100 anúncios, 100% BMW** (marca carimbada pela
  faceta), catálogo BMW 5 647.
- `watch --interval 12 --cycles 2 --pages 2` → ciclo 1: **76 novos**; ciclo 2: **0** (estado estável),
  `maisRecente` = createdTime de hoje (recência confirmada). Eventos escritos em `olxpt-events.ndjson`.
- `assertAllowed`: `/carros-motos-e-barcos/carros/…` e `/carros/bmw/` **PERMITIDOS**; `/api/v1/offers`,
  `/api/open/oauth/token/`, `/payment/` **BLOQUEADOS**. Confirma que a API robots-proibida é inalcançável.

## Ficheiros

`tools/collector/olxpt/{http,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-olxpt.mjs` + `tools/collector/watch-olxpt.mjs`. Reutiliza `lib/` sem alterar.
</invoke>
