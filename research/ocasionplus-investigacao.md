# ocasionplus.com — investigação técnica (spec do coletor)

> Como recolher dados do ocasionplus.com (5º alvo, após theparking.eu, AutoTrader.nl, autoboerse.de
> e autocasion.com). Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do JSON-LD
> `ItemList` e do card HTML SSR).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Site **Next.js (App Router / RSC)**
  atrás de **CloudFront** — sem challenge/anti-bot em todas as probes → HTTP puro + rate-limit/retry.
- **Molde autocasion/theparking** (JSON-LD como fonte principal + extras do card, juntos por ID),
  **não** o `__NEXT_DATA__` (aqui o RSC vem em `self.__next_f`, sem objeto-por-carro limpo).
- **Fonte principal = 1 bloco `application/ld+json` do tipo `ItemList` = 20 `Vehicle` por página.**
  Cada Vehicle traz make/model/variant/year/km/fuel/gearbox/price/url/image/condition.
- **Faltam ao JSON-LD a REGIÃO/centro e os preços de referência/financiado** → vêm do **card HTML**
  (spans `data-test`). Junção card↔JSON-LD pelo **token no fim do slug** (ex. `…-2024-rtadgqat`).
- **~13.700 anúncios ES** (lido do `AggregateOffer.offerCount`: 13696; título do site diz "+20.000",
  inclui km0/motos noutras secções). Retalhista único (cadeia OcasionPlus, ~120 centros em Espanha).
- **Paginação `?page=N`** (20/pág); rota `/coches-segunda-mano`. `--full` fatia por marca via **path**
  `/coches-segunda-mano/{marca}` (76 slugs de `/marcas`).
- **⚠️ Recência:** sem sort por data utilizável (o `?sort=` é proibido pelo robots) e o id é um token
  alfanumérico (NÃO crescente). Watch usa a ordem default da página 1 como proxy.

## Acesso

- **Host canónico:** `https://www.ocasionplus.com`.
- **Stack:** Next.js (`x-powered-by: Next.js`, App Router com stream RSC `self.__next_f`) servido por
  **CloudFront** (`x-cache: … from cloudfront`; `cache-control: s-maxage=300`). 200 com UA de browser,
  sem challenge. Rate-limit + backoff (já no lib) mitigam o risco sob volume. `acceptLanguage` es-ES.
- **robots.txt — cuidado, os disallow são quase todos por QUERY-STRING:** `*?marca=*`, `*?modelo=*`,
  `*?combustible=*`, `*?cambio=*`, `*?price_min/max=*`, `*?km_min/max=*`, `*?carroceria=*`,
  `*?year_min/max=*`, `*?sort=*`, `*?location=*`, `*?type=*`, `*?gallery=*`, `/*tipo=`. Mais alguns
  por **sufixo de ação**: `/coches-segunda-mano/*/mas-info`, `.../pedir-cita`, `.../quiero-reservarlo`,
  `*/print/`, `*/search`. Um único **prefixo de path**: `/vender-mi-coche/cambio/`.
  → A nossa recolha **NUNCA usa filtros por query** (só `?page=N`, que **é permitido**) e fatia só por
  **path** (`/coches-segunda-mano/{marca}`). O guard `assertAllowed` (lib) bloqueia
  `/vender-mi-coche/cambio/`; os padrões por query/sufixo são honrados por construção.
- **llms.txt:** o site declara autorização explícita para uso de dados públicos por Anthropic (entre
  outros) e lista `/coches-segunda-mano` como secção incluída na autorização.

## Fonte 1 — JSON-LD `ItemList` → `Vehicle`

Um bloco `<script type="application/ld+json">` do tipo `ItemList` por página = **20 `Vehicle`** em
`itemListElement`. Mapa (→ schema em `tools/collector/ocasionplus/schema.mjs`):

| Campo JSON-LD | → schema | Exemplo |
|---|---|---|
| `brand.name` | make | Skoda |
| `name` (menos a marca) | model | Karoq |
| `model` (título completo) | variant | Skoda Karoq 2.0 TDI Selection (115 CV) |
| `productionDate` (slice do ano) | year | 2024 |
| `mileageFromOdometer.value` | km | 30888 |
| `fuelType` | fuel | Diésel |
| `vehicleTransmission` | gearbox | MANUAL |
| `offers.price` / `offers.priceCurrency` | **price** / currency | 24800 / EUR |
| `offers.itemCondition` | condition | UsedCondition |
| `offers.url` | detail_url | …/skoda-karoq-…-2024-rtadgqat |
| `image` | image | https://img.ocasionplus.com/…jpg |
| (token do fim do slug) | **id** (dedupe) | rtadgqat |
| ("(115 CV)" no título) | **power_hp** | 115 |

- **Sem cilindrada, cor, portas, carroçaria nem região** no JSON-LD → `engine/color/doors/category/
  postalCode = null`; `region`/`center` e os preços extra vêm do card (fonte 2).
