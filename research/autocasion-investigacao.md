# autocasion.com — investigação técnica (spec do coletor)

> Como recolher dados do autocasion.com (4º alvo, após theparking.eu, AutoTrader.nl e autoboerse.de).
> Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do JSON-LD e do card HTML).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Anti-bot **Cloudflare PASSIVO**
  (server: cloudflare, cf-cache DYNAMIC; backend PHP/PHPSESSID) — sem challenge em todas as probes.
- **Molde theparking** (JSON-LD + extras do card, juntos por ID), **não** o `__NEXT_DATA__` do
  autotrader/autoboerse. Mesma família OParking/theparking já validada.
- **Fonte principal = 1 bloco `application/ld+json` por página = array de 26 `Product`.** Cada
  Product tem `offers.itemOffered` = `Car` com `EngineSpecification` embutido.
- **Faltam ao JSON-LD `fuel`, região e dealer** → vêm do **card HTML** (padrão theparking).
- **~122.700 anúncios ES** (lido do HTML: "122.702 Coches"; bem mais que a estimativa antiga de ~60k).
- **Paginação `?page=N`**; rota `/coches-ocasion`. `--full` fatia por marca via páginas SEO
  `/coches-segunda-mano/{marca}-ocasion`.
- **⚠️ Recência (como o AutoTrader):** o "Ordenar" só tem Relevancia + Preço — **sem sort por data**.

## Acesso

- **Host canónico:** `https://www.autocasion.com`.
- **Anti-bot Cloudflare passivo:** 200 com UA de browser, sem challenge. Cookies (PHPSESSID)
  guardados pelo `lib/http`. Rate-limit + backoff (já no lib) mitigam o risco sob volume.
- **robots.txt tolerante:** bloqueia `/api/`, `/movil*`, `/pixel`, `/rate*`, `/rated*`,
  `/ads/galeria/*`, `/cdn-cgi/`, `/index2.php` e prefixos de filtros por query. A listagem que
  usamos (`/coches-ocasion`, `/coches-segunda-mano/*-ocasion`) é **permitida** — nunca tocamos os
  disallow (guarda em `autocasion/http.mjs` + `lib/http.mjs`).
- Só **ES** (grupo Sumauto, parceiro da AutoScout24).

## Fonte 1 — JSON-LD `Product` + `itemOffered` (`Car`)

Um bloco `<script type="application/ld+json">` por página = **array de 26 `Product`**. Mapa
(→ schema em `tools/collector/autocasion/schema.mjs`):

| Campo JSON-LD | → schema | Exemplo |
|---|---|---|
| `brand.name` | make | MERCEDES-BENZ |
| `itemOffered.model` | model | EQS |
| `name` | variant | MERCEDES-BENZ EQS EQS 450+ |
| `itemOffered.productionDate` | year | 2023 |
| `itemOffered.mileageFromOdometer.value` | km | 50 |
| `itemOffered.vehicleTransmission` | gearbox | Automático |
| `itemOffered.color` | color | Gris |
| `itemOffered.numberOfDoors` | doors | 6 |
| `itemOffered.bodyType` | **category** (carroçaria) | Berlina mediana o grande |
| `itemOffered.vehicleEngine.enginePower.value` (BHP) | **power_hp** | 333 |
| `offers.price` / `offers.priceCurrency` | price / currency | 100900 / EUR |
| `offers.itemCondition` | condition | UsedCondition |
| `offers.url` | detail_url | …/mercedes-benz-eqs-ocasion/eqs-450-ref20604635 |
| `image[0]` | image | https://images0.autocasion.com/…jpg |
| `itemOffered.identifier` | **id** (dedupe / recência) | 20604635 |

- **Sem `fuel`, sem cilindrada, sem região/dealer** no JSON-LD → `engine=null`; `fuel`/`region`/
  `source` vêm do card (fonte 2).
- **GOTCHA (como no theparking):** sanitizamos caracteres de controlo (0x00–0x1f) dentro das
  strings antes do `JSON.parse` (ver `parse.mjs`).

## Fonte 2 — card HTML (`fuel`, região, dealer)

Cada card é um `<article class="anuncio">` com `data-product-key={identifier}`. Junta-se ao
JSON-LD pelo `identifier` (= o `ref…` do URL / o `data-product-key`).

- **`<ul>` de detalhes** (o único do card): `[ano, combustível, km, província]`, ex.
  `2023 · Eléctrico · 50 km · Córdoba`. Cards "Km0" metem um badge extra que desloca os índices →
  identificamos por **padrão** (ano `^\d{4}$`, km `\d+ km`, combustível por vocabulário), não por
  posição. Daí tiramos **`fuel`** e **`region`** (a província). `year`/`km` vêm do JSON-LD.
- **`<div class="concesionario">`**: `<p><span>NOME</span><span class="circulo …">4,0 / 5</span></p>`
  → **`dealer`** (= `source`) e **`dealer_rating`** (float). Cards de particular não têm este bloco.
- **`<p class="certificado">🏅 Certificado por …</p>`** → flag **`certified`**.

Cobertura medida (amostra de 76): `fuel` 76/76, `region` 76/76, `source`(dealer) 76/76,
`power_hp` 69/76, `image` 76/76, `dealer_rating` 35/76 (nem todo o dealer tem rating).

## Paginação e cobertura (`--full`)

- **Paginação `?page=N`** (confirmado: p1 vs p2 = 0 refs em comum). Rota `/coches-ocasion`.
  `/{marca}` no path dá 404.
- **`--full` por marca:** o site expõe páginas SEO **`/coches-segunda-mano/{marca}-ocasion`**
  (ex. `/coches-segunda-mano/audi-ocasion` → **só AUDI**, pagina com `?page=N`). **~115 slugs de
  marca** extraíveis dos links da 1ª página (a lookahead exige que o segmento termine mesmo em
  `-ocasion`, excluindo os URLs de detalhe `…-ocasion/…`) → seed do `--full`.
- Marcas densas (SEAT/Volkswagen/BMW/Audi) podem ainda saturar o cap de paginação; o corte fino
  seguinte seria por modelo/preço (não implementado).

## ⚠️ Recência (como o AutoTrader)

O controlo "Ordenar" só tem Relevancia + Preço — **sem sort por data**. O watch usa a **ordem
default (Relevancia) da página 1 como proxy**; o `identifier` (id crescente = mais recente) serve
de sinal de recência: o watch loga o `max(identifier)` por ciclo para priorizar/detetar deriva.
Captura exaustiva de novos depende do **re-crawl batch periódico**. (Mesma decisão do AutoTrader.)

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-autocasion.ts --max-pages 3` → **76 anúncios** ES (5s), com `price`, `make/model`, `year`,
   `km`, `fuel`, `gearbox`, `region`, `source`(dealer), `power_hp`, `image` preenchidos.
2. `--resume --max-pages 4` → retomou em 76, +25 (p4) sem duplicar (101).
3. `--brand audi --max-pages 2` → **50 anúncios, todos AUDI** (via SEO `/…/audi-ocasion`).
4. `watch-autocasion.ts --interval 12 --cycles 2` → ciclo 1: 26 novos; ciclo 2: 0 novos (dedupe).
5. Guarda robots: pedidos a `/api/`, `/movil`, `/cdn-cgi/`, `/index2.php` são bloqueados; a listagem passa.
6. Junção card↔JSON-LD: `fuel` e `region` preenchidos em 76/76.

## Ficheiros

- Coletor: `tools/collector/autocasion/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-autocasion.mjs`, `tools/collector/watch-autocasion.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
