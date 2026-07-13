# standvirtual.com — investigação técnica (spec do coletor)

> Como recolher dados do **StandVirtual** — o maior marketplace de usados de **Portugal**
> (grupo OLX/Adevinta; irmão do OTOMOTO polaco). Mistura **stands e particulares**.
> Data: 2026-07-12. Método: reconhecimento estático (`curl` + análise do `__NEXT_DATA__`/
> urqlState e probes reais de paginação/sort).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser + `Accept-Language: pt-PT` → **200**
  em todas as probes (`/carros`, `/carros/{marca}`, `?page=N`, `?search[order]=…`). Servidor
  **CloudFront** (AWS). As strings `datadome`/`captcha` aparecem no HTML (config do widget), mas
  **NÃO há challenge ativo**: a página vem completa (~1.3 MB) com o estado GraphQL preenchido.
  **Veredito anti-bot: PASSIVO — passou com HTTP puro.** (Sem proxies, sem stealth.)
- **Fonte = SSR `__NEXT_DATA__` → urqlState.** É uma app Next.js + GraphQL (urql). O SSR embute o
  resultado da query de pesquisa em `props.pageProps.urqlState[<hash>].data` (STRING JSON
  escapada). A entrada útil é a que contém **`advertSearch`**:
  - `advertSearch.totalCount` → total de resultados
  - `advertSearch.pageInfo` → `{ pageSize: 32, currentOffset }`
  - `advertSearch.edges[].node` → o anúncio (Advert) completo
- **⚠️ NÃO usamos a API GraphQL.** O robots.txt proíbe **`Disallow: /api/`** e **`Disallow: /ajax/`**
  — e é sob `/api/` que corre o endpoint GraphQL do OLX. Como o **SSR da listagem já traz os
  anúncios** (e a listagem está no ramo `Allow: /`), recolhemos **apenas o HTML de `/carros`**.
  (Contraste com o autohero, onde a API estava no mesmo host e era permitida; aqui é proibida.)
- **Paginação por `?page=N`** (32/página). **NÃO há cap de ~500 páginas** (ao contrário do que a
  investigação previa): a paginação chega ao **FIM** do catálogo — probe página **1324** =
  offset 42336 devolve o **último** anúncio de 42.337; página ≥1400 vem **vazia**. Logo `--full`
  **pagina direto** `/carros` até esgotar (~1324 páginas), com cobertura completa **sem fatiar
  por marca**. O fatiamento por marca continua disponível (`--brand {slug}`) para corridas
  dirigidas.
- **Sort:** forçamos **`search[order]=created_at_first:desc`** ("Mais Recentes") em toda a
  paginação — determinístico (o default `relevance_web` é embaralhado → abriria lacunas). Serve
  também de **sinal de recência** ao watch.
- **~42.337 anúncios** (`totalCount`; ~41.785 usados + ~556 novos). **✅ Recência REAL:** cada
  node traz `createdAt` (ISO-8601).
- **Stand vs particular:** `node.seller.__typename` = `ProfessionalSeller` (stand) /
  `PrivateSeller` (particular); o nome do stand vem em `node.sellerLink.name`.

## Acesso

- **Host canónico:** `https://www.standvirtual.com`.
- **Anti-bot:** DataDome **passivo** — 200 com UA de browser, sem challenge/captcha nas probes.
  Cookies (`lqonap`, `laquesis`, `next-auth.csrf`) guardados pelo `lib/http`. Usamos um
  **minDelay conservador de 2500ms** (+ jitter/backoff do lib) por o site ter reputação anti-bot.
- **robots.txt** (`www.standvirtual.com/robots.txt`) — ramo `User-agent: *`: `Allow: /` no fim,
  mas proíbe (entre outros) **`/api/`**, **`/ajax/`**, `/adminpanel/`, `/authentication*`,
  `/catalog/*/*/`, `/account/`, `/myaccount/`, `/payment/`, `/adding/`, `/i2/`, `/ad2/`. Sem
  `Crawl-delay` para `*` (o `Crawl-delay: 10` é só do `msnbot`). A nossa rota **`/carros`** (e
  `/carros/{marca}`, `/carros/anuncio/…`) **NÃO** cai em nenhum disallow → **PERMITIDA**.
  Instanciámos os prefixos proibidos no guard `assertAllowed` (`standvirtual/http.mjs`) e
  verificámos: `/carros*` PERMITIDO; `/api`, `/ajax`, `/payment`, `/account` BLOQUEADOS.

