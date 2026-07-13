# custojusto.pt — investigação técnica (spec do coletor)

> Como recolher dados do CustoJusto.pt (14º alvo; marketplace PT de usados, grupo Schibsted).
> Data: 2026-07-12. Método: reconhecimento estático (`curl` + análise do `__NEXT_DATA__` SSR).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Anti-bot **Cloudflare PASSIVO**
  (server: cloudflare, cf-cache DYNAMIC; sem challenge em todas as probes).
- **Molde autoboerse/flexicar** (`__NEXT_DATA__` SSR, flag `__N_SSP`). A fonte é
  `props.pageProps.listItems` — array de **40 anúncios/página** — + o total real em
  `props.pageProps.initialState.search.resources.totalAds`.
- **~26.412 anúncios** de carros usados (lido do SSR: `totalAds`; `totalPages` 661 × 40 ≈ 26,4k).
- **⚠️ Paginação `?o=N` ROBOTS-PROIBIDA** (`Disallow: /*?o=*`). Como no Flexicar (API vedada), a
  cobertura NÃO é por página mas por **FACETAS path-based** (marca / distrito / categoria), cada URL
  a devolver a 1ª página = 40 anúncios ordenados por data.
- **✅ Recência REAL:** o sort default é `SORT_DESC_PUBLISH_DATE` e cada anúncio traz `listTime`
  (ISO) → a 1ª página são os mais recentes; watch fiável.
- **Vendedor Profissional/Particular:** campo `companyAd` (bool) → `seller_type` + `source`.

## Acesso

- **Host canónico:** `https://www.custojusto.pt` (com `www`).
- **Anti-bot Cloudflare passivo:** 200 com UA de browser, sem challenge. Cookies guardados pelo
  `lib/http`. Rate-limit + backoff (já no lib) mitigam o risco sob volume.
- **robots.txt:** cabeçalho com aviso genérico contra spiders (comentário, não diretiva). Diretivas
  `Disallow` path-based bloqueiam paths de conta/sistema (`/user/`, `/login`, `/signup`,
  `/servicos/`, `/payments`, `/cdn-cgi/`, `/v2/`, `/modal/`, `/support/`, e prefixos curtos internos
  `/ar/ /cp/ /ma/ /sp/ /vf/ /thumbs/ /pg/ /aw/ /st/ /redir/ /iredir/ /newvi/`). **A listagem que
  usamos (`/{regiao}/veiculos/carros-usados[/...facetas]`) é PERMITIDA** — guarda em
  `custojusto/http.mjs` (`robotsDisallow`) + `lib/http.mjs`.
- **⚠️ Paginação vedada:** `Disallow: /*?o=*` e `Disallow: /*&o=*`. O `?o=N` aparece em
  `metadata.next` mas está proibido. Honramos **por construção**: o coletor NUNCA gera URLs com `?o=`
  (a guarda do lib é por prefixo de path, não casa query-strings — por isso a garantia é estrutural).
- Só **PT** (grupo Schibsted).

## Fonte — `__NEXT_DATA__` → `props.pageProps.listItems[]`

Um `<script id="__NEXT_DATA__" type="application/json">` por página. Campos por `listItem`
(→ schema em `tools/collector/custojusto/schema.mjs`):

| Campo SSR | → schema | Exemplo |
|---|---|---|
| `title` (casado c/ taxonomia `carBrands`) | make | Peugeot |
| `title` (1º token após a marca) | model | 2008 |
| `title` (resto, sem sufixo "- NN") | variant | 2008 Style |
| `params.regdate` | year | 2017 |
| `body`/`title` (regex `\d+ km`, best-effort) | km | 133000 |
| `params.fuel` | fuel | Diesel |
| `params.gearbox` | gearbox | Manual |
| `categoryName` | category (carroçaria) | SUV / TT |
| `price` | price | 10500 |
| `locationNames.district` | region | Évora |
| `companyAd` (bool) | **seller_type** / source | Profissional \| Particular |
| `url` (path) | detail_url | …/suv-tt/peugeot-2008-style-45136704 |
| `imageFullURL` | image | https://prod-images.custojusto.pt/… |
| `listID` | **id** (dedupe / recência) | 45136704 |
| `listTime` | **listing_created_at** (recência real) | 2026-07-12T23:32:27Z |

