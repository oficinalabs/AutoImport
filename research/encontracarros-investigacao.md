# encontracarros.pt — investigação técnica (spec do coletor)

> Como recolher dados do **encontracarros.pt**, o meta-motor/agregador **português** de carros usados
> (compara os principais sites PT: standvirtual, olx.pt, custojusto.pt, auto.sapo.pt, auto.pt +
> centenas de stands próprios). 19º alvo.
> Data: 2026-07-13. Método: reconhecimento estático (`curl` + análise do JSON-LD, do payload RSC e do
> sitemap.xml).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser → 200 em todas as probes. Stack
  **Next.js App Router** (`data-precedence="next"`, styled-components, payload RSC `self.__next_f`),
  **sem challenge anti-bot**.
- **⚠️ A listagem `/pesquisa` é CLIENT-SIDE.** O HTML inicial de `/pesquisa` NÃO traz os cards dos
  anúncios (só o JSON-LD `SearchResultsPage` e o formulário de filtros); os resultados são obtidos
  por fetch no cliente. **Inútil por HTTP puro.** Não há `__NEXT_DATA__` com resultados.
- **Fonte = `sitemap.xml` (enumeração) + páginas de detalhe `/anuncio/…` (dados).** É o **molde
  theparking** (agregador → `source` = site de origem) adaptado: em vez de N anúncios por página de
  listagem, há **1 anúncio por página de detalhe** (1 request/anúncio).
- **Página de detalhe é SSR e riquíssima**, com DUAS fontes que combinamos:
  1. **JSON-LD `schema.org/Vehicle`** (JSON limpo) — marca, modelo, ano, km, caixa, portas, lugares,
     carroçaria (`bodyType`), combustível, **potência** (`enginePower` em cv), imagens, preço, moeda,
     **localidade** (distrito) e país (PT).
  2. **Objeto `carListing`** no payload RSC (`self.__next_f`) — o que é PRÓPRIO do agregador: o
     **SITE DE ORIGEM** (`advertiser`), o **URL EXTERNO ORIGINAL** (`url`), o **nome do vendedor/stand**
     (`dealership_name`), a cor, a condição (USED/NEW) e nacional/importado (`source`).
- **`source` = site/stand de origem** (olx.pt, standvirtual.com, custojusto.pt, auto.sapo.pt, auto.pt,
  carmine.pt, santogal.pt, …). `source_site='encontracarros.pt'`; `country='PORTUGAL'`.
- **⭐ Recência REAL:** o `sitemap.xml` traz `<lastmod>` por anúncio → o watch faz poll dos que mudaram
  desde a última marca-de-água (watermark). Não há proxy de ordem-default como noutros sites.
- **Volume:** o sitemap expõe **50.000** anúncios (o teto do protocolo, sem sitemap-index → é o
  universo alcançável, os **mais recentes**). O site anuncia "**100.000+ anúncios**" e "**800+ stands**"
  → recolhemos ~metade (a mais recente/viva). O "**1,67M**" reportado é **global/inflacionado** — não
  corresponde ao catálogo PT real.

## Acesso

- **Host canónico:** `https://www.encontracarros.pt`.
- **robots.txt** (muito tolerante):
  ```
  User-Agent: *
  Allow: /
  Disallow: /link
  Sitemap: https://encontracarros.pt/sitemap.xml
  ```
  Só proíbe **`/link`** — o redirecionador para o site de origem (`/link?anuncio=…`). **Nunca lhe
  tocamos:** o URL externo original já vem no HTML do detalhe (campo `carListing.url`). Tudo o resto
  (`sitemap.xml`, `/anuncio/…`, `/pesquisa`) é permitido. Sem `Crawl-delay` → rate-limit default do
  `lib/http` (1500ms + jitter + backoff). Probe ao `assertAllowed` confirma: `/anuncio/…`,
  `/sitemap.xml`, `/pesquisa` PERMITIDOS; `/link?…` BLOQUEADO.
- **Anti-bot:** nenhum ativo. Next.js/Vercel-style; 200 com UA de browser em todas as probes.
- **Sem necessidade de tocar em hosts de terceiros:** o `source_url` (olx/standvirtual/custojusto/…) é
  apenas **guardado**, nunca requisitado → não há que verificar o robots desses hosts.

