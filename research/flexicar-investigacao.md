# flexicar.es — investigação técnica (spec do coletor)

> Como recolher dados do flexicar.es (5º alvo, após theparking.eu, AutoTrader.nl, autoboerse.de e autocasion.com).
> Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do `__NEXT_DATA__`, dos chunks JS e do sitemap).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. **Sem anti-bot** (`server: nginx`,
  `x-nextjs-cache: HIT`) — nenhum challenge em todas as probes.
- **Molde autoboerse/autotrader** (`__NEXT_DATA__` SSR), **não** o JSON-LD do autocasion. A fonte é
  `props.pageProps.initialVehicles` — **array de 12 veículos ricos por página** — + `countVehicles`.
- **~22.500 anúncios ES** (lido do SSR: `countVehicles: 22527`), stock **próprio** da rede Flexicar
  (~180 concessionários).
- **⚠️ Teto do SSR = 12 e a paginação real é robots-PROIBIDA.** O SSR de qualquer rota devolve sempre
  os **primeiros 12** (`?page=N` é ignorado no servidor). A paginação/scroll-infinito do site é feita
  por XHR do cliente para **`https://services.flexicar.es/api/v1/vehicles?page=N&size=12`** — e esse
  host tem **`robots.txt: Disallow: /`** (tudo proibido). **Não o tocamos.** A cobertura robots-limpa
  obtém-se **fatiando por facetas** (marca / marca·modelo / província / …), cada URL a render 12 no SSR.
- **Cobertura (`--full`) via SITEMAP:** o `sitemap.xml` lista **~9.685 URLs de faceta** `…/segunda-mano/`
  (marca, marca·modelo, marca·modelo·província, carroçaria, preço…). As facetas granulares têm ≤12
  veículos → **captura total** dessas fatias. É o nosso seed de cobertura máxima.
- **⚠️ Recência (como o AutoTrader/autocasion):** sem sort por data no SSR. O watch usa a **ordem
  default da página 1** como proxy e loga o `max(id)` (id de stock crescente = mais recente) como sinal.

## Acesso

- **Host canónico:** `https://www.flexicar.es` (stack **Next.js**, `__NEXT_DATA__` no SSR).
- **Sem anti-bot:** 200 com UA de browser em todas as probes; `nginx` + cache Next. Cookies geridos
  pelo `lib/http`; rate-limit + backoff (já no lib) por educação.
- **robots.txt de `www.flexicar.es` (tolerante):** bloqueia `/admin/`, `/api/`, `/iniciar-sesion/`,
  `/search/` e o padrão de query `/*?utm`. As rotas que usamos (`/coches-segunda-mano/`,
  `/{marca}/segunda-mano/`, `/{marca}/{modelo}/coches-{provincia}/segunda-mano/`, `/sitemap.xml`) são
  **permitidas** — nunca tocamos os disallow (guarda em `flexicar/http.mjs` + `lib/http.mjs`).
- **⛔ `robots.txt` de `services.flexicar.es` = `Disallow: /`** (host da API de paginação). **Nunca**
  emitimos pedidos a esse host — o coletor só fala com `www.flexicar.es`.

## Fonte — `__NEXT_DATA__` → `pageProps.initialVehicles`

Um `<script id="__NEXT_DATA__" type="application/json">` por página. `props.pageProps` traz:
`initialVehicles` (12 veículos), `countVehicles` (total da query), `brands` (57, seed de `--full`/
`--brand`), `provinces` (45), `dealerships` (183, com `province`/`zipCode`/`location` → derivamos
região + CP), `subcategoryDetails` (URLs de faceta) e schemas JSON-LD (usamos o `initialVehicles`, mais
rico). Mapa (→ `tools/collector/flexicar/schema.mjs`):

| Campo `initialVehicles` | → schema | Exemplo |
|---|---|---|
| `brand` | make | SEAT |
| `model` | model | Leon |
| `version` | variant | 1.5 EcoTSI 96kW (130CV) St&Sp Style |
| `year` | year | 2019 |
| `km` | km | 126156 |
| `fuel` | fuel | Gasolina |
| `transmission` | gearbox | Manual |
| (sem cilindrada) | engine = null | — |
| `color` | color | Azul |
| (não exposto) | doors = null | — |
| (não exposto) | category = null | — |
| `price` | price | 12690 |
| — | currency | EUR |
| — | country | SPAIN |
| `carDealership` → `dealerships[].province` | **region** | La Rioja |
| `carDealership` → `dealerships[].zipCode` | postalCode (best-effort) | 26009 |
| `carDealership` | source (concessionário Flexicar) | Logroño |
| `coches-ocasion/` + `slug` | detail_url | https://www.flexicar.es/coches-ocasion/seat-leon-…_903000000253626 |
| `image` / `images[0]` | image | https://www.flexicar.es/images/…webp |
| `id` | **id** (dedupe / recência) | 903000000253626 |

- **`region`/`postalCode` derivados:** o veículo só traz a **cidade** do concessionário
  (`carDealership`/`carDealershipSlug`, ex. `logrono`). Cruzamos com o array `dealerships` da **mesma
  página** (mapa cidade→`province`/`zipCode`), tolerando sufixos de índice (`zaragoza-1` → `zaragoza`).
