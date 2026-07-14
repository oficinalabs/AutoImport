# auto.pt — investigação técnica (spec do coletor)

> Como recolher anúncios de carros usados do auto.pt (14º alvo, após theparking.eu, AutoTrader.nl,
> autoboerse.de, autocasion.com, ocasionplus, flexicar, aramisauto, trovit, meinauto, quoka, ooyyo,
> autoline e autohero).
> Data: 2026-07-12. Método: reconhecimento estático (`curl` com UA de browser + análise do
> JSON-LD `Vehicle`/`ItemList`, do estado Symfony UX LiveComponent embutido, e do card HTML
> `car_listing_entry`). Todas as afirmações foram confirmadas com probes reais.

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser → **200** em todas as probes.
  Anti-bot **Cloudflare PASSIVO** (`server: cloudflare`, `cf-cache-status: DYNAMIC`; backend
  Symfony + Webpack Encore) — **sem challenge**. HTTP puro + rate-limit/backoff do `lib` chegam.
- **Marketplace PT** (Pixelplan-Digital Web Lda), SSR tradicional (não SPA). **~16.241 carros
  usados** (contador `numberOfItems` do JSON-LD `ItemList`), **20/página → 813 páginas**.
- **Molde quoka/theparking/autocasion** (card HTML + JSON-LD juntos por id). Aqui o **CARD é a
  fonte PRINCIPAL** (id, URL, título, preço, **vendedor**, **distrito**, [combustível/ano/km]) e o
  **JSON-LD `Vehicle` enriquece** (marca/modelo já separados, imagem, condição).
- **Fonte 1 = CARD** `<a data-testid="car_listing_entry" id="item_XXXX">` (20/página). `XXXX` é o
  `referenceNumber` (chave de dedupe/join). Traz: `<h2>` (marca+modelo), `<p>` (variante), preço,
  bloco vendedor+distrito, `<ul>` de 3 itens [combustível, ano, km], imagem.
- **Fonte 2 = JSON-LD.** São 5 blocos `application/ld+json`; interessam dois, **posicionalmente
  alinhados** (20/20):
  - `WebPage.mainEntity` = `OfferCatalog` com 20 `Offer.itemOffered` (`Vehicle`) — traz
    `brand.name`, `model`, `name` (variante), `fuelType`, `vehicleModelDate` (só o **ano** é real),
    `mileageFromOdometer`, preço, `itemCondition` (UsedCondition), `image`. **Sem `url`/`id`.**
  - `ItemList` com 20 `ListItem` {`position`, `url`} — o `url` traz o id (`…-id-XXXX`) e o
    `numberOfItems` (total).
  - **Join:** `ItemList[i]` dá (id, url), `OfferCatalog[i]` dá o Vehicle → mapa **id→Vehicle**; o
    card junta-se pelo seu id. Alinhamento 20/20/20 verificado em várias páginas (p1, p2, marca).
- **⚠️ Particular vs. empresa (per-card, fiável):** o card de um **STAND** traz um
  `<span class="… text-primary line-clamp-1 …">` com o nome; o card de um **PARTICULAR** NÃO traz
  esse span (só o distrito). → `owner_type='empresa'` + `source`=nome do stand, ou
  `owner_type='particular'` + `source='Particular'`. (Na amostra p1–p3: 54 empresa / 6 particular.)
- **Paginação `?page=N`** na rota `/carros-usados`; a última página (813) traz 1 card, as
  seguintes ficam vazias (`page=900` → 0 cards, 200) → paragem limpa por página vazia.
- **`--full` fatia por MARCA** via o **path** `/carros-usados/{slug}` (ex. `.../renault` →
  `numberOfItems` 2.057). Os ~132 slugs vêm das `<option>` do `<select name="search[make]">` da 1ª
  página. Slices alternativos: `--make` e `--district` (path, ex. `.../lisboa` → 2.581).
- **⚠️ Filtros/ordenação por query NÃO funcionam num GET puro.** `?search[make]=…`,
  `?search[ownerType]=…` devolvem **500** (o form é POST/LiveComponent); `?sortBy=…` é **ignorado**
  (mesma ordem). Só o **path** (marca/distrito) + `?page=N` filtram por GET.