- **Sem make/model/km/cor/portas/cilindrada estruturados:** o `params` só tem
  `{ fuel, gearbox, regdate }`. **make** vem de casar o título contra a taxonomia `carBrands` (75
  marcas, embutida no SSR em `initialState.search.options.carBrands`) — robusto para marcas
  multi-palavra (Mercedes-Benz, Alfa Romeo, Land Rover); **model/variant** por corte do título;
  **km/power_hp** best-effort por regex sobre título+corpo; **color/doors/engine** → `null`.
- **Extras:** `seller_type`, `seller_name`, `company_ad`, `district`/`county`/`parish` (concelho/
  freguesia), `category_code`, `power_hp`, `listing_created_at`, `image_count`, `has_video`,
  `has_vtour`, `user_id`.
- **Cobertura medida (amostra de 116):** make/model/variant/year/fuel/gearbox/category/price/region/
  source/detail_url/image/seller_type/listing_created_at **100%**; km 19%, power_hp 28% (best-effort,
  dependem de o vendedor os escrever no texto). `postalCode` sempre `null` (só distrito/concelho).

## Paginação e cobertura (`--full`)

- **Paginação `?o=N` proibida → cobertura por facetas.** As facetas são todas path-based (permitidas):
  - **marca:** `/portugal/veiculos/carros-usados/{marca}` (ex. `…/peugeot` → 2.572).
  - **distrito:** `/{distrito}/veiculos/carros-usados` (20 distritos/ilhas).
  - **categoria:** `/portugal/veiculos/carros-usados/{categoria}` (9 carroçarias).
  - **combinadas:** `/{distrito}/veiculos/carros-usados/{categoria}/{marca}` (todas funcionam;
    `totalAds` próprio por faceta).
- **Seed:** a 1ª página traz `carBrands` (75 marcas, `shortName`=slug) e `baseLocations` (20 distritos)
  no `__NEXT_DATA__`.
- **`--full` = produto cartesiano marca × distrito** (75 × 20 = **1.500 facetas**), cada uma a captar
  os 40 mais recentes de `(marca, distrito)`. A união deduplicada cobre uma fração grande dos ~26,4k.
- **⚠️ Limite:** combos densos (>40, ex. Peugeot·Lisboa = 408) **truncam** na 1ª página (não há como
  paginar). O corte fino seguinte seria por categoria/preço/ano (não implementado — ver README).
- **default:** listagem base + fatias por marca (75) + por distrito (20) = 96 facetas.

## ✅ Recência (melhor que o AutoTrader)

O sort default é `SORT_DESC_PUBLISH_DATE` (visto em `queryData.structure`) E cada anúncio traz
`listTime` (ISO, precisão ao segundo). A 1ª página da listagem base = anúncios mais recentes → o
watch deteta novos de forma fiável (dedupe por `listID`; mudança de preço por `price`). O watch loga
o `max(listTime)` do ciclo como sinal de deriva.

## Verificação (ponta-a-ponta, dados reais — 2026-07-12)

1. `run-custojusto.ts --max-pages 3` → **116 anúncios** PT (6s), com make/model/year/fuel/gearbox/
   category/price/region/seller_type/image/listing_created_at a **100%** (km 19%, power_hp 28%).
2. `--resume --max-pages 2` → retomou na 4ª faceta, +2 facetas, **189 linhas, 0 duplicados** (dedupe
   global cross-faceta).
3. `--brand peugeot --max-pages 1` → **40 anúncios, todos Peugeot** (via `…/carros-usados/peugeot`).
4. `watch-custojusto.ts --interval 12 --cycles 2` → ciclo 1: 40 novos; ciclo 2: 0 novos (dedupe);
   `último` = `max(listTime)` mostrado.
5. Guarda robots: `/user/`, `/login`, `/servicos/` bloqueados; a listagem e as facetas passam.

## Ficheiros

- Coletor: `tools/collector/custojusto/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-custojusto.mjs`, `tools/collector/watch-custojusto.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
