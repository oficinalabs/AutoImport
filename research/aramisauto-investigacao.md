# aramisauto.com — investigação técnica (spec do coletor)

> Como recolher dados do aramisauto.com (retalhista francês de usados/0km, stock próprio).
> Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do estado Nuxt e do JSON-LD).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Anti-bot **Cloudflare PASSIVO**
  (fotos via `/cdn-cgi/image/…`, tokens de analytics CF no HTML) — sem challenge em todas as probes.
- **Molde autotrader/autoboerse** (JSON SSR embutido), **não** o JSON-LD+card do theparking/
  autocasion. Diferença: é uma app **Nuxt** → o estado vem em `window.__NUXT__=(function(a,b,…){…}(…))`
  (IIFE minificada, não JSON puro). **Avaliamo-la num sandbox `node:vm`** com contexto vazio +
  timeout (não `eval` global; a payload é dados puros, mas o sandbox blinda contra mudanças de
  minificador).
- **Fonte única e rica:** `nuxt.data[0].displayedSearchVehicleResponse.vehicles` = **array de 24
  veículos** com todos os campos (maker/model/finish/engine/energyType/transmission/mileage/
  firstCirculationDate/power/category/color/price/photo/offerType…). O JSON-LD da página é **pobre**
  (só name/url/price) → ignorado.
- **~2.871 anúncios FR** (campo `total` da resposta; retalhista de stock próprio, catálogo pequeno).
- **Paginação `?page=N`** (24/pág); rota `/achat/`. **Sem teto:** a página a seguir ao último
  resultado dá **404** (verificado p100 ok, p130 404). `--full` fatia por **categoria** (silos SEO).
- **⚠️ Recência (como o AutoTrader/Autocasión):** sem sort por data — e o robots proíbe `/*sort=*` /
  `/*orderBy`. Proxy = ordem default + `vehicleId` crescente.

## Acesso

- **Host canónico:** `https://www.aramisauto.com`.
- **Anti-bot Cloudflare passivo:** 200 com UA de browser, sem challenge. Cookies guardados pelo
  `lib/http`. Rate-limit + backoff (já no lib) mitigam o risco sob volume.
- **robots.txt — `Crawl-delay: 5`** (honramos com `minDelayMs` default **5000ms**, afinável via
  `--rate`). Disallow **maioritariamente por query-string** (`*sort=*`, `*?years*`, `*?categories*`,
  `*?fuels[0]=*`, `/*orderBy`, `*utm`, `*?filtre=*`, `/*text`…) e alguns por **path** (`/cdn-cgi/`,
  `/agence/`, `/voiture-neuve/`, `/offre/`, `/minisite/`, `/cms/`, `/commande/`, `/financement/`,
  `/beta-modele/`, `/clients/…`, `/contact/prise-rdv`, …). **A listagem que usamos (`/achat/` e silos
  `/achat/{categoria}/`, paginada só com `?page=N`) é PERMITIDA** — não usa nenhum parâmetro proibido.
  Guarda por prefixo de path em `aramisauto/http.mjs` + `lib/http.mjs`. Só **FR** (Aramis Auto).

## Fonte — veículo Nuxt (`displayedSearchVehicleResponse.vehicles`)

Mapa (→ schema em `tools/collector/aramisauto/schema.mjs`):

| Campo Nuxt | → schema | Exemplo |
|---|---|---|
| `maker` | make | Peugeot |
| `model` | model | 2008 |
| `finish` | variant (acabamento) | Active |
| `firstCirculationDate` (YYYY-…) | year | 2025 |
| `mileage.km` | km | 1471 |
| `energyType.label` (FR) | fuel | Électrique / Essence / Diesel / Hybride… |
| `transmission.label` (FR) | gearbox | Automatique / Manuelle |
| `engine` | engine | "50 kWh - 136ch", "SHS-P" |
| `simpleColors[0].label` | color | Noir |
| `category.label` | category (carroçaria) | 4x4 et SUV |
| `sellingPriceWithTaxes` | price | 24499 |
| `photo.url` | image | https://storage.googleapis.com/aramis_vehicles/… |
| `vehicleId` | **id** (dedupe/recência) | 974409 |
| (reconstruído das partes) | detail_url | /voitures/peugeot/2008/active/rv974409/?vehicleId=974409 |

