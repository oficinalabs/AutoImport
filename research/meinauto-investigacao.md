# meinauto.de — investigação técnica (spec do coletor)

> Como recolher **Gebrauchtwagen** (usados) do meinauto.de (8º alvo).
> Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do payload SSR Nuxt 3 devalue).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200 em todas as probes. Anti-bot **PASSIVO**
  (stack Google: `server: envoy` + cookie `GCLB`; Baqend Speedkit à frente) — sem challenge.
- **Molde aramisauto** (app Nuxt, JSON SSR embutido), **mas Nuxt 3**: o payload vem num
  `<script id="__NUXT_DATA__" type="application/json">` em **JSON puro** → `JSON.parse` (SEM `node:vm`,
  ao contrário do aramisauto/Nuxt 2 com IIFE `window.__NUXT__=(function…)`).
- **Formato devalue "flatten":** array plano onde os nós se referenciam por ÍNDICE inteiro (dedup +
  ciclos do Vue). Re-hidratamos o grafo (`unflatten` em `parse.mjs`) antes de o usar.
- **Fonte = `root.pinia.results` = { meta, results }.** `results[]` = **47 veículos/página**, riquíssimos
  (make/model/trim/1ª-matrícula/km/combustível/caixa/cilindrada/cor/portas/carroçaria/preço/stand/
  morada/imagens/CO2/potência/dono anterior/acidentes/`createdAt`). `meta.totalResults` + `meta.counts`
  (facetas).
- **⚠️ USADOS vs. NOVOS:** o meinauto mistura Neuwagen/Leasing/configuráveis com usados. Filtramos
  SEMPRE `conditionCategories=PRE_OWNED` → **~9.100 usados** com preço/km/ano reais (o facet mostra
  `{NEW: 2680, PRE_OWNED: 9109}`). O schema guarda `condition_category` como salvaguarda.
- **Paginação `?page=N`** (47/pág), rota `/fahrzeugsuche/` (barra final obrigatória). **SEM teto de
  offset** — a query única desce até ao fim (p194 ≈ offset 9071; p195 vazia). Cobre tudo sem fatiar.
- **✅ Recência REAL:** `sortBy=createdAt&order=desc` funciona (topo da p1 = timestamps do próprio dia,
  decrescentes) → watch fiável. Cada anúncio traz `createdAt` (`listing_created_at`).

## Acesso

- **Host canónico:** `https://www.meinauto.de` (com `www`; sem ele redireciona). Rota de resultados
  exige barra final: `/fahrzeugsuche/` (sem ela, 301 → acrescenta `/`).
- **Anti-bot passivo:** 200 com UA de browser, sem challenge. Cookie `GCLB` guardado pelo `lib/http`.
  Rate-limit + backoff (já no lib) mitigam o risco sob volume.
- **robots.txt (User-agent: `*`):** muito tolerante — só bloqueia `/envkv/`, `/motoren/`,
  `/ausstattung/` e o padrão legado `/*_escaped_fragment_`. **Sem Crawl-delay** para `*` (vários bots
  SEO levam Disallow:/ total, mas nós somos `*`). A listagem (`/fahrzeugsuche/`, `/gebrauchtwagen/`) é
  **permitida** — nunca tocamos os disallow (guarda em `meinauto/http.mjs` + `lib/http.mjs`).
- Mantemos o default de 1500ms por não haver Crawl-delay declarado.

## Fonte — `pinia.results` (Nuxt 3 devalue)

O `/gebrauchtwagen/` (landing SEO) embute várias queries-teaser; a página de RESULTADOS real é
`/fahrzeugsuche/`. O payload `__NUXT_DATA__` re-hidratado dá `root.pinia.results`:

- `meta` = `{ limit: 47, offset, totalResults, counts }`. `counts` são as **facetas** (contagens por
  marca/modelo/combustível/carroçaria/portas/…). `counts.makes` (nomes) semeia o `--full`.
- `results[]` = 47 veículos. Mapa (→ schema em `tools/collector/meinauto/schema.mjs`):

