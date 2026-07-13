# autouncle.pt — investigação técnica (spec do coletor)

> Como recolher dados do **autouncle.pt** — o meta-motor/agregador dinamarquês **AutoUncle**, versão
> Portugal. Indexa ~**99 mil** anúncios PT de ~9 sites-fonte PT (o "93 sites" do título é o total
> global) e enriquece cada um com a sua **avaliação de preço própria (AutoScore, 1–5)**.
> Data: 2026-07-13. Método: reconhecimento estático (`curl` + análise do JSON-LD, do payload RSC
> `__next_f` e de probes reais à paginação, às facetas de path e à config API).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser → **200** em todas as probes. Servidor
  **Cloudflare** com anti-bot **PASSIVO** (sem challenge JS/DataDome). HTTP puro + rate-limit/retry do
  lib chegam. **Sem proxies nem stealth.**
- **Fonte = SSR da página `/pt/carros-usados`, com DOIS blocos que juntamos pelo carId** (molde
  theparking/agregador). É uma SPA **Next.js (App Router)**, mas a listagem é renderizada no servidor:
  1. **JSON-LD** — 1 bloco `application/ld+json` com `@graph` → **`ItemList.itemListElement[25].item`**
     (um `Product`+`Vehicle` rico) + **`ItemList.numberOfItems`** = total da query. Dá o "catálogo":
     make/model/ano/km/combustível/caixa/cilindrada/cor/portas/carroçaria/preço/CO2/consumo/URL.
  2. **RSC** — o payload React Server Components em **~250 `self.__next_f.push([n,"…"])`**. Concatenado
     e desescapado, tem por carro um objeto de props com o que falta a um AGREGADOR: a **FONTE de
     origem** (`sourceName`, ex. "PRCar"), o **AutoScore** (`auRating` 1–5), a **imagem real**
     (`imageUrls`), a **variante** (`equipmentVariant`) e os **dias em stock** (`laytime`). Ancoramos
     em cada `vdpPath` (contém o carId) e lemos os campos numa janela à volta.
- **Chave de junção/dedupe:** o **carId numérico** do URL `…/pt/d/{id}-…` (presente em ambos os blocos).
- **`source`** = site/stand de origem (`sourceName`); **`source_site`** = `'autouncle.pt'`;
  **`country`** = `'PORTUGAL'`; **`currency`** = `'EUR'`.
- **Paginação `?page=N`** (25/pág). **Teto ~página 100** (`?page=100` → 200; `?page=150/200` → 404).
- **Volume:** **98.750** anúncios (campo `numberOfItems`; a config API soma 98.655).
- **⚠️ Recência:** o site **não** permite ordenar por data (o robots proíbe `s[order_by]=`). Usamos
  **`days_on_market` (laytime)** como sinal-proxy (menos dias = mais fresco). Captura exaustiva de
  novos depende do re-crawl batch.

## Acesso e robots.txt (a verificação-chave)

- **Host canónico:** `https://www.autouncle.pt`. Rota de listagem: `/pt/carros-usados`.
- **robots.txt** — neste domínio **.pt** o locale **`/pt/` é PERMITIDO** (todos os outros — `/de/`,
  `/es/`, `/fr/`, `/da/`, … — estão em `Disallow: /xx/`). MAS há dois bloqueios que moldam a estratégia:
  - **SRP com parâmetros de pesquisa** (o mais importante):
    ```
    Disallow: /pt/carros-usados/*s[order_by]=*
    Disallow: /pt/carros-usados/*s[*]=*
    ```
    → **não podemos filtrar/ordenar por query `s[...]=`** (é assim que o site faz filtros e o sort por
    data). Por isso a cobertura faz-se **só por facetas de PATH** + `?page=N`. O `?page=N` **não contém
    `s[`** → é permitido (verificado com o guard `assertAllowed`).
  - **Saída para a origem:** `Disallow: /pt/link-externo/` — **nunca pedimos** esse URL; apenas LEMOS o
    slug da fonte no HTML (`/pt/link-externo/{slug}/{carId}/{extId}`).
  - Também em Disallow: `/pt/apps/*` (relatórios/valuation embebidos), `/widgets/`, `/api/facebook-proxy`.
- **⚠️ Config API — permitida.** `GET /api/v4/car_search_form/config` (JSON, 200) devolve a taxonomia de
  facetas, incluindo **`carModelsByBrandDetailed.allBrands`** (323 marcas com contagens; 104 com >0).
  Esse path **NÃO** está em Disallow → é permitido (usamo-lo para semear as marcas do `--full`).
- **Guard `assertAllowed` (probes reais):** `/pt/carros-usados`, `/pt/carros-usados/Renault`,
  `?page=5` e a config API → **PERMITIDOS**; `/pt/link-externo/…`, `/pt/apps/…` e outros locales
  (`/de/…`) → **BLOQUEADOS**. Sem `Crawl-delay` para `*` → default educado do lib (1500ms + jitter).

## Fonte — o registo (JSON-LD `item` + extras RSC)

Mapa (→ schema em `tools/collector/autouncle/schema.mjs`):

