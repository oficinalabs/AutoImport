# coches.trovit.es — investigação técnica (spec do coletor)

> Como recolher dados do Trovit (agregador de classificados do grupo Lifull Connect). 8º alvo,
> após theparking.eu, AutoTrader.nl, autoboerse.de, autocasion.com, ocasionplus, flexicar, aramisauto.
> País/secção escolhida: **coches.trovit.es** (automóveis, Espanha). Data: 2026-07-11.
> Método: reconhecimento estático (`curl` + UA de browser; análise do JSON-LD e do card HTML).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200 direto. **Sem anti-bot** (sem
  Cloudflare/DataDome/Incapsula; sem challenge em nenhuma probe). Cookies de sessão (uqTrovit/cTrovit)
  guardados pelo `lib/http`.
- **Molde theparking/autocasion** (JSON-LD estruturado + extras do card, juntos por ID).
- **Fonte principal = 1 bloco `application/ld+json` por página = `SearchResultsPage`** com um array
  `about` de **25 `Car`** (make/model/description/year/km/price/doors/image).
- **Faltam ao JSON-LD:** `fuel`/`gearbox`/potência (extraídos por regex da `description`+`name`+título
  do card) e `detail_url`/`região`/recência (vêm do **card HTML**). Junção Car↔card pelo **id** do
  anúncio (no path da imagem `//img-es-2.trovit.com/{id}/{id}.1_11.jpg` ↔ `data-id` do card): bateu
  **25/25** nas probes.
- **AGREGADOR com origem escondida:** o link de cada anúncio aponta para um redirecionador de clique
  `rd.clk.thribee.com` (robots `Disallow: /`) que esconde o site de origem. Como **não** o resolvemos
  (respeitamos o robots do thribee), `source` (site de origem) fica **null**; o extra `source_site`
  documenta a plataforma (`coches.trovit.es`). **Chave de dedupe = `id`** (o `data-id`, estável).
- **Rota `/coches/{slug}`; paginação no PATH** (`/coches/audi/2`). **NÃO existe página "todos os
  coches"** (`/coches` dá 404) → `--full` fatia por **marca** (lista fixa `MARCAS`).
- **✅ Recência real:** há sort por data — `?order_by=source_date` ("Fecha (más recientes)"). Cada
  card traz "Hace 21 h 21 minutos" → `updated_ago_min`. O watch usa ambos.
- **Volume:** por marca, ex. Audi **26.652**, Citroën 21.983, Toyota 17.357, Nissan 15.073 (lidos do
  próprio HTML). Catálogo ES na ordem das centenas de milhar somando marcas.

## Acesso

- **Host canónico:** `https://coches.trovit.es`. Estrutura pronta a estender a outros países
  (`voiture.trovit.fr`, `auto.trovit.it`, …): mesmo motor/robots; trocar `BASE` + segmento da rota
  (`coches`→`voiture`/`auto`) + língua.
- **Anti-bot:** nenhum. 200 com UA de browser em todas as probes. Sem `Crawl-delay` no robots → usamos
  o rate-limit/backoff default do `lib/http`.
- **robots.txt** (idêntico em todos os países). Disallow para `*`: `/redirect/`,
  `/scripts/redirect.php/`, `/index.php/` (exceto alguns `cod.get_*`), `/rd/`, `/rss/`, `/listing/`,
  `/details/`, `/project/`, `/publisher/`, `/afc/`, `/notifications`. A **listagem que usamos
  (`/coches/{slug}`) é permitida** — nunca tocamos os disallow (guarda em `trovit/http.mjs` +
  `lib/http.assertAllowed`). O endpoint de pesquisa livre `/index.php/cod.search_cars` é **disallow**
  → por isso usamos só as facetas SEO `/coches/{slug}`.
- **thribee (redirecionador de clique):** `rd.clk.thribee.com/robots.txt` = `Disallow: /` → **não
  resolvemos** os redirects; consequência assumida: `source` = null.

## Fonte 1 — JSON-LD `SearchResultsPage` → `about[]` (`Car`)

