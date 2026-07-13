# AutoScout24 — investigação técnica (spec do coletor)

> Como recolher dados do AutoScout24 — o **maior marketplace pan-europeu** de usados
> (~30M utilizadores/mês, 18 países), a "ponte" que os importadores PT mais usam (a par do
> mobile.de). Data da probe: **2026-07-13**. Método: reconhecimento estático (`curl` + análise
> do `__NEXT_DATA__`).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → **HTTP/2 200**, `x-powered-by: Next.js`,
  nginx + CloudFront, cookie `as24Visitor`. **Sem DataDome/Cloudflare-challenge/Akamai.** →
  **Scrapling NÃO é necessário** (seria mais lento); usamos HTTP puro como os outros 23 coletores.
  Scrapling fica só como contingência documentada se começarem a desafiar sob volume.
- **É a MESMA stack Scout24 do coletor `autotrader.nl`** — o coletor `autotrader/` foi o **molde
  direto**. Mesmo `__NEXT_DATA__`, mesmos campos `vehicle{}`/`vehicleDetails[]`, mesmo cap.
- **Fonte = `__NEXT_DATA__` (SSR).** `props.pageProps.listings[]` (campos ricos) +
  `numberOfResults`/`numberOfPages` + `taxonomy` (marcas/modelos com IDs — seed do `--full`). A API
  interna (`/api/…`, GraphQL) é **robots-disallowed** e desnecessária — o SSR traz tudo.
- **`&size=100` funciona** → 100 anúncios/página (5× o default de 20). Grande ganho de throughput.
- **Cap de ~4.000 registos/query** (com `size=100` → 40 páginas; o teto é de REGISTOS, não de
  páginas — `size` só troca throughput). O faceting mantém cada faceta ≤4.000.
- **Pan-europeu num só domínio** via `cy=`: `cy=D,A,B,E,F,I,L,NL` → **~2.150.605 viaturas**
  (DE=862k). O `countryCode` vem em cada anúncio.
- **Recência REAL** (correção à hipótese pré-probe): o AS24 **expõe** `sort=age&desc=1`
  ("Neueste Angebote zuerst") e um filtro `onlineSince` (1–14 dias). Ao contrário do autotrader.nl,
  o watch apanha inventário **genuinamente novo**, não um proxy.

## Acesso e stack

- **Sem anti-bot ativo:** nginx + CloudFront, cookie Scout24 `as24Visitor`. 200 com UA de browser.
- **Next.js SSR:** `<script id="__NEXT_DATA__">` com `props.pageProps`.
- **Pan-EU:** um único domínio `www.autoscout24.de` cobre todos os países via `cy=` (multi-valor,
  ex. `cy=D,A,B,E,F,I,L,NL`). Cada anúncio traz `location.countryCode` (DE/FR/IT/…). Verificado ao
  vivo: `cy=F` → anúncios com `countryCode=FR`, `cy=I` → `IT`, etc.

## ⚠️ Robots.txt — documentado com TRANSPARÊNCIA

Ao contrário dos outros 23 coletores (robots tolerantes), o `robots.txt` do AutoScout24 é
**restritivo**. Extrato relevante (2026-05, verificado 2026-07-13):

```
User-agent: GPTBot
User-agent: ClaudeBot
User-agent: CCBot
User-agent: Google-Extended
Disallow: /                 # ← bots-IA totalmente bloqueados por nome

User-agent: *
Disallow: /lst?             # ← pesquisa parametrizada base
Disallow: /lst/?
Disallow: /angebote/        # ← páginas de detalhe
Disallow: /*?*cat=*
Disallow: /api/… , /dealerarea/, /favorites, /partner/, /cockpit/, …  # conta/sistema/API
```

- **DECISÃO EXPLÍCITA DO UTILIZADOR:** recolher com **params livres** (`/lst/<marca>?cy=…&size=100`)
  e **UA de browser** (não de bot). Registamo-la aqui abertamente. A recolha ao nível da listagem
  usa o path `/lst/<marca>` (que **não** casa com o `Disallow: /lst?` base) e o `--detail` toca em
  `/angebote/` (desautorizado para `*`) — ambas escolhas conscientes do utilizador.
- **Boa cidadania que MANTEMOS:** a guarda `robotsDisallow` do `lib/http` continua a **bloquear**
  os paths de **conta/sistema e a API interna** — `/api/`, `/dealerarea/`, `/favorites`, `/account`,
  `/cockpit/`, `/partner/`, `/dealer-detail/`, `/listing-search-api/`, `/ocs/api/`, … — nesses
  **NUNCA tocamos** (são privados e desnecessários). Verificado: `assertAllowed` lança para `/api/…`
  e `/ocs/api/graphql`, deixa passar `/lst/bmw` e `/angebote/…`.
- **Ritmo:** rate-limit + jitter + retry/backoff do `lib/http` (default 1500ms, `--rate` ajustável).
  `size=100` **reduz** o nº de pedidos (menos peso). Sem concorrência agressiva.

## Dados por anúncio (`__NEXT_DATA__.props.pageProps.listings[]`)

Página: `https://www.autoscout24.de/lst/<marca>?cy=…&size=100&page=N`. `pageProps` traz
`numberOfResults`, `numberOfPages`, `listings[]` e `taxonomy`. Mapa → schema em
[`tools/collector/autoscout24/schema.mjs`](../tools/collector/autoscout24/schema.mjs):