| Campo | Origem | → schema | Exemplo |
|---|---|---|---|
| `brand.name` | JSON-LD | make | Renault |
| `model` | JSON-LD | model | Captur |
| `equipmentVariant` | RSC | variant | Business |
| `vehicleModelDate` | JSON-LD | year | 2020 |
| `mileageFromOdometer.value` | JSON-LD | km | 103989 |
| `fuelType` | JSON-LD | fuel | Diesel / Gasolina / Eléctrico |
| `vehicleTransmission` | JSON-LD | gearbox | Automática / Manual |
| `engineDisplacement` (L→cm³) | JSON-LD | engine | 1500 |
| `color` / `numberOfDoors` / `bodyType` | JSON-LD | color/doors/category | Cinzento / 5 / SUV |
| `offers.price` / `offers.priceCurrency` | JSON-LD | price/currency | 16900 / EUR |
| `@id` (sem `#`) | JSON-LD | detail_url | …/pt/d/6551782-usado-2020-renault-captur-… |
| carId do URL | ambos | **id** (dedupe) | 6551782 |
| **`sourceName`** | **RSC** | **source** (origem) | **PRCar** / Feiracar.pt / Ar-automoveis.com / PiscaPisca |
| `imageUrls[0]` | RSC | image | https://images.autouncle.com/pt/car_images/…webp |

- **`country`='PORTUGAL'**, **`source_site`='autouncle.pt'**. **`region`/`postalCode` = null** — o
  JSON-LD só expõe `addressCountry: PT` por anúncio (sem localidade/CP fina nesta projeção).
- **Extras próprios:** **`price_rating`** (AutoScore `auRating` 1–5, 5=ótimo preço), **`estimated_price`**
  (avaliação de **preço-justo da AutoUncle**), **`you_save`** (poupança estimada), **`days_on_market`**
  (`laytime`, proxy de recência), **`seller_type`** (particular/stand, de `isPrivateCar`),
  **`source_slug`** + **`source_external_id`** (do link de saída), `power_hp`/`power_kw`, `co2`,
  `fuel_consumption`, `model_generation`, `name`.

## Cobertura (batch) e watch

- **Batch (`crawl.mjs`)** — pagina `?page=N` (25/pág); dedupe global por carId; checkpoint/resume; NDJSON; stats.
  - **default:** uma query (marca opcional via `--brand`), até `--max-pages` (amostra).
  - **`--full`:** fatia por **MARCA** via PATH SEO canónico (`/pt/carros-usados/{Marca}`), com a lista
    semeada da **config API** (104 marcas com >0, densas primeiro). **Limitação honesta:** o teto de
    paginação (~100 pág = ~2.500/query) deixa as **~14 marcas densas** (Peugeot 12.440, Renault 9.153,
    Mercedes 8.825, BMW 8.300, Citroën 6.270, VW 5.289, Opel 4.660, Fiat 4.427, Ford 4.182, Audi 3.944,
    Seat 3.285, Nissan 2.972, Toyota 2.739, Volvo 2.610) cobertas só na **primeira fatia de ~2.500**. O
    sub-corte por modelo seria o passo seguinte, mas o **slug de modelo do site NÃO mapeia 1:1 com o
    config** (ex. path `Mégane` ≠ config "Megane E-Tech"; `Mercedes/Classe A` → 308), pelo que seria
    frágil — não implementado. As restantes ~90 marcas ficam 100%.
- **Watch (`watch.mjs`)** — poll das primeiras páginas na **ordem default** (sem sort por data — robots);
  novos/`price_change` por carId; sinal de recência = `min(days_on_market)` por ciclo.

## Verificação (dados reais, 2026-07-13)

- `run --max-pages 3` → **75 anúncios**, 5s. Cobertura /75: make/model/year/km/fuel/gearbox/price/
  currency/country/**source**/detail_url/id **100%**; color 100%, doors 96%, category/engine ~92%,
  **image 80%** (real do RSC; resto sem foto na origem), price_rating 88%, days_on_market/seller_type 88%,
  power ~96%; region/postalCode 0% (por design). Fontes: PiscaPisca, PRCar, Ar-automoveis.com, Feiracar.pt.
- `--resume --max-pages 5` → 75→**122**, dedupe perfeito (122 linhas = 122 ids).
- `--full --max-pages 1` → semeia **104 marcas** do config, densas primeiro (Peugeot 12.440 → …), e
  fatia por path por marca. `--brand Renault` → 50/50 Renault.
- `watch --interval 12 --cycles 2 --pages 2` → ciclo 1: 50 novos; ciclo 2: 0 (estado estável),
  `minDias` logado.
- `assertAllowed`: listagem/marca/`?page`/config **PERMITIDOS**; `link-externo`/`apps`/outros-locales
  **BLOQUEADOS**. `detail_url` (200 via redirect canónico) e `image` (200 webp) resolvem.

## Ficheiros

`tools/collector/autouncle/{http,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-autouncle.mjs` + `tools/collector/watch-autouncle.mjs`. Reutiliza `lib/` sem alterar.
