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
run-theparking.mjs / watch-theparking.mjs      CLIs
run-autotrader.mjs / watch-autotrader.mjs      CLIs
run-autoboerse.mjs / watch-autoboerse.mjs      CLIs
run-autocasion.mjs / watch-autocasion.mjs      CLIs
run-ocasionplus.mjs / watch-ocasionplus.mjs    CLIs
run-flexicar.mjs / watch-flexicar.mjs          CLIs
run-aramisauto.mjs / watch-aramisauto.mjs      CLIs
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