Um bloco `<script type="application/ld+json">` por página. `about` = **array de 25 `Car`**. Mapa
(→ schema em `tools/collector/trovit/schema.mjs`):

| Campo JSON-LD | → schema | Exemplo |
|---|---|---|
| `brand.name` | make | Audi |
| `model` | model | A1 |
| `description` (trim antes de "de segunda mano") ou `name`/título do card | variant | Audi a1 1.0 TFSI 95CV Advanced |
| `vehicleModelDate` | year | 2023 |
| `mileageFromOdometer.value` | km | 57854 |
| `description`/`name`/título (regex) | **fuel** | Gasolina |
| `description`/`name`/título (regex) | **gearbox** | Manual |
| `description`/`name`/título (regex `\d+CV`) | **power_cv** | 95 |
| `numberOfDoors` | doors | 5 |
| `offers.priceSpecification.price` / `priceCurrency` | price / currency | 18700 / EUR |
| `image` (protocolo-relativa → https) | image | https://img-es-2.trovit.com/…jpg |

- **Sem `color`, sem cilindrada, sem carroçaria estruturada** → `engine`/`color`/`category` = null.
- `fuel`/`gearbox`/`power_cv` **não têm campo estruturado**: aparecem em sítios diferentes conforme a
  faceta (páginas de marca metem-nos na `description`; páginas de cidade metem o trim no `name` e
  marketing na `description`) → procuramos num **palheiro combinado** `description · name · título`.
- **GOTCHA (como no theparking/autocasion):** sanitizamos caracteres de controlo (0x00–0x1f) antes do
  `JSON.parse`.

## Fonte 2 — card HTML (`detail_url`, região, recência)

Cada card é um `<div class="item js-item … item-cars-snippet" data-id="{id}">`. Junta-se ao JSON-LD
pelo `id`.

- **`<a rel="nofollow" href="https://rd.clk.thribee.com/id.{id}/…">`** → **`detail_url`** (link de
  saída para a origem; nunca o pedimos). O `id.{id}` é estável; o resto (tracking/assinatura) muda por
  sessão.
