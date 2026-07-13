# caetano.pt — investigação técnica (spec do coletor)

> Como recolher o stock de **usados/seminovos** da **Caetano** (rede de retalho do **Grupo Salvador
> Caetano** / Caetano Baviera Portugal — concessionários Caetano Opel/Peugeot/Renault/Hyundai/BMW/
> Mercedes… + Carplus). **Rede de stands, só profissional** (sem particulares).
> Data: 2026-07-13. Método: reconhecimento estático (`curl` + análise do HTML SSR de `/pesquisa/`,
> da config `__CAETANO_VUE_APP__`, do bundle `main.js` da SPA Vue e de probes reais à API JSON).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser → 200 em todas as probes (ao
  `api.gsci.pt` e ao `caetano.pt`). Anti-bot **PASSIVO** (Akamai/CDN) — sem challenge.
- **caetano.pt é WordPress; a pesquisa `/pesquisa/` é uma SPA Vue** ("Digital Store" do Grupo
  Salvador Caetano). O HTML SSR **não traz anúncios** — só a casca + a config em
  `var __CAETANO_VUE_APP__ = {…}` (que revela `api`, `VUE_APP_DIGITAL_STORE_BASE_URL` e
  `VUE_APP_COMPANY_ID: 24`). Os anúncios vêm todos de uma **API JSON interna**:

  ```
  POST https://api.gsci.pt/ds/search/v2?numberElements=250&page=1&showReservation=0&related=false&withUrl=false
  Content-Type: application/json
  companyId: 24            ← OBRIGATÓRIO (sem ele: 400 "Invalid companyId sent.")
  {}                        ← body de filtros (vazio = catálogo de usados completo)
  ```

  Resposta: `{ count, data:{ searchResult[] }, pagination:{ maxPage, totalResults, … } }`. Endpoint,
  parâmetros e header extraídos do bundle `main.js` (axios `baseURL = DIGITAL_STORE_BASE_URL`;
  `Ye="/search/v2"`; `h.post(Ye+"?numberElements="+a+"&page="+t+…)`). **Sem token/cookie** — só o
  header `companyId`.
- **Paginação por `page`** (1-indexed) + `numberElements` (probes: aceita ≥500; usamos **250** →
  ~13 páginas). `pagination.maxPage` diz quando parar.
- **⚠️ O que a pesquisa devolve:** `count = 3200` viaturas, MAS mistura **~28% MOTAS**
  (`vehicleType='MOTORCYCLE'`, BMW Motorrad) e **~1% NOVAS** (`condition='Novo'`) com os usados.
  O alvo são **carros usados** → filtramos do lado do cliente por `vehicleType='CAR'` **E**
  `condition='Usado'` (inclui os `Semi-Novo` e uns raros `Zero KM`). **Resultado real: ~2.359 carros
  usados.** (Filtro no cliente porque não há filtro simples por `vehicleType` num POST puro e o
  volume é trivial — paginar tudo + filtrar é o mais robusto.)
- **Recência (watch):** a API tem `sort=lastVehicleUpdateTime` (`&orderBy=desc`). ⚠️ **Não é
  perfeitamente monotónica** — o `updateTime` é o instante de **SYNC do feed** (muitas viaturas
  partilham o mesmo timestamp de importação), não a data de publicação. Surfa o que foi atualizado há
  menos tempo, mas o sinal fiável do watch é a **deteção de novos VINs / mudanças de preço** entre
  ciclos (molde autopt). O batch pagina na ordem **default** (estável) + dedupe global.
- **Caetano vs. Carplus:** ambos são do Grupo Salvador Caetano e partilham a plataforma Digital
  Store (`api.gsci.pt`). O stock servido pelo `companyId 24` (Caetano) **inclui viaturas cujo
  `installationName='Carplus PT'`** (~17% do total) — é a agregação do grupo. Guardamos o
  `installationName` como `source` (o stand real) e `source_site='caetano.pt'`.

## Acesso