| Campo devalue (result) | → schema | Exemplo |
|---|---|---|
| `make.name` | make | Volkswagen |
| `model.name` | model | T-Roc |
| `vehicle.trim.name` | variant | Sport |
| `vehicle.initialRegistration` (ISO) | year / first_registration | 2022 / 02/2022 |
| `vehicle.mileage` | km | 83931 (pode ser 0 em pré-matrículas) |
| `vehicle.metaFuelType` | fuel | PETROL / DIESEL / ELECTRIC / PLUGIN_HYBRID / LPG |
| `vehicle.transmissionType` | gearbox | AUTOMATIC / MANUAL |
| `vehicle.ccm` | engine | 1968 |
| `color.carPaint` (fallback `.base`) | color | Schwarz / BLACK |
| `vehicle.doors` | doors | 5 |
| `model.bodyType` | category | SUV / LIMOUSINE / ESTATE_CAR |
| `calculation.purchasePrice` (float→round) | **price** | 19770 |
| `addresses.vehicle.region` / `.zipcode` | region / postalCode | Niedersachsen / 37170 |
| `seller.name` (`.slug`) | source (extra: seller_slug) | Autohaus Siebrecht GmbH |
| `id` | id / detail_url | …/fahrzeugsuche/detail/{id} |
| `images[0].path` | image | assets-meinauto.de/{path} |
| `vehicle.power.kw` | power_kw | 110 |
| `vehicle.co2Emission` | co2 | "135 g/km" |
| `vehicle.previousOwner` / `.accidentDamaged` | previous_owner / accidents | 1 / false |
| `createdAt` | **listing_created_at** (recência) | 2026-07-09T12:57:28Z |
| `vehicle.usageType` | usage_type | PRE_REGISTRATION / DEMONSTRATION / EMPLOYEES_CAR |

- **PREÇO:** `calculation.purchasePrice` é o preço de venda à vista (float, ex. 19770.01) → **Math.round**
  (NÃO `toInt`, que colaria "1977001"). `vehicle.totalListPrice` (preço-de-lista) guardado como extra.
- **detail_url:** `https://www.meinauto.de/fahrzeugsuche/detail/{id}` (verificado 200).
- **image:** `https://assets-meinauto.de/{images[0].path}` (original; verificado 200; o site também
  serve variantes `_w-400_q-60.webp`).

Cobertura medida (amostra de 47, p1 PRE_OWNED): make/model/year/km/fuel/gearbox/engine/category/price/
region/postalCode/source/detail_url/image/power_kw/id = **47/47**; doors 46/47; variant 32/47; co2 46/47;
previous_owner 46/47; listing_created_at 47/47. Todos `condition_category=PRE_OWNED`.

## Paginação e cobertura (`--full`)

- **Paginação `?page=N`** (47/pág; confirmado p1 vs p2 = 0 ids em comum). Rota `/fahrzeugsuche/`.
  `offset`/`pageNumber`/`seite` são ignorados — só `page` funciona (offset derivado = (page-1)·47).
- **SEM teto de offset** — a query única cobre os 9.109 usados (~194 páginas). `page` além do fim dá
  página vazia (p195); um `page` absurdo (400) faz wrap para offset 0 → o crawl PARA em `listings` vazio.
- **`--full` por marca:** mesmo não sendo necessário para cobrir tudo, fatiamos por **marca**
  (`makes={nome}`, ex. `makes=Audi` → só Audi) — como o autoboerse — para contagens por marca e
  robustez (partições < ~1.300, muito dentro do cap). Os ~47 nomes de marca vêm de `meta.counts.makes`
  da 1ª página → seed do `--full`. O dedupe global apanha resíduos.
- **`--brand <Nome>`** filtra uma marca via `makes=` (nome, não slug: "Audi", "Volkswagen", "Mercedes-Benz").

## ✅ Recência (watch)

`sortBy=createdAt&order=desc` ordena por data de criação decrescente — verificado: topo da p1 com
timestamps do próprio dia. O watch faz poll de `/fahrzeugsuche/?conditionCategories=PRE_OWNED&
sortBy=createdAt&order=desc` e deteta NOVOS/mudanças de preço via `lib/sink`. Cada anúncio traz
`createdAt` (`listing_created_at`) → sinal de recência real (como o autoboerse, melhor que
AutoTrader/aramisauto).

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-meinauto.mjs --max-pages 3` → **141 usados** (9s), preço €9.890–68.790 (média 24.945), com
   make/model/year/km/fuel/gearbox/region/source(stand)/power_kw/image preenchidos; todos PRE_OWNED.
2. `--resume --max-pages 5` → retomou em 141, +94 (p4-p5) sem duplicar (235); 235 linhas = 235 ids únicos.
3. `--brand Audi --max-pages 2` → **94 anúncios, todos AUDI** (via `makes=Audi`).
4. `--full --max-pages 1` → sonda descobre **47 marcas** a percorrer.
5. `watch-meinauto.mjs --interval 12 --cycles 2` → ciclo 1: 47 novos; ciclo 2: 0 novos (dedupe);
   anúncio mais recente com `createdAt` do próprio dia (sortBy=createdAt confirmado).
6. Guarda robots: `/envkv/`, `/motoren/`, `/ausstattung/` bloqueados; `/fahrzeugsuche/` e
   `/gebrauchtwagen/` passam.

## Ficheiros

- Coletor: `tools/collector/meinauto/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-meinauto.mjs`, `tools/collector/watch-meinauto.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
