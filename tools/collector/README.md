# collector — recolha de dados de anúncios (AutoImport)

Coletores próprios (sem vendedores) que recolhem anúncios de carros no estrangeiro e
normalizam para um schema comum, para comparar preços PT vs. UE.

## theparking.eu (primeiro coletor)

Agregador da rede LeParking/TheParking-cars. Escolhido como primeira fonte por ser o
mais fácil e rico tecnicamente — e por **agregar stock de sites que nos bloqueiam
diretamente** (gocar.be, autoscout24.be, marktplaats.nl, autowereld.nl…), tornando-os
acessíveis sem os atacar um a um.

Investigação técnica completa: [`../../research/theparking-investigacao.md`](../../research/theparking-investigacao.md).

### Como usar

```bash
# amostra (default: DE, NL, BE, FR)
node run-theparking.mjs

# estreitar por país/marca
node run-theparking.mjs --country belgium --make bmw --max-pages 3

# multi-país
node run-theparking.mjs --country germany --country netherlands --max-pages 2

# cobertura máxima (fatiar país × modelo via sitemap — longo)
node run-theparking.mjs --full --max-pages 10

# retomar a última recolha (checkpoint)
node run-theparking.mjs --resume
```

Flags: `--country <slug|nome-pt>` (repetível), `--make <slug>`, `--max-pages <n>`,
`--rate <ms>` (intervalo entre pedidos), `--full`, `--resume`, `--out <dir>`.

### Saída (em `out/`, gitignored)
- `theparking-<timestamp>.ndjson` — um registo normalizado por linha.
- `theparking-summary.json` — contagens (total, por país, por fonte), preços, duração.
- `theparking-checkpoint.json` — progresso + dedupe (permite `--resume`).

### Recolha contínua (polling de recentes) — `watch-theparking.mjs`

Para manter os dados frescos, faz poll da **página de anúncios mais recentes** (página 1,
que já vem ordenada por data) de X em X tempo, detetando **anúncios novos** e **mudanças
de preço**. Tudo pronto para produção **exceto o envio para a base de dados** — esse é o
único ponto a implementar, isolado em [`theparking/sink.mjs`](theparking/sink.mjs)
(marcado `>>> AQUI ENTRA A BASE DE DADOS <<<`).

```bash
node watch-theparking.mjs                          # 1 em 1 min, DE/NL/BE/FR (contínuo)
node watch-theparking.mjs --country belgium --make bmw
node watch-theparking.mjs --interval 60 --pages 1  # intervalo em segundos
node watch-theparking.mjs --interval 15 --cycles 3 # teste: 3 ciclos e sai
```

- **Estado** (`theparking-state.json`): a "tabela" atual `id → última linha` (dedupe +
  preço), persistida entre reinícios. É o que faríamos upsert numa DB.
- **Eventos** (`theparking-events.ndjson`): stream append-only de `{event:'new'|'price_change', …registo, id, first_seen, last_seen}`.
- Emite só **novos** e **preço alterado**; anúncios inalterados só atualizam `last_seen`.
- ⚠️ **Cadência:** medição (2026-07-10) dos timestamps de upload das imagens na página de
  recentes mostra **ingestão em lotes a intervalos irregulares** (de ~1 min a várias horas
  entre lotes; vários anúncios partilham o mesmo minuto), com o anúncio mais recente ~2-3h
  atrasado — **não** os "4x/dia" que fontes secundárias afirmavam, nem tempo-real. Fazemos
  poll de **1 em 1 min** (teto de segurança): apanha os lotes cedo; a maioria dos ciclos
  encontra 0 novos, o que é esperado.
- Detetar **remoções** (stock vendido) exigiria um re-crawl periódico mais fundo (fora do
  âmbito do poller de recentes).

### Schema de cada registo
`make, model, variant, year, km, fuel, gearbox, engine, color, doors, category,
price, currency, country, region, postalCode, source, detail_url, image, collected_at`.

Exemplo real recolhido:
```json
{ "make":"BMW","model":"3 SERIES","variant":"BMW 3 SERIES 318D 2.0 150 EDITION AVANTAGE",
  "year":2016,"km":123415,"fuel":"Diesel","gearbox":"Manual","engine":"2.0 Diesel",
  "color":"BLACK","doors":4,"category":"SEDAN","price":12099,"currency":"EUR",
  "country":"BELGIUM","region":"BRUXELLES-CAPITALE","postalCode":"1000","source":"gocar.be",
  "detail_url":"https://www.theparking.eu/used-cars-detail/.../A25BLZZZ.html","image":"https://…jpg" }
```

## AutoTrader.nl (segundo coletor)

Marketplace primário holandês (~233 mil anúncios de dealers), na **stack Scout24** (molde
para a família AutoScout24). Investigação: [`../../research/autotrader-investigacao.md`](../../research/autotrader-investigacao.md).

- **Fonte = `__NEXT_DATA__` (SSR)**, não a API interna (que é robots-disallowed sob `/api/`).
  Dados muito ricos por anúncio (preço, veículo, localização, dealer, potência kW, CO2, imagens).
- **Sem anti-bot** (nginx/CloudFront); HTTP puro. 20/página, paginação `?page=N`, cap 200 págs.

```bash
# batch
node run-autotrader.mjs --max-pages 3            # amostra
node run-autotrader.mjs --make 13 --max-pages 5  # só uma marca (mmvmk0; BMW=13)
node run-autotrader.mjs --full --max-pages 200   # cobertura por faixas de preço
node run-autotrader.mjs --resume

# recolha contínua (1 min)
node watch-autotrader.mjs                         # contínuo
node watch-autotrader.mjs --interval 60 --pages 2
```

Saída: `autotrader-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`autotrader-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)).

> ⚠️ **Recência:** o AutoTrader (Scout24) **não** tem ordenação por data de publicação. O watch
> usa `sort=age&desc=1` (1ª-registo mais recente) como **proxy** — a captura exaustiva de novos
> anúncios depende do re-crawl batch periódico.

## autoboerse.de (terceiro coletor)

Marketplace alemão grande (~263 mil anúncios; rede de concessionários parceiros da Santander),
tecnicamente limpo. Investigação: [`../../research/autoboerse-investigacao.md`](../../research/autoboerse-investigacao.md).

- **Fonte = `__NEXT_DATA__` (SSR)**: `props.pageProps.classifieds.classifiedList[]` (18/página) +
  `.total`; `brands[]`/`provinces[]` (contagens) servem de seed ao `--full`. Dados riquíssimos por
  anúncio (preço, veículo, potência kW/PS, CO2 WLTP, TÜV, dono anterior, acidentes, dealer, cidade/CP).
- **Anti-bot Imperva/Incapsula passivo** (cookies de sessão; sem challenge). HTTP puro; rate-limit + retry.
- **Paginação `?page=N`**; rota `/fahrzeugsuche`. Host canónico **sem `www`**.
- ✅ **Recência REAL**: ordena por data (`?orderBy=date`, o default) **e** cada anúncio traz
  `createdAt` — o watch deteta novos de forma fiável (vantagem vs AutoTrader).

```bash
# batch
node run-autoboerse.mjs --max-pages 3                    # amostra
node run-autoboerse.mjs --brand volkswagen --max-pages 5 # só uma marca (slug do path)
node run-autoboerse.mjs --full --max-pages 500           # cobertura fatiada por marca
node run-autoboerse.mjs --resume

# recolha contínua (1 min)
node watch-autoboerse.mjs                                 # contínuo
node watch-autoboerse.mjs --interval 60 --pages 2
```

Saída: `autoboerse-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`autoboerse-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). O `--full` fatia por marca (`/fahrzeugsuche/{marca}`); marcas
densas (VW/Mercedes/BMW/Audi) podem saturar o cap de paginação — corte fino futuro por modelo/preço.