- **Host de DADOS:** `https://api.gsci.pt` (gateway; **sem robots.txt** — responde 404 JSON "no Route
  matched" → nada proibido). É a base do `assertAllowed` do coletor; `/ds/search/v2` é livre.
- **Host do SITE:** `https://caetano.pt` (WordPress). **Só usamos para CONSTRUIR os `detail_url`
  legíveis — nunca os pedimos por HTTP.** `robots.txt`: `User-agent: *` com **apenas**
  `Disallow: /wp-admin/` (+ `Allow: /wp-admin/admin-ajax.php`); `/pesquisa/` é permitida. **Sem
  `Crawl-delay`** em qualquer host → default educado do lib (1500ms + jitter).
- **Anti-bot:** passivo (Akamai) — 200 com UA de browser. Rate-limit + backoff do lib mitigam risco.

## Fonte — viatura da API (`data.searchResult[]`)

Mapa (→ schema em `tools/collector/caetano/schema.mjs`):

| Campo API | → schema | Exemplo |
|---|---|---|
| `brand` | make | Ford |
| `model` | model | Ka+ |
| `version` (fallback `commercialDescription`) | variant | 1.2 Ti-VCT 85cv ULTIMATE |
| `year` | year | 2017 |
| `kilometers` | km | 86130 |
| `fuel` | fuel | Gasolina / Diesel / Elétrico / Híbrido / GPL |
| `transmission` | gearbox | Manual / Automática |
| `displacement` | engine (cilindrada cm³) | 1198 |
| `color` | color | Smoke Grey Metalic |
| `doors` | doors | 5 |
| `pricePvp` (fallback `totalPrice`) | price | 9900 |
| `dealerDistrict` | region (distrito) | LISBOA |
| `installationName` | **source** (stand/instalação) | Carplus PT · Caetano Opel - Porto |
| `vin` | **id** (dedupe/chave natural) + entra no detail_url | MAJUXXMTKUHR37553 |
| slug(brand-model-version)+vin (reconstruído) | detail_url | https://caetano.pt/pesquisa/ford-ka-12-ti-vct-85cv-ultimate-majuxxmtkuhr37553/ |
| `imageUrl` | image | https://d14cwy1v1pw9nw.cloudfront.net/images/… |

- **`country`='PORTUGAL'**, **`currency`='EUR'**, **`owner_type`='empresa'** (rede de stands — nunca
  particular; sem `seller_type` particular). **`postalCode`/`category` = null** (a API dá distrito +
  concelho mas não CP; e não expõe segmento/carroçaria por viatura). `traction`/`environmental_badge`
  vêm quase sempre nulos/UNKNOWN.
- **detail_url:** réplica exata do slug builder da SPA (função `Bo` do bundle): NFD → remove
  diacríticos → remove `[^\w\s-]` → espaços/hífens→`-` → minúsculas, e o VIN em minúsculas. **Resolve
  200** (verificado).
- **Campos numéricos:** arredondados diretamente (`Math.round`), **não** via `toInt` do lib — o
  `toInt` removeria o ponto decimal e colava os dígitos (ex. `monthlyPrice=129.2` → `1292`).
- **Extras ricos:** `vin`, `license_plate`, `dealer`/`dealer_id`/`dealer_municipality`, `condition`,
  `used_type` (Semi-Novo/…), `origin` ("R - Retomas VN"…), `power_cv`, `displacement_cc`, `seats`,
  `traction_4x4`, `electric_range_km`, **`price_previous`** (histórico de preço — ~40% dos carros),
  `monthly_price`, `stock`/`stock_id`, `highlighted`, `availability`, `update_time`.

## Cobertura (batch) e watch

- **Batch (`crawl.mjs`)** — pagina por `page` (250/página, ordem default estável); filtra só carros
  usados no parse:
  - **default:** até `--max-pages` páginas (amostra).
  - **`--full`:** até esgotar `pagination.maxPage` (~13 páginas). Dedupe global por **VIN**,
    checkpoint/resume (nº de páginas feitas), NDJSON, stats. Não há facetas (volume pequeno).
- **Watch (`watch.mjs`)** — poll das primeiras páginas por `sort=lastVehicleUpdateTime&orderBy=desc`;
  novos/price_change por VIN; sinal de deriva = `max(updateTime)` por ciclo.

## Verificação (dados reais, 2026-07-13)

- `run --max-pages 3` → **705 carros usados** (de 750 viaturas; catálogo bruto 3200), 5s. Cobertura
  não-nula: make/model/variant/year/km/fuel/gearbox/color/price/region/source/detail_url/image/vin/
  condition/used_type/**100%**; engine/power/displacement 99%; doors 98%; seats 89%;
  price_previous 40%; category/postalCode/traction/environmental_badge **0%** (por design).
- `--resume`: run 1 pág (216) → `--resume --max-pages 3` continua da pág 2 → **705**, dedupe perfeito
  (705 linhas = 705 VINs únicos). `monthly_price` corrigido (129, não 1292).
- `--full` (completo) → **2.359 carros usados** em 13 páginas, 24s, para no `maxPage=13`, 0 duplicados.
  Preços €9.900–164.900 (média 30.631). Top marcas: Toyota 670, BMW 228, Hyundai 227. Top distritos:
  Porto 940, Lisboa 692, Setúbal 329. Combustível: Gasolina 994, Híbrido 681, Elétrico 314, Diesel 285.
- `watch --interval 12 --cycles 2` → ciclo 1: **247 novos**; ciclo 2: **0** (estado estável); 247
  eventos NDJSON.
- `assertAllowed`: endpoint `/ds/search/v2` **PERMITIDO** (api.gsci.pt sem robots). `detail_url`
  resolve 200.

## Ficheiros

`tools/collector/caetano/{http,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-caetano.mjs` + `tools/collector/watch-caetano.mjs`. Reutiliza `lib/` sem alterar.