- **Recência (proxy, como AutoTrader/autocasion):** existe a opção de ordenação "Data Anúncio"
  (`data-anuncio`), mas por só ser aplicável via AJAX, o watch usa a **ordem default ("Destacados")
  da página 1** como proxy e deteta novos/preço entre ciclos. A captura exaustiva depende do
  re-crawl batch.

## Acesso

- **Host canónico:** `https://www.auto.pt`.
- **robots.txt** (12/07/2026): `User-agent: *` → `Allow: /`, com apenas estes `Disallow`
  (guardados em `autopt/http.mjs`): `/area-pessoal`, `/_components/FavoriteWidget`,
  `/_components/GoogleMapsWidget`, `/_components/GoogleMapsWidgetMultiple`. A rota que usamos
  (`/carros-usados` e `/carros-usados/{marca|distrito}`) **é permitida**. **Sem Crawl-delay** →
  honramos o default do `lib` (1500 ms + jitter). Sitemap: `https://www.auto.pt/sitemap/sitemap.xml`.
- **Anti-bot Cloudflare passivo:** 200 com UA de browser, sem challenge; cookies de sessão
  guardados pelo `lib/http`. Rate-limit + backoff mitigam o risco sob volume.
- Só **PT** (português, `pt-PT`). Moeda **EUR**.

## Fonte 1 — CARD `car_listing_entry` (principal)

Divisão do HTML nos inícios de cada `<a … data-testid="car_listing_entry" id="item_XXXX">`
(mais fiável que a tag de fecho). Mapa:

| Elemento do card | → campo | Exemplo |
|---|---|---|
| `id="item_XXXX"` | `id` (referenceNumber) | `Y9geoi7s` |
| `href="/carros-usados/…-id-XXXX"` | `detail_url` | `.../renault-clio-tce-90-techno-id-Y9geoi7s` |
| `<h2>` | marca+modelo (fallback) | "Renault Clio" |
| `<p class="mt-2 …">` | variante (fallback) | "TCe 90 Techno" |
| `div.bg-primary … €` | `price` | "17 490 €" → 17490 |
| `span.text-primary.line-clamp-1` | `source`/`dealer` (stand) | "Caetano - Porto" |
| `span.text-grey-700.text-sm` (bloco `mt-5 h-5`) | `region` (distrito) | "Porto" |
| `<ul class="mt-auto …">` 3× `<li>` | `fuel`, `year`, `km` | ["Gasolina","2024","37.570 km"] |
| `<img src="https://images.auto.pt/…">` | `image` | .../vehicle_list/….jpg |

`fuel`/`year`/`km` são classificados por padrão (4 dígitos = ano; termina em "km" = km; senão
combustível), não por posição — imune a reordenação.

## Fonte 2 — JSON-LD `Vehicle` (enriquecimento)

| Campo JSON-LD (Vehicle) | → uso |
|---|---|
| `brand.name` | `make` (limpo) |
| `model` | `model` (limpo) |
| `name` | `variant` (título completo) |
| `vehicleModelDate` (4 primeiros díg.) | `year` — **só o ano é real** (data sintética `…-01-01T…`) |
| `mileageFromOdometer.value` | `km` |
| `fuelType` | `fuel` |
| `offers…priceSpecification.price` | fallback de `price` |
| `itemCondition.name` (UsedCondition) | `condition` = "Usado" |
| `image` | `image` |

## Mapeamento → CAMPOS_BASE

| Campo base | Fonte | Nota |
|---|---|---|
| make | JSON-LD `brand.name` (fallback `<h2>` 1º token) | 60/60 |
| model | JSON-LD `model` (fallback resto do `<h2>`) | 60/60 |
| variant | JSON-LD `name` (fallback `<h2>` + `<p>`) | 60/60 |
| year | JSON-LD `vehicleModelDate` (ano) / card | 60/60 |
| km | JSON-LD `mileageFromOdometer` / card | 60/60 |
| fuel | JSON-LD `fuelType` / card `<li>` | 60/60 |
| gearbox, engine, color, doors, category | — | **null** (só no detalhe, não na listagem) |
| price | card / JSON-LD | 60/60 |
| currency | fixo | EUR |
| country | fixo | PORTUGAL |
| region | card (distrito) | 60/60 |
| postalCode | — | null (só distrito na listagem) |
| source | card (nome do stand) ou "Particular" | 60/60 |
| detail_url | card `href` (prefixado com BASE) | 60/60 |
| image | JSON-LD / card | 60/60 |
| collected_at | injetado | 60/60 |