## autocasion.com (quarto coletor)

Marketplace espanhol do grupo **Sumauto** (parceiro da AutoScout24), **~122.700 anúncios**,
tecnicamente limpo. Segue o **molde theparking** (JSON-LD + extras do card, juntos por ID), não o
`__NEXT_DATA__`. Investigação: [`../../research/autocasion-investigacao.md`](../../research/autocasion-investigacao.md).

- **Fonte = 1 bloco `application/ld+json` por página = array de 26 `Product`**; cada um traz
  `offers.itemOffered` = `Car` com `EngineSpecification` (make/model/variant/year/km/gearbox/
  potência BHP/color/doors/bodyType/price/url/image/identifier).
- **Faltam ao JSON-LD `fuel`, região e dealer** → vêm do **card HTML** (`<article class="anuncio">`:
  `<ul>` [ano, combustível, km, província] + `<div class="concesionario">` nome/rating). Junta-se
  card↔JSON-LD pelo `identifier` (= o `ref…` do URL / o `data-product-key` do card).
- **Anti-bot Cloudflare passivo** (200 sem challenge com UA de browser). HTTP puro; rate-limit + retry.
- **Paginação `?page=N`**; rota `/coches-ocasion`. O `--full` fatia por marca via páginas SEO
  `/coches-segunda-mano/{marca}-ocasion` (slugs descobertos na 1ª página, ~115).

```bash
# batch
node run-autocasion.mjs --max-pages 3                 # amostra
node run-autocasion.mjs --brand audi --max-pages 2    # só uma marca (SEO /…-ocasion)
node run-autocasion.mjs --full --max-pages 500        # cobertura fatiada por marca
node run-autocasion.mjs --resume

# recolha contínua (1 min)
node watch-autocasion.mjs                              # contínuo
node watch-autocasion.mjs --interval 60 --pages 2
```

Saída: `autocasion-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`autocasion-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). Extras próprios no registo: `source_site`, `id`, `dealer`,
`dealer_rating`, `power_hp`, `condition`, `certified`.

> ⚠️ **Recência (como o AutoTrader):** o "Ordenar" só tem Relevancia + Preço — **sem sort por data**.
> O watch usa a ordem default (Relevancia) da página 1 como **proxy** e loga o `max(identifier)`
> (id crescente = mais recente) como sinal; a captura exaustiva de novos depende do re-crawl batch.

## ocasionplus.com (quinto coletor)

Marketplace espanhol de **stock próprio** (cadeia OcasionPlus, ~120 centros), **~13.700 anúncios**,
tecnicamente limpo (Next.js/App Router atrás de CloudFront, sem anti-bot). Segue o **molde autocasion**
(JSON-LD + extras do card, juntos por ID). Investigação: [`../../research/ocasionplus-investigacao.md`](../../research/ocasionplus-investigacao.md).

- **Fonte = 1 bloco `application/ld+json` `ItemList` por página = 20 `Vehicle`**; cada um traz
  make/model/variant/year/km/fuel/gearbox/price/url/image/condition (o RSC `self.__next_f` não expõe
  objeto-por-carro limpo → usamos o JSON-LD).
- **Faltam ao JSON-LD a região/centro e os preços de referência/financiado** → vêm do **card HTML**
  (spans `data-test`: `span-price`/`span-finance`/`span-finace-quote`, `div-dealer`). Junta-se
  card↔JSON-LD pelo **token no fim do slug** (`…-2024-rtadgqat`).
- **⚠️ Preço:** o site mostra 3 números (PVP riscado, financiado, contado). O canónico é o
  `offers.price` do JSON-LD (**contado**, confirmado no detalhe); os outros vão em extras.
- **Sem anti-bot** (200 com UA de browser). HTTP puro; rate-limit + retry.
- **Paginação `?page=N`**; rota `/coches-segunda-mano`. O `--full` fatia por marca via **path**
  `/coches-segunda-mano/{marca}` (76 slugs descobertos em `/marcas`).
- **⚠️ robots:** os filtros por query (`?marca=`, `?sort=`…) estão **todos proibidos** — fatiamos só
  por path e paginamos com `?page=N` (permitido).

```bash
# batch
node run-ocasionplus.mjs --max-pages 3                # amostra
node run-ocasionplus.mjs --brand audi --max-pages 2   # só uma marca (path /coches-segunda-mano/audi)
node run-ocasionplus.mjs --full --max-pages 800       # cobertura fatiada por marca
node run-ocasionplus.mjs --resume

# recolha contínua (1 min)
node watch-ocasionplus.mjs                             # contínuo
node watch-ocasionplus.mjs --interval 60 --pages 2
```

Saída: `ocasionplus-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`ocasionplus-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). Extras próprios no registo: `source_site`, `id`, `slug`, `center`,
`power_hp`, `price_reference`, `price_finance`, `monthly`, `condition`.

> ⚠️ **Recência (como o AutoTrader/autocasion):** o `?sort=` é proibido pelo robots e o id é um token
> não-crescente → o watch usa a ordem default da página 1 como **proxy** e loga o `id` do topo por
> ciclo; a captura exaustiva de novos depende do re-crawl batch.

## flexicar.es (sexto coletor)

Marketplace espanhol de **stock próprio** da rede Flexicar (~180 concessionários), **~22.500 anúncios**,
Next.js limpo. Segue o **molde autoboerse/autotrader** (`__NEXT_DATA__` SSR). Investigação:
[`../../research/flexicar-investigacao.md`](../../research/flexicar-investigacao.md).

- **Fonte = `__NEXT_DATA__` SSR**: `props.pageProps.initialVehicles` (12 veículos ricos/página) +
  `countVehicles`. Dados por anúncio: preço (+ previousPrice/retail/cash/quota €/mês), veículo, potência
  (kW do `version`), etiqueta DGT, concessionário. Região/CP derivam-se cruzando `carDealershipSlug` com
  `dealerships[].value` da mesma página.
- **Sem anti-bot** (nginx + cache Next; 200 com UA de browser). HTTP puro; rate-limit + retry.
- **⚠️ SSR não pagina** (`?page=N` ignorado; devolve sempre 12/URL). A paginação real é por XHR a
  `services.flexicar.es`, host com **robots `Disallow: /`** → **não o usamos**. A cobertura obtém-se
  **fatiando facetas** SEO (`/{marca}/segunda-mano/`, `/{marca}/{modelo}/coches-{provincia}/segunda-mano/`…),
  cada URL a render 12. `--full` seeda **~9.684 facetas do `sitemap.xml`** (granulares têm ≤12 → captura
  total da fatia). `--max-pages N` limita o nº de facetas (não há páginas robots-permitidas).

```bash
# batch
node run-flexicar.mjs --max-pages 3                 # amostra (base + fatias por marca)
node run-flexicar.mjs --brand audi --max-pages 1    # só uma marca (/audi/segunda-mano/)
node run-flexicar.mjs --full --max-pages 500        # cobertura por facetas do sitemap
node run-flexicar.mjs --resume

# recolha contínua (1 min)
node watch-flexicar.mjs                              # contínuo
node watch-flexicar.mjs --interval 60 --pages 2
```