## Estrutura da página de detalhe (`/anuncio/{slug}-{id6}`)

- **id do anúncio** = os **6 chars alfanuméricos** no fim do slug (`…-usado-porto-jbhq50` → `jbhq50`).
  Chave global de dedupe/estado. Estável entre recolhas.
- **JSON-LD `Vehicle`** (1 bloco `application/ld+json`). Exemplo real (Porsche Cayenne):
  `brand.name=Porsche`, `model=Cayenne`, `dateVehicleFirstRegistered=2011-…` (→ ano 2011),
  `mileageFromOdometer.value=169000`, `vehicleTransmission=Automática`, `bodyType=SUV/TT`,
  `fuelType=Diesel`, `vehicleEngine.enginePower={value:250,unitText:"cv"}`, `numberOfDoors=4`,
  `vehicleSeatingCapacity=5`, `offers.price=28990`, `offers.priceCurrency=EUR`,
  `offers.availableAtOrFrom.address={addressLocality:"Porto", addressCountry:"PT"}`.
  - ⚠️ O `name` do JSON-LD é o **título da PÁGINA** ("… Usado (2011) Porto, Portugal — Preço…"), não
    uma variante limpa → para `variant` usamos o `carListing.title` (título do anúncio) e caímos em
    `make+model`.
  - ⚠️ Os campos de data (`vehicleModelDate`/`productionDate`/`dateVehicleFirstRegistered`) são ISO
    com dia/hora sintéticos — só o **ano** é real (4 primeiros dígitos).
- **Objeto `carListing`** no RSC. Reconstruímos o flight juntando os `self.__next_f.push([1,"…"])` e
  des-escapando com `JSON.parse('"'+…+'"')`; depois isolamos o `carListing` por **brace-matching**
  (⚠️ há ~12 anúncios SEMELHANTES na mesma página — secção de comparação de preço — cada um com o seu
  `advertiser`/`dealership_name`; o `carListing` é o único que é ESTE anúncio). Campos usados:
  `advertiser` (site de origem), `url` (URL externo original), `dealership_name` (stand/vendedor),
  `condition` (USED/NEW), `source` (NATIONAL/IMPORTED), `title`.
  - Cor: nem sempre no `carListing`/JSON-LD → fallback à 1ª ocorrência de `"color"` no flight (é a do
    carro principal — verificado em amostra).
- **Marcador SSR** "Anúncio original publicado em `<site>`" — confirmação redundante da origem
  (fallback se o `advertiser` faltar).

## Enumeração (`sitemap.xml`)

- Um único ficheiro, **50.000** `<url>`, todos `/anuncio/…`, cada um com `<lastmod>` (ISO). Sem
  `sitemapindex`; `sitemap-index.xml`/`sitemap-1.xml`/… dão 404.
- A ordem do ficheiro **não** é cronológica → **ordenamos por `lastmod` DESC** (mais recentes
  primeiro), para que a amostra e o watch vejam logo os anúncios frescos.
- Slices derivados do slug **sem pedidos extra**: `--brand` (prefixo `/anuncio/{marca}-`, apanha
  marcas de várias palavras via `startsWith("{marca}-")`), `--district` (token antes do id), `--since`
  (filtro por `lastmod`).

## Mapeamento fonte → CAMPOS_BASE

| Campo | Origem |
|---|---|
| make | `Vehicle.brand.name` |
| model | `Vehicle.model` |
| variant | `carListing.title` (fallback `make+model`) |
| year | `dateVehicleFirstRegistered`/`productionDate` (ano ISO) |
| km | `mileageFromOdometer.value` |
| fuel | `Vehicle.fuelType` |
| gearbox | `Vehicle.vehicleTransmission` |
| engine | `vehicleEngine.enginePower.value + unitText` ("250 cv") |
| color | `carListing.color` → JSON-LD `color` → 1ª `"color"` do flight |
| doors | `Vehicle.numberOfDoors` |
| category | `Vehicle.bodyType` |
| price / currency | `offers.price` / `offers.priceCurrency` (EUR) |
| country | `PORTUGAL` (addressCountry=PT sempre) |
| region | `offers.availableAtOrFrom.address.addressLocality` (distrito) |
| postalCode | — (não exposto) |
| **source** | **`carListing.advertiser`** (site/stand de origem) → marcador SSR |
| detail_url | `Vehicle.url` |
| image | `Vehicle.image[0]` |
| collected_at | injetado |