- **`country`='FRANCE'**, **`currency`='EUR'**, **`source`='Aramisauto'** (stock próprio — não é
  agregador de stands). **`region`/`postalCode`/`doors` = null** (retalhista nacional, sem local nem
  nº de portas por anúncio na listagem).
- **`detail_url`** é reconstruído de `makerId/modelId/finishId/offerId/vehicleId` — bate **1:1** com
  os URLs do JSON-LD da própria página (verificado).
- **Extras próprios:** `offer_type` (0km vs. ocasião vs. neuf), `status`, `power_ch`/`power_kw`,
  `tax_horsepower`, `energy_id`, `category_id`, `battery_autonomy_wltp`, `catalog_price`,
  `discount_amount`/`discount_percent`, `monthly_loan`, `promotions[]`.

Cobertura medida (amostra de 72): **100% (72/72)** em make, model, variant, year, km, fuel, gearbox,
engine, color, category, price, source, detail_url, image, id, offer_type, power_ch.

## Paginação e cobertura (`--full`)

- **Paginação `?page=N`** (24/pág; confirmado: p1 vs p2 = 0 ids em comum). Rota `/achat/`.
  **Sem teto de paginação:** p100 devolve resultados; p130 (além do total) devolve **404** → sinal
  limpo de fim.
- **`--full` por categoria:** o site expõe silos SEO **`/achat/{categoria}/`** que **particionam** o
  catálogo (as contagens do facet `categoryId` somam exatamente o `total`). São 10 carroçarias
  (`4x4-et-suv`, `berline-compacte`, `break`, `cabriolet`, `citadine`, `coupe`, `ludospace`,
  `monospace`, `routiere`, `utilitaire`) — hardcoded (taxonomia SEO estável). Iterá-las cobre tudo
  sem sobreposição; o dedupe global apanha qualquer resíduo. Custo total ≈ paginar `/achat/` uma vez.
- **`--slice <silo>`** (análogo do `--brand` dos outros): uma só query a `/achat/{silo}/`. O
  aramisauto **não tem path por marca** (`/achat/peugeot/` = 404), mas os silos por categoria/
  combustível (`diesel`, `essence`, `electrique`, `4x4-et-suv`, `occasion`, `neuves`…) filtram bem
  (ex. `/achat/diesel/` → só Diesel).

## ⚠️ Recência (como o AutoTrader/Autocasión)

O aramisauto **não expõe sort por data** — e o robots proíbe `/*sort=*` / `/*orderBy`. O watch usa a
**ordem default da página 1 de `/achat/` como proxy**; o `vehicleId` (id numérico crescente = entrada
mais recente no catálogo) serve de sinal: o watch loga `max(vehicleId)` por ciclo para priorizar/
detetar deriva. Captura exaustiva de novos depende do **re-crawl batch periódico**.

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-aramisauto.ts --max-pages 3` → **72 anúncios** FR (5s), **cobertura 100%** em todos os
   campos-base (price/make/model/variant/year/km/fuel/gearbox/engine/color/category/…).
2. `--resume --max-pages 5` → retomou em 72, +48 sem duplicar (**120**, 120 ids únicos).
3. `--slice diesel --max-pages 2` → **48 anúncios, todos `fuel=Diesel`** (via silo `/achat/diesel/`).
   `--full --max-pages 1` → percorreu as **10 categorias** (192 registos, 1 pág/categoria).
4. `watch-aramisauto.ts --interval 12 --cycles 2` → ciclo 1: **24 novos** (maxId 1009425); ciclo 2:
   **0 novos** (dedupe), maxId estável.
5. Guarda robots: pedidos a `/agence/`, `/cms/`, `/offre/`, `/voiture-neuve/`, `/clients/`,
   `/cdn-cgi/` são **bloqueados**; `/achat/`, `/achat/?page=2`, `/achat/diesel/` passam.

## Ficheiros

- Coletor: `tools/collector/aramisauto/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-aramisauto.mjs`, `tools/collector/watch-aramisauto.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