Saída: `flexicar-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch); `flexicar-state.json` /
`-events.ndjson` (watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras próprios:
`source_site`, `id`, `dealer`, `eco_sticker`, `power_kw`/`power_hp`, `previous_price`/`retail_price`/
`cash_price`/`quota_price`, `offer`/`outlet`/`reserved`/`financiable`/`tax_deductible`, `images`.

> ⚠️ **Recência (como o AutoTrader/autocasion):** sem sort por data no SSR. O watch usa a ordem default
> como proxy e loga o `max(id)` (id de stock crescente); a captura exaustiva de novos depende do re-crawl batch.

## aramisauto.com (sétimo coletor)

Retalhista francês de usados/0km (**Aramis Auto**, stock próprio), **~2.871 anúncios**, tecnicamente
limpo. Segue o **molde autotrader/autoboerse** (JSON SSR embutido), mas é uma app **Nuxt**: o estado
vem numa IIFE `window.__NUXT__=(function(){…}())` — avaliada num **sandbox `node:vm`** (contexto vazio
+ timeout), não `JSON.parse`. Investigação: [`../../research/aramisauto-investigacao.md`](../../research/aramisauto-investigacao.md).

- **Fonte = `nuxt.data[0].displayedSearchVehicleResponse.vehicles`** (24/pág) com todos os campos
  (maker/model/finish/engine/energyType/transmission/mileage/firstCirculationDate/power/category/
  color/price/photo/offerType…). O JSON-LD da página é pobre (só name/url/price) → ignorado.
- **`detail_url`** reconstruído das partes (makerId/modelId/finishId/offerId/vehicleId) — bate 1:1 com
  os URLs do JSON-LD. `source`='Aramisauto' (stock próprio); `region`/`postalCode`/`doors`=null.
- **Anti-bot Cloudflare passivo** (200 sem challenge). HTTP puro; **`Crawl-delay: 5`** → `--rate` default 5000ms.
- **Paginação `?page=N`** (sem teto: p além do total dá 404); rota `/achat/`. O `--full` fatia por
  **categoria** via silos SEO `/achat/{categoria}/` (10 carroçarias que particionam o catálogo). Sem
  path por marca (`/achat/peugeot/`=404) → o análogo do `--brand` é `--slice <silo>` (categoria/combustível).

```bash
# batch
node run-aramisauto.mjs --max-pages 3                 # amostra (/achat/)
node run-aramisauto.mjs --slice diesel --max-pages 2  # só um silo (/achat/diesel/)
node run-aramisauto.mjs --full --max-pages 200        # cobertura fatiada por categoria
node run-aramisauto.mjs --resume

# recolha contínua (1 min)
node watch-aramisauto.mjs                              # contínuo
node watch-aramisauto.mjs --interval 60 --pages 2
```

Saída: `aramisauto-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`aramisauto-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). Extras próprios no registo: `source_site`, `id`, `offer_id`,
`offer_type`, `status`, `power_ch`/`power_kw`, `tax_horsepower`, `energy_id`, `category_id`,
`battery_autonomy_wltp`, `catalog_price`, `discount_amount`/`discount_percent`, `monthly_loan`, `promotions`.

> ⚠️ **Recência (como o AutoTrader):** sem sort por data (e proibido pelo robots). O watch usa a ordem
> default de `/achat/` como **proxy** e loga o `max(vehicleId)` (id crescente = mais recente) como sinal;
> a captura exaustiva de novos depende do re-crawl batch.

## coches.trovit.es (oitavo coletor)

Secção de automóveis de Espanha do **Trovit** (agregador do grupo **Lifull Connect**), **HTTP puro
sem anti-bot**. Segue o **molde theparking/autocasion** (JSON-LD + extras do card, juntos por ID).
Investigação: [`../../research/trovit-investigacao.md`](../../research/trovit-investigacao.md).

- **Fonte = 1 bloco `application/ld+json` por página = `SearchResultsPage` com `about[]` de 25 `Car`**
  (make/model/description/year/km/price/doors/image). Junta-se ao **card** (`data-id`, thribee href,
  `item-address`, `item-updated-date`) pelo **id** do anúncio (path da imagem ↔ `data-id`).
- **`fuel`/`gearbox`/potência** não têm campo estruturado → regex sobre `description`+`name`+título do
  card. `detail_url`/região/recência vêm do card.
- **⚠️ Agregador com origem escondida:** o link aponta para `rd.clk.thribee.com` (robots `Disallow: /`)
  que esconde o site de origem → **não o resolvemos**; `source`=null, `source_site`='coches.trovit.es',
  dedupe por `id`.
- **⚠️ robots:** bloqueia bots nomeados (ClaudeBot/Ahrefs/…) mas o grupo `*` permite a listagem
  `/coches/{slug}` — usamos UA de browser, honrando o grupo `*`.
- **Rota `/coches/{slug}`, paginação no PATH** (`/coches/audi/2`). **Sem página "todos os coches"** →
  `--full` fatia por **marca** (lista fixa `MARCAS`). `--brand` aceita qualquer faceta (marca/cidade/
  região/modelo). Default sem flags: slug `madrid`.
- **✅ Recência real:** `?order_by=source_date` ("más recientes") + "Hace 21 h" por card → watch fiável.

```bash
# batch
node run-trovit.mjs --max-pages 3                 # amostra (slug default: madrid)
node run-trovit.mjs --brand audi --max-pages 2    # uma faceta (marca/cidade/região/modelo)
node run-trovit.mjs --full --max-pages 500        # cobertura fatiada por marca
node run-trovit.mjs --resume

# recolha contínua (1 min, sort por data)
node watch-trovit.mjs                             # slug default (madrid), contínuo
node watch-trovit.mjs --slug audi --interval 60 --pages 2
```

Saída: `trovit-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch); `trovit-state.json` /
`-events.ndjson` (watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras
próprios: `source_site`, `id`, `power_cv`, `updated_text`, `updated_ago_min`, `is_new`, `title`.

> ⚠️ **Limitações:** `source` (origem) = null (redirecionador com robots `Disallow: /`); `fuel`/
> `gearbox` incompletos nas facetas de cidade (texto de marketing) — bem mais ricos por marca (`--full`).

## meinauto.de (nono coletor)

Marketplace alemão (agrega stands, origem "MARA") que **mistura novos e usados** — filtramos SEMPRE
`conditionCategories=PRE_OWNED` para apanhar só os **Gebrauchtwagen** (**~9.100 anúncios** com preço/km/
ano reais). Segue o **molde aramisauto** (app Nuxt), mas é **Nuxt 3**: o payload SSR vem num
`<script id="__NUXT_DATA__" type="application/json">` em **JSON puro** (formato *devalue flatten*, com
referências por índice) → `JSON.parse` + re-hidratação do grafo (`unflatten`), **sem `node:vm`** (o
aramisauto/Nuxt 2 usava IIFE avaliada em sandbox). Investigação: [`../../research/meinauto-investigacao.md`](../../research/meinauto-investigacao.md).

- **Fonte = `root.pinia.results` = { meta, results }** (47/pág). `results[]` traz todos os campos
  (make/model/trim/1ª-matrícula/km/combustível/caixa/cilindrada/cor/portas/carroçaria/preço/stand/
  morada/CO2/potência/dono/acidentes/`createdAt`). `meta.totalResults` + `meta.counts` (facetas → seed do `--full`).
- **Preço** = `calculation.purchasePrice` (float → `Math.round`, NÃO `toInt`). `detail_url` =
  `/fahrzeugsuche/detail/{id}`; `image` = `assets-meinauto.de/{path}`. `source`=stand, `region`=Bundesland, `postalCode`+`city` por anúncio.
- **Anti-bot passivo** (stack Google envoy + GCLB; Baqend Speedkit). HTTP puro; robots-clean (só `/envkv/`,
  `/motoren/`, `/ausstattung/`); sem Crawl-delay → rate default 1500ms.
- **Paginação `?page=N`** (rota `/fahrzeugsuche/`, barra final obrigatória) **SEM teto de offset** — a
  query única cobre os ~9.100 usados (~194 págs). O `--full` fatia mesmo assim por **marca** (`makes={nome}`,
  ~47 nomes de `meta.counts.makes`); `--brand <Nome>` filtra uma marca.

```bash
# batch
node run-meinauto.mjs --max-pages 3                 # amostra (usados)
node run-meinauto.mjs --brand Audi --max-pages 2    # só uma marca (makes=Audi)
node run-meinauto.mjs --full --max-pages 500        # cobertura fatiada por marca
node run-meinauto.mjs --resume

# recolha contínua (1 min)
node watch-meinauto.mjs                              # contínuo
node watch-meinauto.mjs --interval 60 --pages 2
```

Saída: `meinauto-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`meinauto-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). Extras próprios no registo: `source_site`, `id`, `seller_slug`, `city`,
`power_kw`, `co2`, `previous_owner`, `accidents`, `first_registration`, `usage_type`, `condition_category`,
`emission_class`, `total_list_price`, `images`, `listing_created_at`.