**Extras:** `source_site='encontracarros.pt'`, `id` (6 chars, chave de dedupe), `source_url` (URL do
anúncio ORIGINAL no site de origem — permite **dedupe cross-coletor** contra standvirtual/olxpt/
custojusto/autopt/autosapo), `dealer` (nome do vendedor/stand), `condition` (Usado/Novo), `national`
(Nacional/Importado, raro), `seats`, `listed_at` (lastmod do sitemap).

**Chave de dedupe:** `id` (6 chars). Global no crawl (checkpoint `seen`) e no watch (estado id→linha).

## Verificação (dados reais, 2026-07-13)

- **`run --max-pages 3`** → **90 anúncios** em 178s. Cobertura por campo: make/model/variant/year/km/
  fuel/gearbox/color/price/currency/country/source/detail_url/image/source_url/condition/id **100%**;
  engine **98%**, category **98%**, dealer **95%**, region **93%**, doors **72%**, seats **71%**;
  `national` **4%** (extra raro). Preço €2.990–69.500 (média 17.819). **Sites de origem:**
  standvirtual.com:35, custojusto.pt:24, auto.sapo.pt:17, auto.pt:5, carmine.pt:5, olx.pt:2,
  santogal.pt:2 — confirma agregador multi-site (incl. domínios de stands próprios).
- **Dedupe + `--resume`:** 90/90 ids únicos; `--resume --max-pages 4` continuou do cursor 90→120 sem
  duplicar (mesmo NDJSON, stats acumuladas).
- **Fatia `--brand bmw --max-pages 1`:** 30 anúncios, todos `make=BMW`.
- **`watch --interval 12 --cycles 2`:** ciclo 1 = 30 novos (watermark fixada no `lastmod` máximo);
  ciclo 2 = 0 alvos (nada mais recente que a watermark → 0 fetches em 2s). Recência via `lastmod` a
  funcionar; eventos `new` emitidos via `lib/sink`.
- **Probe `assertAllowed`:** `/anuncio/…`, `/sitemap.xml`, `/pesquisa` PERMITIDOS; `/link?…` BLOQUEADO.

### Registo exemplo (real)

```json
{
 "make": "Opel", "model": "Corsa", "variant": "Opel Corsa 1.2 T GS",
 "year": 2025, "km": 16024, "fuel": "Gasolina", "gearbox": "Manual", "engine": "100 cv",
 "color": "Branco", "doors": 5, "category": "Citadino", "price": 17790, "currency": "EUR",
 "country": "PORTUGAL", "region": "Porto", "postalCode": null,
 "source": "standvirtual.com",
 "detail_url": "https://encontracarros.pt/anuncio/opel-corsa-1-2-t-gs-branco-usado-porto-cawgt0",
 "image": "https://ireland.apollo.olxcdn.com/v1/files/…/image",
 "collected_at": "2026-07-13T09:06:03.549Z",
 "source_site": "encontracarros.pt", "id": "cawgt0",
 "source_url": "https://www.standvirtual.com/carros/anuncio/opel-corsa-ver-1-2-t-gs-ID8Q0Ezp.html",
 "dealer": "filintomota.pt Paredes", "condition": "Usado", "national": null,
 "seats": 5, "listed_at": "2026-07-12T20:38:59.962Z"
}
```

## Ficheiros

`tools/collector/encontracarros/{http,sitemap,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-encontracarros.mjs` + `tools/collector/watch-encontracarros.mjs`. Reutiliza
`tools/collector/lib/{http,normalize,sink}.mjs` sem alterações. Saída `encontracarros-*` em
`tools/collector/out/` (gitignored). Pronto exceto o upsert na DB (isolado em `lib/sink.mjs`).
