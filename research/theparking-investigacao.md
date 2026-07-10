# theparking.eu — investigação técnica (spec para o scraper)

> Investigação a fundo de como o site funciona, para construir um scraper **rápido** que recolha o **máximo de dados** por anúncio. Data: 2026-07-10. Método: reconhecimento estático (`curl`) + captura dinâmica de rede (Chrome real, Playwright).

## TL;DR — como vamos scrapar

- **HTTP puro (sem browser).** `curl` com UA de browser passa o Cloudflare (200). Não é preciso Playwright para recolher → **rápido**.
- **Paginação por GET simples:** `/used-cars/{path}/{N}.html`, **27 anúncios/página**.
- **Dados já estruturados na página:** 27 blocos **JSON-LD `schema.org/Vehicle`** por página — não é preciso abrir cada anúncio para ter preço/marca/modelo/ano/km/combustível/**país/CP**.
- **Fonte original por anúncio** (gocar.be, autoscout24.be, autohero.com…) extraível do card — incl. sites que nos **bloqueiam diretamente** mas aqui aparecem agregados.
- **API interna** (`POST /index.php`) devolve fragmentos HTML, **sem vantagem** → ignorar; usar as páginas GET.

---

## 1. Plataforma e acesso

- Mesma rede **LeParking / TheParking-cars (ads4all.fr)** do OParking — confirmado pela CSP (`pro.oparking.pt`, `pro.leparking.be`…) e pelo mesmo controlador JS `/jsV297/index_twig.js`. **Reutilizamos o coletor do OParking quase inteiro.**
- **Cloudflare passivo:** `curl` com UA de browser → `HTTP 200`. Cookies de sessão: `PHPSESSID` + `PKG` (manter entre pedidos).
- **robots.txt:** `Disallow: /tools/ /extlink/ /tag/`; bane vários bots SEO por nome (AhrefsBot, SemrushBot, trovitbot, dotbot…) mas **não** um UA normal. Páginas de listagem/detalhe **permitidas**.
- **Rate-limit intermitente:** durante pedidos rápidos em sequência, uma página devolveu 0 anúncios (200 mas vazia). → o scraper precisa de **ritmo controlado + retry** de páginas vazias.

## 2. Taxonomia de URLs (segmentação) — GET, 27/página

Todas devolvem 27 anúncios com JSON-LD; combináveis:

| Padrão | Exemplo | Uso |
|---|---|---|
| País | `/used-cars/belgium.html` | todo o stock de um país |
| Marca | `/used-cars/bmw.html` | por marca (multi-país) |
| Marca-modelo | `/used-cars/bmw-serie-3.html` | por modelo |
| País + marca | `/used-cars/belgium/bmw.html` **ou** `/used-cars/bmw/belgium.html` | segmentar |
| **Paginação** | `/used-cars/{path}/{N}.html` (ex. `/used-cars/belgium/bmw/2.html`) | página N |
| Detalhe | `/used-cars-detail/{marca-modelo}/{variante}/{ID}.html` | anúncio individual |

Países vistos: `belgium`, `germany`, … (slug em inglês). Nota: `?page=N` é **ignorado** (devolve pág. 1) — usar a forma em path `/{N}.html`.

## 3. Volume e paginação

- **Total exposto no HTML:** `nb_results` — ex. **Bélgica = 201.102** anúncios. Ler para saber volume e planear.
- **27/página**, paginação **muito profunda** (pág. 400 ainda devolve resultados).
- **Estratégia de cobertura máxima:** como a paginação de um país sozinho pode ter cap prático e repetição, **fatiar por país × marca/modelo** (seed do sitemap, ver §7) rende cobertura muito maior e queries mais estáveis.

## 4. Modelo de dados — JSON-LD `Vehicle` (a fonte principal)

27 `<script type="application/ld+json">` `Vehicle` por página. **Gotcha:** têm quebras de linha/tabs **literais dentro das strings** (`name`, `description`) → `JSON.parse` falha; sanitizar com `replace(/[\n\r\t]+/g,' ')` antes (já resolvido no coletor OParking).

Campos por anúncio:

| Campo JSON-LD | Mapeia para | Exemplo |
|---|---|---|
| `brand` | make | `VOLVO` |
| `model` | model | `V60` |
| `name` | variant (título completo) | `VOLVO V60 T6 2.0 253 R DESIGN 4WD` |
| `productionDate` | year | `2021` |
| `mileageFromOdometer.value` (+`unitCode`) | km | `121985` KM |
| `fuelType` | fuel | `Hybrid` |
| `vehicleTransmission` | gearbox | `Automatic` |
| `vehicleEngine.name` | engine | `2.0 Hybrid` |
| `color` | color | `RED` |
| `numberOfDoors` | doors | `5 Doors` |
| `description` | (texto estruturado: Year/Kilometer/Fuel/Color/Transmission/Doors/**Category** ex. `WAGON`) | — |
| `offers.price` (+`priceCurrency`) | price | `25799` EUR |
| `offers.url` | detail_url | `…/used-cars-detail/…/ZWSDSBO4.html` |
| `offers.availableAtOrFrom.address.addressCountry.name` | **country** | `BELGIUM` |
| `…address.addressRegion` | region | `BRUXELLES-CAPITALE` |
| `…address.postalCode` | postalCode | `1000` |
| `image` | image (1 principal) | `cloud.leparking.fr/…jpg` |

## 5. Atribuição de fonte (por card)

O card `<li class="li-result">` (27/página, alinhados com os JSON-LD) contém a **fonte original** do anúncio + o ID da imagem. Fontes vistas na Bélgica: `gocar.be`, `autoscout24.be`, `autohero.com`, `2ememain.be`, `vroom.be`. **Valioso:** o `gocar.be` bloqueia-nos diretamente (Cloudflare 403) mas aparece aqui agregado → o theparking.eu dá-nos stock de fontes que de outra forma não alcançávamos.

## 6. Página de detalhe (dados extra — opcional)

`/used-cars-detail/…` (~105KB) tem 1 JSON-LD `Vehicle` + `BreadcrumbList`, uma **galeria de fotos**, botão **"Contact the seller"** e **"See the listing"** (link para o anúncio original). O link de saída passa por `tracker.LeadLink`/`logLead` → `/extlink/` (**robots-disallowed** → não usar). Para comparação de preços **não é preciso** abrir o detalhe (a listagem já tem tudo); só compensa se quisermos + fotos/vendedor (custo 27× em pedidos).

## 7. Enumeração (seed para cobertura total)

- `sitemap.xml`: **13.806** URLs `/models/{marca[-modelo]}.html` + páginas de marca + core. É o seed para varrer todas as marcas/modelos.
- Combinar com a lista de países → gerar queries `{país}/{marca-modelo}` para máxima cobertura.

## 8. API interna (investigada — não usar)

- `POST /index.php` com `ajax={"tab_id","cur_page","cur_trie","query","critere":{},"sliders":{},"req_num","orig_page"}` → `application/json` cujos valores são **fragmentos HTML** por selector CSS (`#hits`, `#results`…). Mesma mecânica do OParking; **não dá dados mais limpos** que as páginas GET. `critere`/`sliders` são os filtros (marca/preço/ano/km) — mas como os filtros também existem em **path** (§2), não precisamos do ajax.
- `POST /user.php` (`detect_js`) — ruído.

## 9. Design recomendado do scraper (rápido + máximo de dados)

1. **HTTP puro** (fetch/undici), UA de browser, manter `PHPSESSID`/`PKG`. Sem browser → rápido e barato.
2. Para cada query (país e/ou marca-modelo): GET `/used-cars/{path}/{N}.html`, N=1..até página vazia.
3. **Parse:** extrair os 27 JSON-LD `Vehicle` (sanitizar control chars) + **fonte** do card correspondente. Mapear para o **schema-alvo** (`make, model, variant, year, km, fuel, gearbox, power, color, doors, category, price, currency, country, region, postalCode, source, detail_url, image`).
4. **Cobertura:** fatiar por país × marca/modelo (seed do sitemap) para maximizar; ler `nb_results` para planear.
5. **Robustez:** ritmo controlado + retry de páginas vazias (rate-limit intermitente); dedupe por `detail_url`/ID; respeitar robots (nunca `/extlink/`, `/tools/`, `/tag/`).
6. **Opcional:** passagem de detalhe só se quisermos galeria/vendedor.

## Próximo passo

Construir `tools/collector/theparking.mjs` a partir do coletor OParking (mesma plataforma) — HTTP puro, parse JSON-LD + fonte, normalização e fatiamento por país×marca. Atualizar [`scraping-estado.md`](scraping-estado.md) (theparking.eu → 🟡/🟢).

## Changelog

- **2026-07-10** — Investigação inicial completa: acesso/anti-bot, taxonomia de URLs, paginação, schema JSON-LD, fonte por card, detalhe, API interna, enumeração e design do scraper.