| Campo listing | → schema | Exemplo |
|---|---|---|
| `vehicle.make` | make | BMW |
| `vehicle.modelGroup` | model | 5er |
| `vehicle.motorTypeName` | variant | 525d |
| `vehicle.variant` | **category** (carroçaria) | Limousine |
| `vehicleDetails[calendar]` / `tracking.firstRegistration` | year / first_registration | 10/2014 → 2014 |
| `vehicle.mileageInKm` | km | "199.000 km" → 199000 |
| `vehicle.fuel` / `transmission` | fuel / gearbox | Diesel / Schaltgetriebe |
| `vehicle.engineDisplacementInCCM` | engine | 1.995 cm³ |
| `vehicleDetails[speedometer]` | power_kw | "160 kW (218 PS)" → 160 |
| `vehicleDetails[leaf]` / `wltpValues[]` | co2 | 130 g/km (komb.) |
| `vehicleDetails[water_drop]` | fuel_consumption | 4,9 l/100 km (komb.) |
| `price.priceRaw` | price | 8890 |
| `location.countryCode` / `zip` / `city` / `street` | country / postalCode / city / street | DE / 57290 / Neunkirchen |
| `seller.companyName` (ou "Particular" se `type=Private`) | source | Telmann Automobile |
| `L.url` | detail_url | /angebote/…-<uuid> |
| `L.images[0]` / `L.images.length` | image / image_count | …webp / 25 |

**Extras próprios do AS24** (guardados no registo): `id` (UUID, dedupe), `seller_type`,
`seller_id`, **`price_evaluation`** (avaliação de MERCADO do próprio AS24, 1=muito bom … 5=alto,
99=s/ dados — **ouro** p/ comparação de preço PT vs. UE), `offer_type` (U/N/J/O/D/S), `is_damaged`,
`super_deal`, `vat_label`, `model_id`, `availability`.

### Cobertura de campos (amostra real, `--make bmw --max-pages 3`, 264 anúncios)

`make/model/variant/fuel/price/country/postalCode/source/id/offer_type/power_kw/co2/seller_type/`
`city/image_count` **100%**; `km` 99%; `year` 96%; `engine` 95%; `price_evaluation` 90%;
`category` 78% (nem todos os anúncios trazem carroçaria ao nível da listagem — completa-se com
`--detail`).

## Página de detalhe (`--detail`, 1 req/anúncio)

`/angebote/…-<uuid>` → também Next.js: `props.pageProps.listingDetails`. Enriquece com (mapa em
[`detail.mjs`](../tools/collector/autoscout24/detail.mjs)): `color`/`doors` (completa os comuns),
`body_type`, `seats`, `upholstery`, `power_hp`, `drivetrain`, `gears`, `cylinders`,
`fuel_consumption_combined` / `co2_detail` (campos `{raw,formatted}`), `first_registration_date`,
`had_accident`, `hsn_tsn`, `license_plate`, **`equipment`** (achatado, ~55 itens/anúncio),
`description`, **`images_all`** (todas as fotos em resolução cheia), **`created_at_listing`**
(data de publicação — só existe no detalhe), `carfax_url` (histórico), `warranty`, `seller_phone`.
Só faz sentido em **fatias estreitas** (o utilizador limita via facetas/`--max-pages`/`--size`).

## Cobertura (`--full`) — faceting adaptativo

- **Dimensões:** `país (cy)` × `marca (taxonomy)` × `faixa-de-preço (pricefrom/priceto)`, `size=100`.
- **Adaptativo:** para cada (país, marca) lê `numberOfResults`; se ≤4.000 → pagina direto; se
  >4.000 → sub-fatia por faixas de preço (lista estática, densas mais finas no baixo-médio). Evita
  facetas desnecessárias nas marcas pequenas. Faixas densas podem ainda saturar — degradação
  aceitável e documentada (igual ao autotrader.nl).
- **Seed sem hardcode:** as marcas (com IDs) vêm da `taxonomy.makesSorted` do próprio
  `__NEXT_DATA__` (sondagem inicial): ~290 marcas.
- **Dedupe global por `id`** (UUID) — o mesmo anúncio surge em facetas sobrepostas. Checkpoint
  guarda facetas feitas + página + ids vistos → `--resume` retoma sem duplicar.
- **Verificado:** `--full --country D --make bmw` deteta DE/BMW = 61.443 > 4.000 → fatia em 21
  faixas de preço; `--resume` estende para a pág. 2 sem duplicar (3.805 linhas == 3.805 ids únicos).

## Recência (watch)

- `sort=age&desc=1` = "Neueste Angebote zuerst" (mais recentes primeiro) — **ordenação real por
  data de publicação**. Opcional `onlineSince=<1..14>` (dias). O watch faz poll da 1ª página por
  país/marca, deteta **novos** e **mudanças de preço**, mantém tabela id→linha. Verificado:
  ciclo 1 = 20 novos, ciclo 2 = 0 novos (+1 mudança de preço), tabela estável.

## Comandos

```bash
# amostra 1 marca (~300 anúncios, size=100)
node run-autoscout24.mjs --make bmw --max-pages 3
# pan-EU (vários países num só comando)
node run-autoscout24.mjs --country D,A,B,E,F,I,L,NL --make bmw --max-pages 1
# cobertura completa pan-EU (adaptativo país×marca×preço)
node run-autoscout24.mjs --full
# fatia + sub-fatia por preço
node run-autoscout24.mjs --full --country D --make bmw --max-pages 2 --resume
# enriquecer (1 req/anúncio) — usar só em fatias estreitas
node run-autoscout24.mjs --detail --make bmw --size 5 --max-pages 1
# recolha contínua (recência real)
node watch-autoscout24.mjs --country D,F --pages 2 --online-since 1
```

Flags batch: `--max-pages` (5), `--size` (100), `--country <cy,…>`, `--make <slug|id>`, `--full`,
`--detail`, `--resume`, `--rate <ms>`, `--out <dir>`.
