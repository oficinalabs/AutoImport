# carplus.pt — investigação técnica (spec do coletor)

> Como recolher dados do carplus.pt (21º coletor). Rede de stands de usados do **Grupo Salvador
> Caetano** (stock próprio, certificado; **só profissional**, sem particulares).
> Data: 2026-07-13. Método: reconhecimento estático (`curl` + análise do payload `__NUXT_DATA__`,
> do JSON-LD e do card HTML).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200 em todas as probes (home, listagem,
  paginação, fatias por marca). **Sem anti-bot** (sem Cloudflare/DataDome; sem challenge).
- **Molde `__NEXT_DATA__`** (autotrader/autoboerse): **fonte ÚNICA e RICA embutida no HTML SSR**. O
  carplus.pt é um **SPA Nuxt 3 com SSR completo** → o HTML traz o payload **`__NUXT_DATA__`** com
  **16 viaturas/página**, cada uma com **~64 campos**.
- ⚠️ **`__NUXT_DATA__` está em formato `devalue`** (array plano com referências por índice), NÃO é
  JSON normal → precisa de um **resolver recursivo** (ver `parse.mjs :: resolveNuxt`).
- **~1.037 usados** (lido do `offerCount` do JSON-LD `Product` e do "RESULTADOS: 1037") ≈ **65 páginas**.
- **Paginação `?page=N`** na rota `/carros-usados/`; a página a seguir à última vem **vazia** (fim).
  A **ordem default é estável** entre pedidos → paginar a listagem geral é **completo**. `--full`
  percorre a listagem geral; `--brand {slug}` é filtro opcional por marca (path).
- **detail_url**: o payload não o traz pronto (só o `vin`) → juntamo-lo do **JSON-LD `Vehicle`**
  (`offers.url` acaba no VIN) por VIN. Fallback: reconstrução do slug a partir dos campos.
- **Recência**: cada viatura tem **`updateTime`** (timestamp de atualização no feed) → sinal de
  recência. ⚠️ o sort por query ("Data Desc.") **não é fiável** em GET puro → watch usa ordem default.

## Acesso

- **Host canónico:** `https://www.carplus.pt`.
- **Sem anti-bot:** 200 com UA de browser, sem challenge; cookie `i18n_redirected=pt`. O `lib/http`
  trata do rate-limit + retry/backoff.
- **robots.txt (13/07/2026) muito tolerante:** para `User-agent: *` só uma regra
  **`Disallow: /backoffice/`** (+ `Sitemap: /sitemap.xml`). A listagem que usamos
  (`/carros-usados/` e `/carros-usados/{marca}/`) é **permitida** — nunca tocamos no `/backoffice/`
  (guarda em `carplus/http.mjs` + `lib/http.mjs`). Sem `Crawl-delay` → rate-limit default do lib.
- Só **PT** (Grupo Salvador Caetano). `country='PORTUGAL'`, `currency='EUR'`.

## Fonte — payload `__NUXT_DATA__` (Nuxt 3, formato devalue)

O HTML SSR traz `<script id="__NUXT_DATA__" type="application/json">` com um **array plano** (devalue):
os objetos referenciam chaves e valores por **índice** no array, logo é preciso resolver. Um nó-viatura
resolvido tem `vin` + `brand` (usamos isso para os detetar). **16 por página.** Mapa (→ `schema.mjs`):

| Campo do payload | → schema | Exemplo |
|---|---|---|
| `brand` | make | Peugeot |
| `model` | model | 2008 |
| `version` / `commercialDescription` | variant | Style 1.2 PureTech 82 CVM5 |
| `year` | year | 2016 |
| `kilometers` | km | 80831 |
| `fuel` | fuel | Gasolina |
| `transmission` | gearbox | Manual |
| `displacement` | **engine** (cilindrada cc) | 1199 |
| `color` | color | Branco |
| `doors` | doors | 5 |
| `pricePvp` (fallback `totalPrice`) | price | 10500 |
| `dealerDistrict` | region | PORTO |
| `installationName` (fallback "Carplus") | source | Carplus PT / Caetano Audi - Aveiro |
| `imageUrl` | image | `d14cwy1v1pw9nw.cloudfront.net/…/[Thumbnail]-{VIN}.webp` |
| `vin` | **id** (dedupe/recência) | VF3CUHMZ6GY139799 |

- **`category` (segmento/carroçaria) fica `null`** — o payload da viatura não o traz (o `segment` só
  existe como *opção de filtro*, não por carro).
- **Extras próprios** guardados de graça: `vin`, `license_plate` (matrícula), `price_pvp`,
  `price_previous` (>0 → houve descida), `monthly_price` + `taeg` (financiamento Credibom),
  `power_cv`, `seats`, `traction`, `environmental_badge`, `electric_range`, `condition` ("Usado"),
  `availability` ("STOCK"), `reserved` (`blockedVehicle`/`reserveType`), `low_cost`, `highlighted`,
  `dealer_district`, `dealer_municipality`, `installation`, `stock` (`SCWSSFA_CARPLUS` /
  `SCWSSFA_RETAIL_PT`), `origin` (retomas/compra grupo), `vehicle_used_type`, `update_time`.