> ✅ **Recência REAL** (como o autoboerse): `sortBy=createdAt&order=desc` ordena por data de criação
> (topo da p1 = anúncios do próprio dia) E cada anúncio traz `createdAt` → deteção de novos fiável no watch.

## quoka.de (décimo coletor)

Classificados alemães generalistas (secção de carros = "Automarkt"), **P2P (particulares)**. Segue
o **molde theparking/autocasion** (JSON-LD + card, juntos por ID), mas aqui o **card HTML é a fonte
principal** e o JSON-LD é complementar (dá a cilindrada). Investigação:
[`../../research/quoka-investigacao.md`](../../research/quoka-investigacao.md).

- **Fonte 1 = 1 bloco `application/ld+json` = `ItemList` com 20 `Vehicle`**: `offers.price`,
  `vehicleModelDate`, `fuelType`, `vehicleEngine.engineDisplacement` (cm³), `url` (hash de join).
- **Fonte 2 = card `div.article-item`** (20 regulares + ~1 Premium promovido, este só no HTML):
  título (make/model em texto livre), `ano | combustível | km`, cidade/Bundesland, **data de
  publicação**, preço (e preço antigo se houve descida), nº de fotos, hash (join), UUID. Junta-se
  card↔JSON-LD pelo hash de 32 chars do URL.
- **P2P:** o card **não nomeia o vendedor** → `source='particular'`. `make`/`model` vêm do slug da
  query (`--full`/`--brand`, marca 100%) ou de um dicionário sobre o título (listagem geral,
  ~81%/71%). `gearbox`/`color`/`doors` não estruturados (gearbox best-effort por regex).
- **Anti-bot Cloudflare passivo** (200 sem challenge com UA de browser). HTTP puro; rate-limit + retry.
- **Paginação `?pag=N`**; rota `/anzeigen/auto-motorrad/automarkt/`. O `--full` fatia por marca via
  path `/automarkt/{marca}/` (87 slugs descobertos na 1ª página, filtrando os 16 Bundesländer).

```bash
# batch
node run-quoka.mjs --max-pages 3                        # amostra
node run-quoka.mjs --brand volkswagen --max-pages 5     # só uma marca (slug do path)
node run-quoka.mjs --full --max-pages 500               # cobertura fatiada por marca
node run-quoka.mjs --resume

# recolha contínua (1 min)
node watch-quoka.mjs                                    # contínuo
node watch-quoka.mjs --interval 60 --pages 2
```

Saída: `quoka-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch); `quoka-state.json` /
`-events.ndjson` (watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras
próprios no registo: `source_site`, `id` (hash), `article_id` (UUID), `city`, `price_old`, `images`,
`listing_date`, `premium`, `verified_phone`, `description`.

> ✅ **Recência REAL:** sort default `date` ("Neueste Anzeigen") + `listing_date` por anúncio
> ("heute HH:MM") → deteção de novos fiável (o watch força `?sort=date`; o card Premium fixo no
> topo é deduplicado pelo hash).

## ooyyo.com — Bélgica (décimo-primeiro coletor)

**Ooyyo** é um **agregador/motor de busca** de carros usados (indexa dezenas de sites de origem),
secção **Bélgica** = `idCountry=23`, **~72.060 anúncios**. Host: `www.ooyyo.com` (NÃO `ooyyo.be`, que
é um blog de aluguer). Molde **card HTML server-rendered** (família theparking, mas o card é a fonte
completa — sem JSON-LD/`__NEXT_DATA__`). Investigação: [`../../research/ooyyo-investigacao.md`](../../research/ooyyo-investigacao.md).

- **Chegada à listagem via API interna** `GET /ooyyo-services/resources/quicksearch/qselements?json={…}`
  (`idCountry:23, idLanguage:47, idCurrency:3, isNew:0, qsType:advanced`; sem `code`). Devolve o **URL
  da 1ª SRP** (com `code` válido), o **`count`** e as **marcas** (seed do `--full`). Servida em
  `www.ooyyo.com` (o host `analytics.ooyyo.com` é gated → "forbidden!").
- **Fonte = card `<a class="car-card-1">`** (15/pág) na SRP `/belgium/…used-cars-for-sale/c=<code>/`:
  year/make/model/engine, preço (`data-price`), km, carroçaria+combustível(+cor) por **vocabulário**,
  cidade, e o **site de origem** no URL da imagem (proxy `images.ooyyo.com/…?url=<origem>/…`).
- **`source`** = site de origem do anúncio (agregador: autolive.be, autoline.be, moniteurautomobile.be,
  woowmotors.com…). `source_site='ooyyo.com'`. Dedupe por `id` (`data-record`, hash único).
- **Anti-bot Cloudflare passivo** (200 sem challenge). HTTP puro; **`Crawl-delay: 30`** → `--rate`
  default **30000ms** (honra o robots). Disallow `/automobili/`, `/outlet-service-web/`, `/counter`
  não tocados.
- **Paginação = seguir "Next"** (o `code` codifica a página). O `--full` fatia por **marca** via
  `qselements idMake` (BMW → `/belgium/used-bmw-for-sale/…`, ~9k); o análogo do `--brand` é `--make`.

```bash
# batch
node run-ooyyo.mjs --max-pages 3                 # amostra (toda a Bélgica)
node run-ooyyo.mjs --make bmw --max-pages 2      # só uma marca (via qselements idMake)
node run-ooyyo.mjs --full --max-pages 500        # cobertura fatiada por marca
node run-ooyyo.mjs --resume