- **Extras próprios (de graça no SSR):** `source_site='flexicar.es'`, `id`, `dealer`,
  `dealership_slug`, `power_kw`/`power_hp` (extraídos do `version`, ex. `96kW (130CV)`), `eco_sticker`
  (etiqueta DGT), `previous_price`, `retail_price`, `cash_price`, `quota_price` (€/mês), `offer`,
  `outlet`, `reserved`, `financiable`, `tax_deductible`, `images` (galeria).

## Paginação e cobertura (`--full`)

- **SSR não pagina:** `/coches-segunda-mano/?page=2` devolve **os mesmos 12** ids da página 1 (o
  `getServerSideProps` ignora `page`). O mesmo no `/_next/data/{buildId}/…json?page=N`. A paginação
  real é **só** por XHR a `services.flexicar.es` (robots-proibido) → **não usamos**.
- **Facetas combinam no path** (confirmado): `/{marca}/segunda-mano/` (ex. `/audi/segunda-mano/` →
  1.063), `/coches-{provincia}/segunda-mano/` (ex. `/coches-madrid/segunda-mano/` → 4.845),
  `/{marca}/coches-{provincia}/segunda-mano/` (ex. `/audi/coches-madrid/segunda-mano/` → 231),
  `/{marca}/{modelo}/coches-{provincia}/segunda-mano/`, `/carroceria-{tipo}/…`, `/coches-{preço}/…`.
  Cada URL render **12** no SSR.
- **`--full` seeda do `sitemap.xml`:** ~**9.685** URLs `…/segunda-mano/`. As granulares
  (marca·modelo·província) têm quase sempre ≤12 → **captura total** dessas fatias; a união deduplicada
  cobre uma fração grande dos 22,5k com pedidos robots-limpos.
- **Sem `--full`:** query base `/coches-segunda-mano/` + fatias por **marca** (seed de `pageProps.brands`,
  57). **`--brand {slug}`:** só a rota da marca.
- **`--max-pages N`** aqui limita o **nº de facetas** processadas (cada faceta = 1 página SSR de ≤12; não
  há paginação robots-permitida). Nome mantido por paridade com os outros CLIs.

## ⚠️ Recência (como o AutoTrader/autocasion)

Sem ordenação por data no SSR e sem `createdAt` por anúncio. O watch usa a **ordem default da página 1
como proxy**; o `id` (id de stock crescente = mais recente) serve de sinal: o watch loga o `max(id)` por
ciclo para priorizar/detetar deriva. Captura exaustiva de novos depende do **re-crawl batch periódico**.

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-flexicar.mjs --max-pages 3` → **25 anúncios** ES (6s; base + 2 marcas). Cobertura por campo
   (25 registos): `make/model/variant/year/km/fuel/gearbox/color/price/region/postalCode/source/`
   `detail_url/image` **25/25**; `eco_sticker` 24/25; `power_hp` 13/25 (versões só-kW, ex. elétricos,
   não trazem CV — mas `power_kw` fica preenchido).
2. `--resume --max-pages 6` → retomou nas facetas 4–9, **25 → 85** anúncios, **0 duplicados** (mesmo NDJSON).
3. `--brand audi --max-pages 1` → **12 anúncios, todos AUDI** (rota `/audi/segunda-mano/`).
4. `--full --max-pages N` → seed de **9.684 facetas** do sitemap (log: "9684 facetas a percorrer").
5. `watch-flexicar.mjs --interval 12 --cycles 2` → ciclo 1: **12 novos**; ciclo 2: **0 novos** (dedupe);
   `maxId` logado por ciclo (903000000257765).
6. Guarda robots (`assertAllowed`): `/coches-segunda-mano/`, `/audi/segunda-mano/`,
   `/audi/q3/coches-madrid/segunda-mano/`, `/sitemap.xml` → **ALLOW**; `/api/…`, `/admin/…`,
   `/iniciar-sesion/`, `/search/…` → **BLOCK**. `baseUrl` do cliente = `https://www.flexicar.es`; o host
   `services.flexicar.es` (API de paginação, `Disallow: /`) **nunca** é construído nem contactado.

### Exemplo de registo real recolhido
```json
{ "make":"Audi","model":"A3","variant":"Sportback Advanced 30 TFSI 81kW S tronic","year":2021,
  "km":65000,"fuel":"Híbrido no enchufable","gearbox":"Automática","engine":null,"color":"Blanco",
  "doors":null,"category":null,"price":18490,"currency":"EUR","country":"SPAIN","region":"Cantabria",
  "postalCode":"39011","source":"Santander",
  "detail_url":"https://www.flexicar.es/coches-ocasion/audi-a3-…-santander_903000000237291",
  "image":"https://www.flexicar.es/images/903000000237291/…webp","source_site":"flexicar.es",
  "id":903000000237291,"dealer":"Santander","eco_sticker":"E","power_kw":81,"power_hp":null,
  "previous_price":21790,"cash_price":21790,"quota_price":288,"offer":true,"financiable":true }
```

## Ficheiros

- Coletor: `tools/collector/flexicar/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-flexicar.mjs`, `tools/collector/watch-flexicar.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
