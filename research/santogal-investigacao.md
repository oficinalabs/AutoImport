# santogal.pt — investigação técnica (spec do coletor)

> Como recolher dados do santogal.pt (rede de stands PT, stock próprio, multimarca).
> Data: 2026-07-13. Método: reconhecimento estático (`curl` + análise dos cards SSR).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Anti-bot **Cloudflare PASSIVO**
  (server: cloudflare; a raiz faz 307 → `/pt/`) — sem challenge em todas as probes.
- **Molde quoka/autopt** (CARD HTML como fonte PRINCIPAL). **NÃO há JSON-LD útil por anúncio**: o
  único bloco `application/ld+json` da página é uma `Organization` (dados do site, não dos carros).
- **Fonte = card SSR `<div class="card_car …">`** (Umbraco, **40/página**). Cada card traz um
  `data-push-object` (JSON de analytics) + corpo com marca/modelo/km/ano/combustível/cor/preço.
- **~1.538 viaturas usadas** (lido do HTML: "Encontrados 1538 veículos"). ⚠️ A estimativa antiga de
  ~3.800 era o **stock total** (novos + usados + serviço), não só usados.
- **Rede de stands (stock próprio, só profissional):** `source='Santogal'`, `owner_type='empresa'`,
  sem particulares. O stand específico da rede **não** é exposto no card.
- **Paginação `?pagina=N`** (até ~39); rota `/pt/search-page/?querytext=Usados&vehicletype=car`.
- **⚠️ Recência (como o autopt/autocasion):** o "Ordenar por" só tem Marca/Preço/Ano/Km — **sem sort
  por data**. Watch usa ordem default (proxy) + `max(carroId)` como sinal de deriva.

## Acesso

- **Host canónico:** `https://www.santogal.pt` (a raiz `santogal.pt/` faz 307 → `/pt/`).
- **Anti-bot Cloudflare passivo:** 200 com UA de browser, sem challenge. Cookies guardados pelo
  `lib/http`. Rate-limit + backoff (já no lib) mitigam o risco sob volume.
- **robots.txt TOTALMENTE permissivo:** `User-agent: *` com `Disallow:` **vazio** (nada proibido);
  só declara o `Sitemap:`. A listagem que usamos é permitida — a lista de disallow em
  `santogal/http.mjs` fica vazia (nada a bloquear). **Sem Crawl-delay** → rate-limit default do lib.
- **Não há API JSON interna** de listagem: as facetas (marca/cor/ano/preço) e a ordenação são
  aplicadas via JS/AJAX; num GET puro só funcionam o `querytext`, o `vehicletype` e a `pagina`.

## Fonte — card SSR `<div class="card_car">`

Um card por anúncio (**40/página**). Mapa (→ schema em `tools/collector/santogal/schema.mjs`):

| Origem no card | → schema | Exemplo |
|---|---|---|
| `data-detail-url` (último segmento nº) / `data-push-object.carroId` | **id** (dedupe/recência) | 3073194 |
| `data-id` | node_id (nó Umbraco) | 787351 |
| `<h2 class="brand_label">` / `data-vehicle-brand` | make | BMW |
| `<h3 class="model_label">` (1º token → model) | model / **variant** | X2 / "X2 18 i sDrive Advantage" |
| `col-info-car` › `icon-year` | year | 2021 |
| `col-info-car` › `icon-km` | km | 70381 ("70.381 kms") |
| `col-info-car` › `icon-fuel` / push `Combustível` | fuel | Gasolina |
| `col-info-car` › `icon-color` | color | Preto |
| `<span class="price">` | price | 26490 |
| `<span class="first-price">` (se ≠ `&nbsp;`) | **price_old** (riscado) | 40990 |
| 1º `<img src="/media/…">` | image | /media/45f…/foto_3073194_….jpg |
| `data-push-object.tipoCarro` | condition | Usado |
| `data-vehicle-src` | vehicle_src | G |