- **GOTCHA do ano:** `productionDate` é ISO (`2024-04-03T00:00:00.000Z`) — extraímos os 4 primeiros
  dígitos (NÃO `toInt`, que colaria toda a data).
- **GOTCHA do JSON (como no theparking):** sanitizamos caracteres de controlo (0x00–0x1f) antes do
  `JSON.parse`.

### GOTCHA do preço — três números

O card mostra **PVP de referência riscado** (`span-price`, ex. 29.100€), **preço financiado**
(`span-finance`, ex. 22.546€, o destaque grande) e uma **cuota €/mes**. O **preço canónico** é o
`offers.price` do JSON-LD (ex. 24.800 — o **preço al contado**), confirmado na página de detalhe onde
`24800` domina (20 ocorrências) vs. `22546` (3) e `29100` (2). Usamos `offers.price` como `price` e
guardamos os outros como extras (`price_reference`, `price_finance`, `monthly`).

## Fonte 2 — card HTML (`region`, `center`, preços extra)

Cada card é um `<div class="cardVehicle-module-scss-module__…__card">` com **spans `data-test`**:
`span-brand-model`, `span-version`, `span-price` (PVP), `span-finance` (financiado),
`span-finace-quote` (cuota — o typo "finace" é do próprio site), `span-registration-date`, `span-km`,
`span-fuel-type`, `span-engine-transmission`, e `div-dealer` (o **centro**, ex. "Toledo - Olías del
Rey"). Junta-se ao JSON-LD pelo **token do slug** (`href` do card ↔ `offers.url` do JSON-LD).

- **`region`** = província = 1º segmento do centro antes de " - " (ex. "Toledo", "La Coruña").
- **`center`** = string completa do `div-dealer` (extra próprio).
- **`price_reference`** (span-price), **`price_finance`** (span-finance), **`monthly`** (cuota).

Cobertura medida (amostra de 60): make/model/variant/year/km/fuel/gearbox/price/region/center/
detail_url/image/power_hp/condition **60/60**; `price_reference` 54/60 (nem todo tem PVP riscado);
`monthly` 55/60 (nem todo tem cuota); `price_finance` 60/60.

## Paginação e cobertura (`--full`)

- **Paginação `?page=N`** (confirmado: p1 vs p2 sem sobreposição de anúncios reais; `?page=800` → 0
  Vehicle, corte limpo). Rota geral `/coches-segunda-mano` (offerCount 13696 ⇒ ~685 páginas).
- **`--full` por marca via PATH:** `/coches-segunda-mano/{marca}` (ex. `/coches-segunda-mano/audi` →
  **só AUDI**, offerCount 594, pagina com `?page=N`). Os **76 slugs de marca** vêm da página `/marcas`
  (primeiros-segmentos que têm filhos de modelo `/{marca}/{modelo}` — critério que exclui províncias e
  carroçarias, também presentes como single-segment). Seed do `--full`.
- Marcas densas (Peugeot/Volkswagen/Seat) podem ainda saturar o cap de paginação; o corte fino
  seguinte seria por **modelo** (path `/{marca}/{modelo}`, disponível) — não implementado.
- **NÃO usar filtros por query** (`?marca=`, `?sort=`, …): TODOS proibidos pelo robots.

## ⚠️ Recência (como o AutoTrader/autocasion)

O "Ordenar" do OcasionPlus é por query `?sort=`, **proibida pelo robots** — não a usamos. A listagem
default vem por `itemListOrder: Relevance` e o id é um **token alfanumérico** (NÃO crescente por data),
pelo que **não há sinal numérico de recência**. O watch usa a **ordem default da página 1 como proxy**
e loga o `id` do topo por ciclo (marcador de deriva). Captura exaustiva de novos depende do **re-crawl
batch periódico**. (Mesma decisão do AutoTrader/autocasion.)

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-ocasionplus.ts --max-pages 3` → **60 anúncios** ES (3s), com `price`, `make/model`, `year`,
   `km`, `fuel`, `gearbox`, `region`, `center`, `power_hp`, `image` preenchidos 60/60.
2. `--resume --max-pages 5` → retomou em 60, +40 (p4+p5) sem duplicar (**100 linhas = 100 ids únicos**).
3. `--brand audi --max-pages 2` → **40 anúncios, todos AUDI** (via path `/coches-segunda-mano/audi`).
4. `watch-ocasionplus.ts --interval 12 --cycles 2` → ciclo 1: 20 novos; ciclo 2: **0 novos** (dedupe).
5. Guarda robots: `/coches-segunda-mano`, `/coches-segunda-mano/audi` e `?page=5` **permitidos**;
   `/vender-mi-coche/cambio/*` **bloqueado**. Só emitimos paths de listagem + `?page` (sem query-filtros).
6. `--full` seed: **76 slugs de marca** extraídos de `/marcas`.

## Ficheiros

- Coletor: `tools/collector/ocasionplus/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-ocasionplus.mjs`, `tools/collector/watch-ocasionplus.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
