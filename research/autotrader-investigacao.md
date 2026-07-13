# AutoTrader.nl — investigação técnica (spec do coletor)

> Como recolher dados do AutoTrader.nl (2º alvo, após o theparking.eu). Data: 2026-07-10.
> Método: reconhecimento estático (`curl` + análise do `__NEXT_DATA__`).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Sem anti-bot ativo → rápido.
- **Fonte = `__NEXT_DATA__` (SSR), NÃO a API interna.** A app é Next.js (stack Scout24) e embute
  `props.pageProps.listings[]` — muito mais rico que o JSON-LD. A API interna está sob `/api/`
  (**robots-disallowed**) e é desnecessária.
- **20 anúncios/página**, paginação `?page=N`. Cap de **200 páginas**.
- **~233 mil anúncios NL.** Para cobertura total, fatiar por **faixa de preço** (params
  `pricefrom`/`priceto`) — o `--full` faz isto.

## Acesso

- **Sem anti-bot:** nginx + CloudFront, cookie Scout24 `as24Visitor`. 200 com UA de browser.
- **robots.txt tolerante:** `Allow: /`; bloqueia `/api/`, `/private-feedback/`, `/transformCookie`
  e páginas de conta/comparação. **Não** bloqueia ClaudeBot (ao contrário do autoscout24.nl).
- Só **NL** (`cy=NL`; é o domínio .nl). Outros países = família AutoScout24 (mesma stack, futuro).

## Dados por anúncio (`__NEXT_DATA__.props.pageProps.listings[]`)

Página: `https://www.autotrader.nl/auto/occasions?page=N`. `pageProps` traz `numberOfResults`
(233.171), `numberOfPages` (200), `listings[]`. Cada listing (mapa → schema em
`tools/collector/autotrader/schema.mjs`):

| Campo listing | → schema | Exemplo |
|---|---|---|
| `vehicle.make` | make | BMW |
| `vehicle.modelGroup` | model | 3 Series |
| `vehicle.motorTypeName` | variant | 325i |
| `vehicle.variant` | **category** (carroçaria) | Sedan |
| `vehicleDetails[calendar]` | year / first_registration | 03/2009 → 2009 |
| `vehicle.mileageInKm` | km | 217828 |
| `vehicle.fuel` / `transmission` | fuel / gearbox | Benzine / Automatisch |
| `vehicle.engineDisplacementInCCM` | engine | 2.996 cm³ |
| `vehicleDetails[speedometer]` | power_kw | 160 kW |
| `wltpValues[]` | co2 | 170 g/km |
| `price.priceRaw` | price | 1975 |
| `location.{countryCode,zip,city,street}` | country/postalCode/city/street | NL / 8629 EG / … |
| `seller.companyName` | **source** (dealer) | Hartog Automotive B.V. |
| `url` | detail_url | /auto/voertuig/…/<uuid> |
| `images[]` | image (1º) + images (nº) | … |
| `id` | id (UUID, chave de dedupe) | f8f48fa6-… |

`color`/`doors`/`region` não são expostos ao nível da listagem → ficam null.

## Paginação, ordenação e cobertura

- **Paginação:** `?page=N` (confirmado). Cap **200 páginas** (~4.000 de 233 mil).
- **Cobertura total:** fatiar por **faixa de preço** (`pricefrom`/`priceto`) — cada faixa é uma
  query paginável. Faixas densas do meio podem ainda saturar → combinar com marca (`mmvmk0`).
  Também há `fregfrom`/`fregto` (ano de 1ª registo).
- **Filtro por marca:** `?mmvmk0=<makeId>` (ex. BMW=13 → 18.376 resultados). IDs Scout24.
- **⚠️ Ordenação por data de publicação: NÃO existe.** O `taxonomy.sortingKeys` só tem
  price/year/mileage/power/make. `sort=age&desc=1` = 1ª-registo mais recente. Usamos isso como
  **proxy de recência** no watch; captura exaustiva de novos depende do re-crawl batch.

## Coletor (mesma lógica do theparking)

- Batch: `tools/collector/run-autotrader.mjs` (`--max-pages`, `--make`, `--full`, `--resume`).
- Contínuo (1 min): `tools/collector/watch-autotrader.mjs` (novos + mudanças de preço).
- Módulos: `autotrader/{http,parse,schema,crawl,watch}.mjs` sobre `lib/{http,normalize,sink}.mjs`.
- Pronto exceto o envio para a DB (isolado em `lib/sink.mjs`).

**Verificado 2026-07-10:** amostra 3 páginas = 56 anúncios/5s, ~todos os campos preenchidos
(preço, marca/modelo, ano, km, combustível, cidade, dealer, potência kW, CO2); watch com dedup
OK; resume OK; guarda robots bloqueia `/api/`.

## Changelog

- **2026-07-10** — Investigação + coletor construído e verificado.