### `source` = stand da rede (exposto)

Sendo rede de stock próprio (sem particulares), **não há `owner_type`**. O `installationName` **está
exposto** e identifica o stand: a maioria é genérico **"Carplus PT"**, mas parte do stock vem de
concessões do grupo (ex. **"Caetano Audi - Aveiro"**, **"Caetano MINI - Faro"**, **"Caetano Renault -
Almada"**). Usamos `source = installationName || 'Carplus'` (+ `dealer_district`/`dealer_municipality`
como extras). `source_site = 'carplus.pt'`.

### Complemento detail_url (JSON-LD por VIN)

O HTML tem 16 blocos JSON-LD `Vehicle` cujo `offers.url` é `/veiculo/{marca}-{modelo}-{versão}-{vin}/`
(VIN em minúsculas no fim). Construímos um mapa **vin→url** e juntamo-lo à viatura por VIN — robusto
contra acentos no slug (Citroën→citroen). Sem par, reconstruímos o slug a partir dos campos (fallback).

## Paginação e cobertura (`--full`)

- **Paginação `?page=N`** na rota `/carros-usados/` (confirmado: p1 vs p2 sem VINs em comum). 16/pág,
  ~65 páginas para os 1.037; **p70 → 0 viaturas** (a página a seguir à última é vazia = sinal de fim).
- **Ordem default ESTÁVEL:** dois fetches da listagem geral devolvem a mesma sequência de VINs →
  paginar a listagem geral é **completo e fiável**. Por isso **`--full` percorre a listagem geral**
  (não fatiado por marca): o path `/carros-usados/{slug}/` só cobre as marcas presentes nos links da
  1ª página (~28), deixando de fora alfa-romeo/land-rover/smart/ds → **lacuna** (medida: `--full`
  fatiado dava só **867/1037**). O **`--brand {slug}`** continua como filtro opcional por marca (ex.
  `/carros-usados/audi/` → 26, todas Audi). Dedupe **global por VIN**.

## ⚠️ Recência (sort por query não fiável)

O "Ordenar por" tem **"Data Asc." / "Data Desc." / "Preço Asc./Desc."** (visível no payload), mas os
parâmetros de sort por query **não alteram a ordem de forma fiável** num GET puro (nas probes deram
resultados inconsistentes/ignorados — a ordenação é aplicada por chamada AJAX à API interna). Decisão
(como autopt/autocasion): o **watch** usa a **ordem default da página 1 como proxy** e aproveita o
campo **`update_time`** de cada viatura como sinal de recência (loga o `max(update_time)` do ciclo). A
captura exaustiva de novos depende do **re-crawl batch** — que aqui é barato (~1k viaturas / ~65 págs).

## API interna (não usada)

O Nuxt hidrata a partir de **`https://api.gsci.pt/ds/`** (Grupo Salvador Caetano) e de um CMS
**`api-carplus-pt-ms.cms.cloud.niw.pt`**. **NÃO a usamos**: a SSR já entrega o payload completo por
página (mais robusto — não depende de contrato de API não-documentado — e mantém-nos no host público
carplus.pt, cujo robots já validámos). `api.gsci.pt/robots.txt` responde JSON de erro (sem regras).

## Verificação (ponta-a-ponta, dados reais — 2026-07-13)

1. `run-carplus.ts --max-pages 3` → **48 anúncios** (12s). Cobertura /48: make/model/variant/year/
   km/fuel/gearbox/color/doors/price/region/source/detail_url/image/vin/license_plate/monthly_price/
   taeg/power_cv/condition/availability/update_time/stock/origin = **48/48**; `engine` 47/48;
   `category` 0/48 (não exposto, por design).
2. `--resume --max-pages 4` → retomou em 48, +16 (p4) sem duplicar (64).
3. `--brand audi --max-pages 3` → **26 anúncios, todos Audi** (path `/carros-usados/audi/`); `source`
   com stands específicos (Caetano Audi - Aveiro/Setúbal/Vila Nova de Gaia).
4. `--full --max-pages 120` → percorre a listagem geral até à página vazia → **catálogo completo**
   (~1.037 viaturas), dedupe global por VIN.
5. `watch-carplus.ts --interval 12 --cycles 2` → ciclo 1: 16 novos; ciclo 2: 0 novos (dedupe);
   `maxUpdate` logado por ciclo.
6. Guarda robots: `assertAllowed` **bloqueia** `/backoffice/…` e **permite** `/carros-usados/…` e
   `/veiculo/…`.

## Ficheiros

- Coletor: `tools/collector/carplus/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-carplus.mjs`, `tools/collector/watch-carplus.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