- **Campos identificados por ícone, não por posição:** cada valor está no `<span>` a seguir ao
  `<i data-id="icon-{km|fuel|year|color}">` → robusto à ordem.
- **⚠️ GOTCHA do preço:** o `€` vem como `&#x20AC;`, cujos dígitos "20" contaminavam o número
  ("26.490€" → 2649020). Removemos as entidades HTML **antes** de extrair os dígitos (ver
  `parse.mjs`). A imagem traz `&amp;` nos params → decodificada no schema.
- **model vs. variant:** o site junta modelo+variante no `model_label` ("X2 18 i sDrive Advantage").
  Não há campo de modelo isolado na listagem → `model` = 1º token (best-effort: "X2", "e-C4",
  "500e") e `variant` = texto completo.
- **Sem gearbox/cilindrada/portas/segmento/região no card** → `gearbox`/`engine`/`doors`/`category`/
  `region` = `null` (só na página de detalhe, que **também não tem JSON-LD**).

Cobertura medida (amostra de 40, p1): `id`/`make`/`model`/`variant`/`year`/`km`/`fuel`/`color`/
`price`/`detail_url`/`image`/`node_id`/`condition` = **40/40**. Combustível vem já detalhado
("Elétrico", "Mild Híbrido Gasolina", "Híbrido Plugin Gasolina", …).

## Paginação e cobertura (`--full`)

- **Paginação `?pagina=N`** (confirmado: p1 vs p2 = 0 carroIds em comum). Rota
  `/pt/search-page/?querytext=Usados&vehicletype=car`.
- **Fim real:** 40/página; **p39 = 30 cards; p40 = 0** (vazia) → ~1.538 usados. Universo PEQUENO.
- **`--full` PAGINA TUDO numa só query** (~39 páginas) — ao contrário do autopt/autocasion (16k/122k)
  não é preciso fatiar por marca. Salvaguarda `CAP_PAGINAS=80`; a listagem esgota antes (páginas
  vazias → break).
- **Slice opcional `--make {MARCA}`:** o `querytext` combina os termos em **AND**, logo
  `querytext=Usados BMW` devolve **só BMW usados** (confirmado: 398 resultados, 100% BMW/Usado;
  pagina com `&pagina=N`).

## ⚠️ Recência (como o autopt/autocasion)

O "Ordenar por" só oferece Marca/Preço/Ano/Quilómetros — **sem sort por data** (e os params de
ordenação/faceta só funcionam via JS, não por GET; testados `ordenar=`/`orderby=`/`sort=` → ignorados).
O `data-cacheddate` do card é a **hora de geração do cache** (idêntica em todos os cards), **não** a
data do anúncio → inútil como recência. O watch usa a **ordem default ("destaque") da página 1 como
proxy** e loga o `max(carroId)` por ciclo (id de stock crescente = mais recente) como sinal de
deriva. Captura exaustiva de novos depende do **re-crawl batch periódico**.

## Verificação (ponta-a-ponta, dados reais — 2026-07-13)

1. `run-santogal.mjs --max-pages 3` → **119 anúncios** (40+40+39, 5s), todos `Usado`, com `price`,
   `make/model`, `year`, `km`, `fuel`, `color`, `image`, `detail_url` preenchidos a 40/40.
2. `--resume --max-pages 4` → retomou em p4, +38, **157 registos, 157 ids únicos** (0 duplicados).
3. `--make BMW --max-pages 2` → **77 anúncios, 100% BMW** (via `querytext=Usados BMW`).
4. `watch-santogal.mjs --interval 12 --cycles 2` → ciclo 1: 40 novos; ciclo 2: 0 novos (dedupe pela
   tabela de estado); `maxCarroId` logado como sinal de recência; eventos escritos no sink.
5. Guarda `assertAllowed`: a listagem passa (robots.txt sem disallow → nada bloqueado).
6. Preço com desconto correto: 1 card com `first-price` → `price=39990`, `price_old=40990`.

## Ficheiros

- Coletor: `tools/collector/santogal/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-santogal.mjs`, `tools/collector/watch-santogal.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