**Extras próprios:** `source_site='auto.pt'`, `id` (referenceNumber), `owner_type`
(`empresa`|`particular`), `dealer` (nome do stand; null se particular), `condition` (Usado/Novo).

## Cobertura / volume

- `/carros-usados` → `numberOfItems` **16.241** carros usados (813 páginas × 20; a última traz 1).
- Marcas (ex.): Renault 2.057, Lisboa (distrito) 2.581. Distritos incluem Açores/Madeira
  (`<select name="search[district]">`, 20 distritos). `ownerType` options: `private`/`dealership`.
- **Nota:** o total geral do site (~75k) inclui motos/comerciais/caravanas noutras rotas; este
  coletor cobre **só carros usados** (`/carros-usados`).

## Verificação (dados reais, 2026-07-12)

- `run-autopt.ts --max-pages 3` → **60 anúncios**, 3 páginas, 4s. Cobertura: make/model/variant/
  year/km/fuel/price/currency/country/region/source/detail_url/image/id/owner_type/condition =
  **60/60**; dealer 54/60 (null nos 6 particulares); gearbox/engine/color/doors/category/postalCode
  = 0/60 (esperado — não estão na listagem). Preço €: min 2.990 · máx 65.750 · média 22.347.
  Vendedor: empresa 54 / particular 6.
- **Dedupe + resume:** 60 linhas = 60 ids únicos; `--resume` continua sem duplicar.
- **`--make renault --max-pages 2`** → 40 anúncios, todos `make=Renault`.
- **`--full`** → descobre 132 slugs de marca.
- **`watch --interval 12 --cycles 2`** → ciclo 1: 20 novos; ciclo 2: 0 novos (estado dedupe);
  eventos em `autopt-events.ndjson`.
- **assertAllowed:** permite `/carros-usados`, `/carros-usados/renault?page=2`,
  `/carros-usados/lisboa`; bloqueia `/area-pessoal`, `/_components/FavoriteWidget`,
  `/_components/GoogleMapsWidget`.

### Exemplo de registo (empresa)

```json
{"make":"Renault","model":"Clio","variant":"Renault Clio TCe 90 Techno","year":2024,"km":37570,
 "fuel":"Gasolina","gearbox":null,"engine":null,"color":null,"doors":null,"category":null,
 "price":17490,"currency":"EUR","country":"PORTUGAL","region":"Porto","postalCode":null,
 "source":"Caetano - Porto","detail_url":"https://www.auto.pt/carros-usados/renault-clio-tce-90-techno-id-Y9geoi7s",
 "image":"https://images.auto.pt/vehicle_detail_main/0623edc15764696034fed062705299c7bd4e1418.jpg",
 "collected_at":"2026-07-12T22:59:01.915Z","source_site":"auto.pt","id":"Y9geoi7s",
 "owner_type":"empresa","dealer":"Caetano - Porto","condition":"Usado"}
```

## Limitações / notas

- **gearbox/engine/color/doors/category/postalCode** não estão na listagem (só na página de
  detalhe). Ficam `null`. Um passo futuro seria enriquecer a partir do detalhe (custo: +1 pedido
  por anúncio).
- **Recência é proxy** (ordem "Destacados"): sem sort por data via GET. O batch periódico garante
  a cobertura; o watch apanha a maioria dos novos entre ciclos.
- **`year` sintético:** `vehicleModelDate` traz sempre `…-01-01T…`; só o ano é fiável (usamo-lo).
- O join card↔JSON-LD é por **id** (via `ItemList`), não por índice cru — robusto se algum dia
  aparecer um card promovido fora do `OfferCatalog`.