# recolha contínua (1 min)
node watch-ooyyo.mjs                             # contínuo
node watch-ooyyo.mjs --interval 60 --pages 2
```

Saída: `ooyyo-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch); `ooyyo-state.json` /
`-events.ndjson` (watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras
próprios no registo: `source_site`, `id`, `source_host`, `deal`, `save_percent`, `image_count`.

> ⚠️ **Recência (como o AutoTrader):** a SRP não tem sort por data e os ids são hashes (não
> sequenciais). O watch usa a ordem default da SRP como **proxy**; a captura exaustiva de novos
> depende do re-crawl batch (`--full`).

## Autoline / Via-Mobilis (BE — ligeiros) (décimo-segundo coletor)

Coletor do **autoline.pt**, o marketplace pan-europeu do grupo **Via Mobilis / LineMedia**. Recolhe a
secção **país = Bélgica**, categoria **CARROS** (`--c1169`, passenger cars). ⚠️ O autoline é sobretudo de
**veículos comerciais/pesados e máquinas**, mas tem categoria de ligeiros — que é a que recolhemos;
a fatia BE é **quase toda de LEILÃO** (Troostwijk/Auctim/AuctionPort/VAVATO) e inclui alguns
ligeiros-comerciais leves (Sprinter/Transit/Master). ~590 anúncios BE (~11k ligeiros em toda a UE).
Investigação: [`../../research/autoline-investigacao.md`](../../research/autoline-investigacao.md).

- **HTTP puro, sem anti-bot.** Fonte = **card HTML (primário) + JSON-LD `ItemList`→`Product`
  (enriquecimento)**, juntos por ID. O card é a spine porque o JSON-LD vem vazio nalguns países (GB).
- **Rota:** `/-/carros/{Pais}--c1169cnt{CC}`, paginação `?page=N`. `--full` fatia por **país**
  (facets UE: DE/BE/GB/FR/ES/CH); `--country <CC>` para uma fatia (default BE).
- **Recência real:** o `id` (data-code) é um timestamp de criação → `created_at`; watch loga `max(id)`
  (robots proíbe `?sort=`).

```bash
# batch
node run-autoline.mjs --max-pages 3                 # amostra (Bélgica)
node run-autoline.mjs --country DE --max-pages 2    # outra secção-país
node run-autoline.mjs --full --max-pages 500        # cobertura fatiada por país
node run-autoline.mjs --resume

# recolha contínua (1 min)
node watch-autoline.mjs                              # contínuo
node watch-autoline.mjs --interval 60 --pages 2
```

Saída: `autoline-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch); `autoline-state.json` /
`-events.ndjson` (watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras
próprios: `source_site`, `id`, `dealer`, `is_auction`, `condition`, `ref_code`, `power`, `axle_config`,
`body_type`, `euro_norm`, `first_registration`, `created_at`.

> ⚠️ **Qualidade do stock:** o autoline é sobretudo comerciais/pesados/máquinas; a fatia de ligeiros
> BE (~590) é quase toda de leilão e ~23% sem preço fixo (só "Leilão"). É o alvo de menor qualidade —
> recolhível e normalizado para o schema comum, mas avaliar se compensa manter.

## autohero.com (décimo-terceiro coletor)

Retalhista de usados de **stock próprio** do grupo **AUTO1** (multi-país; recolhemos o mercado
**Alemanha /de/**), **~7.442 anúncios DE**, tecnicamente limpo. É uma **SPA Apollo/GraphQL**: o SSR
(`window.__APOLLO_STATE__`) só traz ~24-30 resultados e ignora `?page=N` — a paginação real é por uma
**API GraphQL interna no MESMO host**, que usamos diretamente. Investigação:
[`../../research/autohero-investigacao.md`](../../research/autohero-investigacao.md).

- **Fonte = API GraphQL** `POST /v1/retail-customer-gateway/graphql` (operação `searchAdV9AdsV2`,
  query+endpoint extraídos do bundle da app). O resolver devolve um **escalar JSON** `{total, data[]}`
  (sem sub-seleção → vem tudo), **sem autenticação**. Campos ricos: preço, km, potência kW/PS, CO2,
  nº donos/acidentes/danos, livro de revisões, histórico de preço, sucursal, e **datas de publicação**.
- **`source`='Autohero'** (stock próprio, não é agregador de stands); `country`='GERMANY',
  `currency`='EUR'. `region`/`postalCode`=null (retalhista nacional; sucursal em `branch_*`).
  `color`/`doors`/`category`=null (não vêm nesta projeção). Códigos `fuelType`/`gearType` mapeados.
- **Paginação por `limit`(≤100)/`offset`** com sort determinístico `newest_eligible` → cobertura
  completa do catálogo em ~75 pedidos, **sem facetas** (a API já é paginável — mais simples que o
  Flexicar). Anti-bot CloudFront passivo (HTTP puro passa). O `http.mjs` acrescenta um `postGraphql`
  que reaproveita rate-limit/robots/cookies do cliente base.
- **robots-clean** — só proíbe `myhero/inspection/checkout/identify/center/unsubscribe`; **a API está
  no mesmo host e o seu path NÃO é proibido** (verificado, ao contrário do Flexicar).

```bash
# batch
node run-autohero.mjs --max-pages 3                 # amostra (3 págs × 100)
node run-autohero.mjs --full --max-pages 100        # catálogo completo (~75 págs)
node run-autohero.mjs --sort most_popular           # sort alternativo (popularidade)
node run-autohero.mjs --resume

# recolha contínua (1 min)
node watch-autohero.mjs                              # contínuo
node watch-autohero.mjs --interval 60 --pages 2
```

Saída: `autohero-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`autohero-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). Extras no registo: `source_site`, `id` (UUID), `stock_number`,
`power_kw`/`power_ps`, `drive_train`, `co2`, `first_registration`, `preowner_count`, `accidents`,
`damages`, `has_service_book`, `monthly_payment`, `price_previous`/`price_first`, `branch_city`/`branch_zip`,
`listing_first_published_at`, `is_coming_soon`, `retail_ad_state`.

> ✅ **Recência REAL** (vantagem sobre aramisauto/autotrader): sort `newest_eligible` + `firstPublishedAt`
> por anúncio. O watch pede o topo por recência e loga o `max(firstPublishedAt)` por ciclo.
> ⚠️ Depende de uma query GraphQL extraída do bundle da app — mais frágil que SSR se a app mudar.

---

# Coletores do mercado nacional (Portugal)

Fontes PT (secção 5 do `scraping-estado.md`) — o lado nacional da comparação de preço. Padrão comum:
o SSR embute o estado da listagem e a **API interna costuma estar robots-proibida** → usamos sempre o
HTML/SSR permitido. Todos passam com **HTTP puro** (sem proxies/stealth).

## standvirtual.com (décimo-quarto coletor)

Maior marketplace de usados de **Portugal** (grupo OLX/Adevinta; irmão do OTOMOTO), **~42,3k anúncios**,
stands **e** particulares. Investigação: [`../../research/standvirtual-investigacao.md`](../../research/standvirtual-investigacao.md).

- **Fonte = `__NEXT_DATA__` → urqlState (SSR)**: `advertSearch.edges[].node` (32/página) + `totalCount`.
  Node rico: preço, localização (cidade/região), `seller.__typename` (stand vs particular),
  `sellerLink.name` (nome do stand), `thumbnail` (olxcdn) e `parameters[]` (make/model/version/fuel/
  gearbox/km/cilindrada/potência/ano).
- **⚠️ NÃO usamos a API GraphQL**: o robots proíbe `/api/` e `/ajax/`. Como o SSR da listagem já traz
  os anúncios (ramo `Allow: /`), recolhemos só o HTML de `/carros`.
- **Anti-bot DataDome passivo** (200 com UA de browser, sem challenge). HTTP puro; minDelay 2500ms + retry.
- **Paginação `?page=N`, SEM cap** (chega ao fim do catálogo, ~1324 págs) → `--full` pagina direto,
  sem fatiar por marca. `--brand {slug}` (ex. `bmw`, `mercedes-benz`) restringe a uma marca.
- ✅ **Recência REAL**: sort `search[order]=created_at_first:desc` + `createdAt` por anúncio → watch fiável.

```bash
# batch
node run-standvirtual.mjs --max-pages 3              # amostra
node run-standvirtual.mjs --brand bmw --max-pages 5  # só uma marca (slug do path)
node run-standvirtual.mjs --full                     # cobertura completa (~1324 págs)
node run-standvirtual.mjs --resume

# recolha contínua (1 min)
node watch-standvirtual.mjs                          # contínuo
node watch-standvirtual.mjs --interval 60 --pages 2
```

Saída: `standvirtual-*.ndjson` / `-summary.json` / `-checkpoint.json` (batch);
`standvirtual-state.json` / `-events.ndjson` (watch). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). `seller_type` distingue stand/particular.

## olx.pt (décimo-quinto coletor)

Secção de carros do **OLX Portugal** (`/carros-motos-e-barcos/carros/`, grupo OLX/Adevinta), **~50,8k
carros**, stands **e** particulares (via `seller_type` business/private). Investigação:
[`../../research/olxpt-investigacao.md`](../../research/olxpt-investigacao.md).

- **Fonte = SSR `window.__PRERENDERED_STATE__`** (React SPA que embute o estado no HTML) →
  `state.listing.listing.ads[]` (52/página), com o array `params[]` (atributos do carro chave→valor),
  `createdTime` (recência real), `price`, `location`, `user`, `isBusiness`, `photos`. HTTP puro, sem browser.
- **⚠️ API não usada (robots):** o `robots.txt` tem `Disallow: /api/`, logo a API `/api/v1/offers` (JSON
  paginável por offset, para onde apontam os `links.next` do estado) é **proibida** — ficamos no SSR humano,
  que é permitido. O guard `assertAllowed` bloqueia `/api/` por segurança.
- **Anti-bot passivo** (200 com UA de browser + `Accept-Language: pt-PT`). Sem proxies/stealth.
- **Paginação `?page=N`** (teto 100 págs × 52 ≈ 5.200/faceta) → `--full` **fatia por marca** (path SEO
  `/carros/{marca}/`, ~40 slugs); `--make`/`--region`. As 2 marcas mais densas (BMW/Mercedes ~5,5k)
  passam ligeiramente o teto de 100 págs e truncam (corte fino futuro: marca×distrito).
- **make** detetada do título (o OLX não tem param de marca) e, no `--full`, carimbada pela faceta.
  color/doors/postalCode = null (não expostos na listagem).
- ✅ **Recência REAL**: `?search[order]=created_at:desc` (honrado pelo SSR) + `createdTime` por anúncio.

```bash
node run-olxpt.mjs --max-pages 3                # amostra (3×52 ≈ 156)
node run-olxpt.mjs --make bmw --max-pages 5     # uma marca (/carros/bmw/)
node run-olxpt.mjs --region porto --max-pages 5 # um distrito (/carros/porto/)
node run-olxpt.mjs --full --max-pages 100       # catálogo completo, fatiado por marca
node run-olxpt.mjs --resume
node watch-olxpt.mjs --interval 60 --pages 2    # contínuo, por recência
```

Saída: `olxpt-*` (batch/watch, igual aos outros). Pronto exceto o upsert na DB
([`lib/sink.mjs`](lib/sink.mjs)). Extras: `seller_type` (business/private), `power_hp`, `body_type`,
`seats`, `origin` (imported/national), `first_registration`, `created_time`.

## custojusto.pt (décimo-sexto coletor)

Marketplace português de usados (grupo Schibsted), **~26,4k carros**, tecnicamente limpo.
Investigação: [`../../research/custojusto-investigacao.md`](../../research/custojusto-investigacao.md).

- **Fonte = `__NEXT_DATA__` (SSR, flag `__N_SSP`)**: `props.pageProps.listItems[]` (40/página) +
  total real em `initialState.search.resources.totalAds` (~26.412). A taxonomia `carBrands` (75
  marcas) e `baseLocations` (20 distritos) vêm no mesmo SSR e semeiam o `--full`.
- **make** casado contra `carBrands` (robusto p/ multi-palavra); **model/variant** por corte do
  título; **km/power_hp** best-effort por regex (texto livre); color/doors/engine não expostos.
- **Vendedor Profissional/Particular** via `companyAd` → `seller_type` + `source`. Extras:
  distrito/concelho/freguesia, `category_code`, `listing_created_at`, `image_count`.
- **Anti-bot Cloudflare passivo** (200 com UA de browser, sem challenge). HTTP puro; rate-limit + retry.
- **⚠️ Paginação `?o=N` ROBOTS-PROIBIDA** (`Disallow: /*?o=*`) → nunca a geramos. Cobertura por
  **facetas** path-based (marca/distrito/categoria), cada URL a render a 1ª página (40, mais recentes).
- ✅ **Recência REAL**: sort default `SORT_DESC_PUBLISH_DATE` + `listTime` por anúncio → watch fiável.

```bash
# batch (unidade = faceta; sem paginação)
node run-custojusto.mjs --max-pages 3                   # amostra (base + primeiras facetas)
node run-custojusto.mjs --brand peugeot --max-pages 1   # só uma marca (slug do path)
node run-custojusto.mjs --full --max-pages 1500         # cobertura fatiada marca×distrito
node run-custojusto.mjs --resume
node watch-custojusto.mjs --interval 60                 # contínuo
```

Saída: `custojusto-*` (batch/watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). O
`--full` faz o produto marca×distrito (1500 facetas); combos densos (>40, ex. Peugeot·Lisboa=408)
truncam na 1ª página — corte fino futuro por categoria/preço/ano.

## auto.pt (décimo-sétimo coletor)

Marketplace **português** (Pixelplan-Digital Web Lda), SSR tradicional (Symfony), **~16,2k carros
usados**, scraper-friendly. Segue o **molde quoka/autocasion** (card HTML + JSON-LD juntos por id).
Investigação: [`../../research/autopt-investigacao.md`](../../research/autopt-investigacao.md).

- **Fonte principal = CARD** `<a data-testid="car_listing_entry" id="item_XXXX">` (20/página): id
  (referenceNumber), URL, título, preço, **vendedor (stand)**, **distrito**, `<ul>` [combustível,
  ano, km], imagem.
- **JSON-LD enriquece:** `WebPage.mainEntity`=`OfferCatalog` (20 `Vehicle`: marca/modelo separados,
  `fuelType`, ano, km, condição, imagem) + `ItemList` (id via `url` + `numberOfItems`). Join
  **id→Vehicle** por posição via `ItemList` (alinhamento 20/20/20 verificado).
- **⚠️ Particular vs. empresa (per-card):** stand traz o span do nome; particular não → `owner_type`
  + `source` (nome do stand ou "Particular").
- **Anti-bot Cloudflare passivo** (200 sem challenge). HTTP puro; rate-limit + retry. robots-clean
  (só `/area-pessoal` + `/_components/*` bloqueados).
- **Paginação `?page=N`**; rota `/carros-usados`. O `--full` fatia por marca via **path**
  `/carros-usados/{marca}` (~132 slugs); slices `--make`/`--district`.
- **⚠️ Filtros/sort por query não funcionam num GET puro** (`?search[...]` → 500; `?sortBy=` ignorado)
  → só path + `?page=N`. Recência-proxy (ordem default "Destacados").

```bash
node run-autopt.mjs --max-pages 3                      # amostra
node run-autopt.mjs --make renault --max-pages 2       # só uma marca (path)
node run-autopt.mjs --district lisboa --max-pages 2    # só um distrito (path)
node run-autopt.mjs --full --max-pages 900             # cobertura fatiada por marca
node run-autopt.mjs --resume
node watch-autopt.mjs --interval 60 --pages 2          # contínuo
```

Saída: `autopt-*` (batch/watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras:
`owner_type`, `dealer`, `condition`. gearbox/engine/color/doors/segmento só no detalhe (null na listagem).

## auto.sapo.pt (décimo-oitavo coletor)

Marketplace automóvel do **portal SAPO** — particulares (grátis) + profissionais (stands), **~24,4k
usados**. **A pista de "SPA JS-heavy / API em `auto-frontoffice.sapo.pt`" revelou-se falsa:** é uma app
**ASP.NET Core MVC com SSR** — o HTML de `/carros-usados` já traz os cartões; não há API JSON de pesquisa.
Investigação: [`../../research/autosapo-investigacao.md`](../../research/autosapo-investigacao.md).

- **Fonte primária = cartões HTML SSR** (molde theparking/autocasion, mas **sem JSON-LD**). Cada card
  dá id (**ObjectId** no href), marca+modelo, variante/potência/portas, ano/km/combustível, preço,
  imagem. `source`='Auto SAPO'. **Separação marca/modelo** via os 83 slugs do sitemap de marcas.
- **✅ Recência REAL:** o **ObjectId codifica o timestamp de publicação** → `published_at` por anúncio
  (sem depender de campos do card). O `orderby=1` ("Mais recente") é honrado pelo SSR.
- **Fonte opcional = detalhe (`--detail`)**: `dataLayer` + JSON-LD + morada → caixa, cor, carroçaria,
  **distrito**, cilindrada, VIN, lugares, tração, **vendedor (particular/profissional)** e **`national`
  (matrícula PT vs importado)**. 1 pedido/anúncio → só p/ amostras/fatias, não p/ o catálogo inteiro.
- **Paginação `?p=N`** (20/pág) chega ao fim (`p=1218`) → `--full` cobre tudo **sem facetas**; dedupe
  global apanha os "Em destaque" repetidos. `--slice "marca=volvo"` filtra (querystring cru).
- **robots-clean** (só `/account/` e `/user/`); HTTP puro sem anti-bot.

```bash
node run-autosapo.mjs --max-pages 3                  # amostra (3 págs × 20)
node run-autosapo.mjs --full                         # catálogo completo (~1218 págs, ~24k)
node run-autosapo.mjs --slice "marca=volvo"          # só uma marca (657 viaturas)
node run-autosapo.mjs --max-pages 2 --detail         # enriquece via pág. de detalhe (lento)
node run-autosapo.mjs --resume
node watch-autosapo.mjs --interval 60 --pages 3      # contínuo, poll por recência
```

Saída: `autosapo-*` (batch/watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). Extras:
`id` (ObjectId), `power_cv`, `published_at`, `highlighted`; com `--detail`: `locality`, `seats`, `vin`,
`interior_color`/`interior_type`, `drive_train`, `seller_type`, `national`, `dealer`.

## encontracarros.pt (décimo-nono coletor — agregador PT)

Agregador/meta-motor **português** (Next.js App Router) que compara os principais sites PT
(standvirtual, olx.pt, custojusto.pt, auto.sapo.pt, auto.pt) + centenas de stands próprios
(carmine.pt, santogal.pt…). **~50k anúncios recentes** alcançáveis (o site anuncia "100k+/800+
stands"; o "1,67M" reportado é global/inflacionado). Segue o **molde theparking** (agregador →
`source`=site de origem), adaptado a **sitemap + páginas de detalhe SSR**.
Investigação: [`../../research/encontracarros-investigacao.md`](../../research/encontracarros-investigacao.md).

- **⚠️ A listagem `/pesquisa` é CLIENT-SIDE** (HTML sem cards) → inútil por HTTP puro. A recolha faz-se
  pelo **`sitemap.xml`** (50k `/anuncio/…` com `<lastmod>`, ordenados por recência) + **páginas de
  detalhe** `/anuncio/{slug}-{id6}` (SSR; **1 request/anúncio**).
- **Fonte 1 = JSON-LD `Vehicle`**: marca, modelo, ano, km, caixa, portas, lugares, `bodyType`,
  combustível, potência (cv), imagens, preço, localidade (distrito), país (PT).
- **Fonte 2 = objeto `carListing`** do payload RSC (`self.__next_f`, isolado por brace-matching para
  evitar os ~12 anúncios de comparação): **site de origem** (`advertiser`), **URL externo original**,
  **vendedor/stand** (`dealership_name`), cor, condição, nacional/importado.
- **`source`=site/stand de origem**; `source_site='encontracarros.pt'`; `country='PORTUGAL'`. `id`=6
  chars do slug (dedupe). **`source_url`** = anúncio original → **dedupe cross-coletor** (contra
  standvirtual/olxpt/custojusto/autopt/autosapo).
- **HTTP puro, sem anti-bot.** robots só proíbe `/link` (nunca tocado; URL original vem no HTML).
- **`--full`** percorre o sitemap todo (~50k); slices `--brand`/`--district`/`--since` do slug/lastmod.
- **⭐ Recência REAL:** watch faz poll dos anúncios com `lastmod` > watermark do ciclo anterior.

```bash
node run-encontracarros.mjs --max-pages 3                 # amostra (~90 mais recentes)
node run-encontracarros.mjs --brand bmw --max-pages 2     # só uma marca (slug)
node run-encontracarros.mjs --district porto --max-pages 2 # só um distrito (slug)
node run-encontracarros.mjs --full                        # cobertura ~50k (longo)
node run-encontracarros.mjs --resume
node watch-encontracarros.mjs --interval 60 --pages 2     # contínuo (recência via lastmod)
```

Saída: `encontracarros-*` (batch/watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)).
Extras: `source_url`, `dealer`, `condition`, `national`, `seats`, `listed_at`. postalCode não exposto.

## autouncle.pt (vigésimo coletor — agregador PT)

Meta-motor/agregador dinamarquês **AutoUncle**, versão Portugal (~99k listagens PT de ~9 sites-fonte;
o "93 sites" do título é o total global), com avaliação de preço própria (**AutoScore** 1–5).
Segue o **molde theparking** (agregador). Investigação: [`../../research/autouncle-investigacao.md`](../../research/autouncle-investigacao.md).

- **Fonte = SSR de `/pt/carros-usados`, dois blocos juntos pelo carId**: (1) **JSON-LD**
  (`@graph`→`ItemList.itemListElement[25].item` = `Product`+`Vehicle` rico + `numberOfItems` = total)
  para o catálogo; (2) **payload RSC** (`self.__next_f`, ~250 chunks) para o que falta a um agregador —
  a **fonte de origem** (`sourceName`), o **AutoScore** (`auRating`), a imagem real, a variante e os
  dias em stock. `source`=site/stand de origem; `source_site='autouncle.pt'`; `country='PORTUGAL'`.
- **Anti-bot Cloudflare passivo** (200 sem challenge com UA de browser). HTTP puro; rate-limit + retry.
- **Paginação `?page=N`** (25/pág, teto ~pág 100). **⚠️ robots proíbe filtros/ordenação por query
  `s[...]=`** → cobertura **só por facetas de PATH** (`/pt/carros-usados/{Marca}`) + `?page`. A saída
  para a origem (`/pt/link-externo/`) é proibida → só se LÊ o slug, nunca se pede. A **config API**
  (`/api/v4/car_search_form/config`, robots-permitida) semeia as marcas do `--full`.

```bash
node run-autouncle.mjs --max-pages 3                    # amostra
node run-autouncle.mjs --brand Renault --max-pages 5    # só uma marca (slug canónico do path)
node run-autouncle.mjs --full --max-pages 100           # cobertura fatiada por marca (config API)
node run-autouncle.mjs --resume
node watch-autouncle.mjs --interval 60 --pages 2        # contínuo
```

Saída: `autouncle-*` (batch/watch). Pronto exceto o upsert na DB ([`lib/sink.mjs`](lib/sink.mjs)). O
`--full` fatia por marca; as ~14 marcas densas (Peugeot/Renault/Mercedes/BMW…) saturam o teto de
paginação (~2.500) — corte fino por modelo é frágil (slug do site ≠ config) e ficou por fazer.
**Recência**: sem sort por data (robots) → proxy `days_on_market`. Extras: `price_rating` (AutoScore),
`estimated_price` (preço-justo AutoUncle), `you_save`, `days_on_market`, `seller_type`,
`source_slug`/`source_external_id`, `power_hp`/`power_kw`, `co2`, `model_generation`.

## oparking.pt (investigado — BLOQUEADO, sem coletor)

Agregador/meta-motor português da família **leparking/theparking** (front PT). A hipótese era clonar o
coletor theparking (mesmo motor, mesmo JSON-LD `Vehicle`). **Não avançou: o oparking.pt está atrás de
um Cloudflare "managed challenge" ATIVO** — HTTP 403 (`cf-mitigated: challenge`) em TODOS os pedidos
(`/`, `/robots.txt`, listagens, `/sitemap.xml`), não intermitente, sem `cf_clearance` reutilizável.
HTTP puro (fetch/curl) não passa; exigiria browser headless/impersonação TLS — fora da arquitetura
leve destes coletores. Contraste: o theparking.eu (mesma família) passa a 200 no mesmo dia/UA.
Investigação: [`../../research/oparking-investigacao.md`](../../research/oparking-investigacao.md).

> ✅ **Caminho para o inventário PT desta família:** usar o coletor **theparking** com a fatia
> `portugal` — `theparking.eu/used-cars/portugal.html` serve os anúncios PT por HTTP puro (200),
> mesmo JSON-LD `Vehicle`, `nb_results = 128 281` (≈ os ~128k do oparking.pt), fontes reais
> custojusto.pt/standvirtual.com/olx.pt/autohero.com. (Requer acrescentar `portugal` ao mapa
> `PAISES` do `run-theparking.mjs`.)

## Arquitetura e o "porquê" das decisões

```
lib/                      genérico, partilhado por todos os coletores
  http.mjs                cliente HTTP (UA browser, cookies, rate-limit, retry, guarda robots)
  normalize.mjs           schema-alvo comum + normalizadores (toInt, cleanStr)
  sink.mjs                a costura para a DB (upsert isolado; hoje NDJSON de eventos)
theparking/               JSON-LD Vehicle (agregador, multi-país)
  http · parse · schema · sitemap · crawl · watch · sink   (wrappers finos + específicos)
autotrader/               __NEXT_DATA__ SSR (marketplace NL, stack Scout24)
  http · parse · schema · crawl · watch
autoboerse/               __NEXT_DATA__ SSR (marketplace DE, ~263k, recência real via createdAt)
  http · parse · schema · crawl · watch
autocasion/               JSON-LD Product+Car + card (marketplace ES, ~122k, molde theparking)
  http · parse · schema · crawl · watch
ocasionplus/              JSON-LD ItemList+Vehicle + card (stock próprio ES, ~14k, molde autocasion)
  http · parse · schema · crawl · watch
flexicar/                 __NEXT_DATA__ SSR (stock próprio ES, ~22k; cobertura por facetas do sitemap)
  http · parse · schema · crawl · watch
aramisauto/               __NUXT__ SSR via node:vm (retalhista FR, ~3k; --full por categoria)
  http · parse · schema · crawl · watch
trovit/                   JSON-LD SearchResultsPage + card (agregador ES, molde theparking)
  http · parse · schema · crawl · watch
meinauto/                 __NUXT_DATA__ Nuxt 3 devalue (usados DE ~9k; filtro PRE_OWNED)
  http · parse · schema · crawl · watch
quoka/                    card HTML primário + JSON-LD (classificados P2P DE)
  http · parse · schema · crawl · watch
ooyyo/                    API qselements + SRP server-rendered (agregador BE ~72k)
  http · parse · schema · crawl · watch
autoline/                 card HTML + JSON-LD (Via Mobilis BE; --full por país; ⚠ leilão/comerciais)
  http · parse · schema · crawl · watch
autohero/                 API GraphQL interna (AUTO1 DE ~7k; postGraphql no host wrapper)
  http · parse · schema · crawl · watch
standvirtual/             __NEXT_DATA__ urqlState SSR (líder PT ~42k; API GraphQL robots-proibida)
  http · parse · schema · crawl · watch
olxpt/                    __PRERENDERED_STATE__ SSR (OLX PT ~51k; API /api/ robots-proibida)
  http · parse · schema · crawl · watch
custojusto/               __NEXT_DATA__ SSR (Schibsted PT ~26k; facetas — ?o=N robots-proibida)
  http · parse · schema · crawl · watch
autopt/                   card HTML + JSON-LD (Symfony PT ~16k; join por id via ItemList)
  http · parse · schema · crawl · watch
autosapo/                 card HTML SSR ASP.NET (SAPO PT ~24k; recência via ObjectId; --detail)
  http · parse · schema · crawl · watch
encontracarros/           sitemap + detalhe SSR (agregador PT ~50k; JSON-LD + carListing RSC)
  http · sitemap · parse · schema · crawl · watch
autouncle/                JSON-LD ItemList + RSC __next_f (agregador PT ~99k; molde theparking)
  http · parse · schema · crawl · watch
(oparking/                ⚫ BLOQUEADO — Cloudflare challenge ativo; usar theparking·PT)
run-theparking.mjs / watch-theparking.mjs      CLIs
run-autotrader.mjs / watch-autotrader.mjs      CLIs
run-autoboerse.mjs / watch-autoboerse.mjs      CLIs
run-autocasion.mjs / watch-autocasion.mjs      CLIs
run-ocasionplus.mjs / watch-ocasionplus.mjs    CLIs
run-flexicar.mjs / watch-flexicar.mjs          CLIs
run-aramisauto.mjs / watch-aramisauto.mjs      CLIs
run-trovit.mjs / watch-trovit.mjs              CLIs
run-meinauto.mjs / watch-meinauto.mjs          CLIs
run-quoka.mjs / watch-quoka.mjs                CLIs
run-ooyyo.mjs / watch-ooyyo.mjs                CLIs
run-autoline.mjs / watch-autoline.mjs          CLIs
run-autohero.mjs / watch-autohero.mjs          CLIs
run-standvirtual.mjs / watch-standvirtual.mjs  CLIs
run-olxpt.mjs / watch-olxpt.mjs                CLIs
run-custojusto.mjs / watch-custojusto.mjs      CLIs
run-autopt.mjs / watch-autopt.mjs              CLIs
run-autosapo.mjs / watch-autosapo.mjs          CLIs
run-encontracarros.mjs / watch-encontracarros.mjs  CLIs
run-autouncle.mjs / watch-autouncle.mjs        CLIs
```
Cada site partilha `lib/` (HTTP, normalização, sink/DB) e implementa só o que é específico
(URLs, parse da fonte, mapeamento de campos).

- **HTTP puro, sem browser** — a investigação confirmou que um GET com UA de browser
  passa o Cloudflare (200). Sem Playwright → rápido (66 anúncios em ~4s) e barato.
- **JSON-LD `schema.org/Vehicle`** (27/página) como fonte de dados — estruturado e
  robusto a mudanças de CSS; o site publica-o de propósito para máquinas.
  *Gotcha:* tem quebras de linha literais dentro das strings → sanitizamos antes do
  `JSON.parse` (ver `parse.mjs`).
- **Fonte por card, junta por ID de anúncio** (não por índice) — mais robusto.
- **Paginação por GET** `/used-cars/{path}/{N}.html`; `path` combinável (país, marca,
  país/marca) → segmentação simples.
- **Rate-limit + retry/backoff** — o Cloudflare bloqueia intermitentemente (200 mas
  página vazia); tratamos com `validate` + backoff no `http.mjs`.
- **Dedupe global + checkpoint/resume** — recolhas grandes retomam sem duplicar.
- **Respeita o robots.txt** — nunca pede `/extlink/`, `/tools/`, `/tag/` (guarda em `http.mjs`).
- **Cobertura (`--full`)** — a paginação de um país satura; fatiar país × modelo (seed
  do sitemap) dá muito mais cobertura útil.

### Limitações / notas
- Nível de listagem (rápido). A página de detalhe teria galeria de fotos + vendedor,
  ao custo de ~27× pedidos — não recolhemos (a listagem já traz tudo para comparar preços).
- É agregador → o mesmo carro pode aparecer via fontes diferentes; o dedupe é por
  anúncio do theparking (ID), não por veículo físico entre fontes.
- O `checkpoint.json` guarda o conjunto de IDs vistos; em recolhas `--full` muito
  grandes esse ficheiro cresce (aceitável nesta fase).