## Fonte — anúncio (`advertSearch.edges[].node`)

Os atributos do veículo vêm num array **`parameters[]`** de `{ key, value, displayValue }`
(indexado por `key`); o resto em campos do node. Mapa (→ `standvirtual/schema.mjs`):

| Campo fonte | → schema | Exemplo |
|---|---|---|
| `parameters[make].displayValue` | make | VW |
| `parameters[model].displayValue` | model | Passat Variant |
| `parameters[version].displayValue` | variant | 2.0 TDI Highline DSG |
| `parameters[first_registration_year].value` | year | 2016 |
| `parameters[mileage].value` | km | 158552 |
| `parameters[fuel_type].displayValue` | fuel | Diesel |
| `parameters[gearbox].displayValue` | gearbox | Automática |
| `parameters[engine_capacity].value` | engine (cm³) | 1968 |
| `price.amount.value` + `currencyCode` | price / currency | 15990 / EUR |
| `location.region.name` / `location.city.name` | region / city | Lisboa / … |
| `node.id` | **id** (dedupe/chave natural) | 8097600785 |
| `node.url` | detail_url | …/carros/anuncio/…ID8Q0HSh.html |
| `thumbnail.x2` (ou x1) | image | https://ireland.apollo.olxcdn.com/… |
| `createdAt` | listing_created_at (recência) | 2026-07-12T22:27:32Z |
| `seller.__typename` | **seller_type** (stand/particular) | ProfessionalSeller→stand |
| `sellerLink.name` | source / dealer (nome do stand) | AutoVenda |

- **`country`='PORTUGAL'**, **`currency`='EUR'**. **`source`** = nome do stand (`sellerLink.name`)
  ou `'Particular'` quando é vendedor privado.
- **`color`/`doors`/`category`/`postalCode` = null** — não vêm nesta projeção da listagem
  (`node.category` traz só um id numérico → guardado em extra `category_id`).
- **Extras:** `seller_type`, `dealer`, `seller_uuid`, `stand_id`, `city`, `engine_power_cv`,
  `engine_code`, `origin`, `category_id`, `price_evaluation` (indicador ABOVE/BELOW/IN/NONE),
  `price_drop`, `listing_created_at`, `title`.

## Cobertura (batch) e watch

- **Batch (`crawl.mjs`)** — pagina `/carros` por `?page=N` (32/pág) com sort determinístico:
  - **default:** até `--max-pages` páginas (amostra).
  - **`--brand {slug}`:** restringe a uma marca via path `/carros/{slug}` (ex. `bmw`,
    `mercedes-benz`).
  - **`--full`:** pagina até esgotar (~1324 páginas; cap de salvaguarda 1500). Dedupe global por
    `id`, checkpoint/resume, NDJSON, stats. **Sem fan-out por marca** (a paginação direta já é
    completa — não há cap).
- **Watch (`watch.mjs`)** — poll da 1ª página por `created_at_first:desc`; novos/price_change por
  `id`; sinal de recência = `max(createdAt)` por ciclo.

## Verificação (dados reais, 2026-07-12)

- `run --max-pages 3` → **96 anúncios** (catálogo 42.337), 7s. Cobertura: make/model/year/km/fuel/
  gearbox/price/region/detail_url/**recência**/seller_type/engine_power/city **100%**; variant 84%,
  engine 93%, image 99%; color/doors/category/postalCode 0% (por design).
- `--resume --max-pages 5` → 96→**158**, dedupe perfeito (158 linhas = 158 ids).
- `--brand bmw --max-pages 2` → **64 anúncios** (total marca 4.512), stands 35 / particulares 29.
- `watch --interval 12 --cycles 2` → ciclo 1: 32 novos; ciclo 2: 0 (estado estável), recência
  logada.
- `assertAllowed`: `/carros`, `/carros/bmw`, `/carros/anuncio/…` **PERMITIDOS**;
  `/api/…`, `/ajax/…`, `/payment/…`, `/account/…` **BLOQUEADOS**.
- `detail_url` e `image` resolvem (200).

## Ficheiros

`tools/collector/standvirtual/{http,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-standvirtual.mjs` + `tools/collector/watch-standvirtual.mjs`.
Reutiliza `lib/` sem alterar.