- **`<h5 class="item-address">`** → **`region`** (ex. "Provincia de Alicante", "Madrid, Comunidad de
  Madrid").
- **`<div class="item-updated-date">Hace 21 h 21 minutos</div>`** → **`updated_text`** +
  **`updated_ago_min`** (parse de semanas/dias/horas/minutos → minutos). Sinal de frescura.
- **`<div class="new">`** → flag **`is_new`**. **`<h4 class="item-title">`** → **`title`** (título não
  truncado; usado como fonte de variante/fuel).

## Paginação e cobertura (`--full`)

- **Paginação no PATH:** `/coches/{slug}/{N}` (confirmado: p1 vs p2 = **0 ids em comum**, 25/pág).
  Combina com o sort: `/coches/{slug}/{N}?order_by=source_date`.
- **NÃO há página "todos os coches"** (`/coches` → 404; `/coches/1` → 301 → `/coches` → 404). O site só
  expõe **facetas SEO** `/coches/{slug}`, onde slug pode ser marca (`audi`), cidade (`madrid`), região
  (`comunitat-valenciana`), modelo (`audi-a3`), combustível (`audi-gas`), carroçaria (`audi-cabrio`),
  vendedor (`audi-particular`)…
- **`--full` fatia por MARCA** — lista fixa `MARCAS` (~45 slugs canónicos) em `parse.mjs`. A taxonomia
  de marcas do Trovit é fixa; slugs raros dão 404/redirect e são saltados. `citroen`→ redirige p/
  `citroën` (o `lib` segue o 301); **`mercedes`** é o slug (não `mercedes-benz`, que dá 404).
- **`DEFAULT_SLUG = madrid`** (sem `--full`/`--brand`): a maior cidade, mistura todas as marcas → boa
  amostra e bom feed de recência. `--brand <slug>` aceita **qualquer faceta**, não só marca.
- Marcas densas (Audi ~26k) saturam o cap de paginação; o corte fino seguinte seria marca+modelo/região
  (o site expõe esses slugs) — não implementado (ver README).

## ✅ Recência (sort por data)

`<select name="order_by">` inclui **`source_date` ("Fecha — más recientes")**. `/coches/{slug}?order_by=
source_date` traz os mais frescos primeiro (no topo, "Hace 4 h" na Audi nacional; ~9 h na cidade de
Madrid). O watch usa esse sort e loga o **mínimo `updated_ago_min`** por ciclo como sinal de frescura.
Deteção de novos fiável (ao contrário do AutoTrader/autocasion, que não têm sort por data).

## Cobertura de campos (medida, dados reais)

- **Slug de cidade `madrid`** (amostra 118): make/model/variant/price/currency/region/detail_url/image/
  id/updated 118/118; year 63/71\* km 65/71\* doors 47/71\* fuel 29/71\* power_cv 27/71\* gearbox 6/71\*.
- **Slug de marca `audi`** (amostra 50): year/km 50/50; **fuel 38/50, gearbox 17/50, power_cv 19/50** —
  bem mais rico. As páginas de MARCA descrevem os anúncios de forma estruturada; as de CIDADE trazem
  texto de marketing → menos `fuel`/`gearbox` explícitos. (\* percentagens sobre a amostra medida.)

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-trovit.ts --max-pages 3` → **71 anúncios** (madrid) em 5 s, com make/model/variant/year/km/
   price/region/detail_url/image/id/updated preenchidos.
2. `--resume --max-pages 5` → retomou em 71, estendeu para **118** sem duplicar (118 ids únicos).
3. `--brand audi --max-pages 2` → **50 anúncios, todos Audi** (não-Audi: 0) → o fatiamento filtra.
4. `watch-trovit.ts --interval 12 --cycles 2` → ciclo 1: **25 novos**; ciclo 2: **0 novos** (dedupe);
   "mais fresco 535 min" (sort por data ativo).
5. Guarda robots: pedidos a `/rd/`, `/index.php/cod.search_cars`, `/details/`, `/listing/`, `/publisher/`,
   `/redirect/` são **bloqueados**; `/coches/audi`, `/coches/madrid/2`, `?order_by=source_date` passam.

## Registo-exemplo (real)

```json
{
  "make": "Renault", "model": "Zoe",
  "variant": "Renault ZOE Life 40 R90 Flexi -18 Eléctrico en Flexicar Green Madrid",
  "year": 2018, "km": 99580, "fuel": "Eléctrico", "gearbox": null, "engine": null,
  "color": null, "doors": 5, "category": null, "price": 8990, "currency": "EUR",
  "country": "SPAIN", "region": "Madrid, Comunidad de Madrid", "postalCode": null,
  "source": null,
  "detail_url": "https://rd.clk.thribee.com/id.MK1KD91F1H16/…/sign.…/",
  "image": "https://img-es-2.trovit.com/MK1KD91F1H16/MK1KD91F1H16.1_11.jpg",
  "collected_at": "2026-07-11T19:29:50.820Z",
  "source_site": "coches.trovit.es", "id": "MK1KD91F1H16",
  "power_cv": null, "updated_text": "Hace 20 h 45 minutos", "updated_ago_min": 1245, "is_new": true,
  "title": "Renault ZOE Life 40 R90 Flexi -18 Eléctrico en Flexicar Green Madrid"
}
```

## Limitações assumidas

- **`source` (site de origem) = null:** o Trovit esconde a origem atrás de um redirecionador com robots
  `Disallow: /`; resolvê-lo violaria esse robots. Documentado; `source_site` = plataforma.
- **`fuel`/`gearbox` incompletos em facetas de cidade** (texto de marketing). As facetas de marca
  (modo `--full`) são bem mais ricas.
- **Sem "todos os coches":** a cobertura faz-se por marca; marcas grandes saturam o cap de paginação
  (corte fino marca+modelo/região por implementar).

## Ficheiros

- Coletor: `tools/collector/trovit/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-trovit.mjs`, `tools/collector/watch-trovit.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
