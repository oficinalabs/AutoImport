# quoka.de — investigação técnica (spec do coletor)

> Como recolher anúncios de carros do quoka.de (8º alvo, após theparking.eu, AutoTrader.nl,
> autoboerse.de, autocasion.com, ocasionplus, flexicar e aramisauto).
> Data: 2026-07-11. Método: reconhecimento estático (`curl` com UA de browser + análise do
> JSON-LD `ItemList` e do card HTML `article-item`).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl` com UA de browser → 200. Anti-bot **Cloudflare PASSIVO**
  (`server: cloudflare`; cookie `SearchAiBrowserBucket` só de sessão) — **sem challenge** em
  todas as probes. HTTP puro + rate-limit/backoff do `lib` chegam.
- **Molde theparking/autocasion** (JSON-LD + extras do card HTML, juntos por ID), **não** o
  `__NEXT_DATA__` do autotrader/autoboerse. Aqui o **card HTML é a fonte PRINCIPAL** (mais rico)
  e o JSON-LD é complementar (dá a cilindrada, que o card não tem).
- **Fonte 1 = 1 bloco `application/ld+json` = `ItemList` com 20 `Vehicle`.** Traz por anúncio:
  `name`, `description`, `url` (com o id/hash), `image`, `offers.price/priceCurrency`,
  `vehicleModelDate` (ano), `fuelType`, `vehicleEngine.engineDisplacement` (cilindrada, cm³).
- **Fonte 2 = card `<div class="article-item">` (20/página + ~1 Premium promovido).** Traz:
  título (make/model em texto livre), descrição, `ano | combustível | km` (linha
  `article-short-info`), `cidade, Bundesland` (`article-location`), **data de publicação**
  (`article-date`, ex. "heute 21:02"), preço (e preço antigo se houve descida), nº de fotos,
  id/hash (join com o JSON-LD), UUID (`data-articleid`), badge Premium e "telefone verificado".
- **P2P (classificados de particulares).** O card **não nomeia o vendedor** → `source` fica
  `'particular'`. Há um filtro `?commercial=true/false` para separar comercial/privado, mas o
  card não marca por anúncio. Cobertura de `gearbox`/`color`/`doors` é baixa (não estruturados na
  listagem — só aparecem em texto livre na descrição).
- **Rota da secção de carros:** `/anzeigen/auto-motorrad/automarkt/`. **Paginação `?pag=N`**
  (o site anuncia 51 258 páginas × 20 ≈ **1 025 141 anúncios** no contador `resultscount` — número
  provavelmente inflacionado/global; ver nota abaixo).
- **`--full` fatia por MARCA** via `/anzeigen/auto-motorrad/automarkt/{marca}/?pag=N` (ex.
  `.../automarkt/volkswagen/` → só VW, `resultscount` 172 150). Os slugs de marca vêm dos links
  da 1ª página (filtrando os 16 Bundesländer, que partilham o mesmo padrão de path).
- **✅ Recência REAL para o watch:** o sort default é **`date` ("Neueste Anzeigen")** e cada card
  traz `article-date` ("heute HH:MM" para os de hoje). A página 1 são os mais recentes (à parte
  de ~1 card Premium promovido no topo) → deteção de novos fiável.

## Acesso

- **Host canónico:** `https://www.quoka.de` (o topo sem `www` redireciona; usamos `www`).
- **Anti-bot Cloudflare passivo:** 200 com UA de browser, sem challenge. Cookies de sessão
  guardados pelo `lib/http`. Rate-limit + backoff (já no `lib`) mitigam o risco sob volume.
- **robots.txt:** `User-agent: *` → `Allow: /` com uma lista de `Disallow`. A rota que usamos
  (`/anzeigen/...`) **é permitida**. Bloqueados (guardados em `quoka/http.mjs`): `/Suchergebnis/`,
  `/Suchergebnis_AlternativesErgebnis/`, `/Suchergebnis_RegionalErweitert/`, `/Detailansicht/`,
  `/Detailansicht-Archiv/`, `/Bildansicht/`, `/Qinterest/`, `/registration`, `/outgoing/`,
  `/ajax/`, `/xml/`, `/libs/`, `/tools/`, `/qs/`, `/qpi/`, `/message-*`, e vários paths ofuscados.
  O `msnbot`/`bingbot` têm `Crawl-delay: 1`; não há Crawl-delay para `*` → honramos o default do
  `lib` (1500 ms + jitter), bem acima de 1 s.
- Só **DE** (alemão, `de-DE`).

## Fonte 1 — JSON-LD `ItemList` → `Vehicle`

Um bloco `<script type="application/ld+json">` por página = **`ItemList` com 20 `Vehicle`**.
Cobre os 20 cards regulares (NÃO o card Premium promovido, que fica só no HTML). Mapa:

| Campo JSON-LD | → uso | Exemplo |
|---|---|---|
| `name` | fallback de título | "Vw up bj 2014 tüv 2027 km 163000 3500" |
| `url` | id/hash (join) + `detail_url` | `.../anzeige/{slug}/{hash}.html` |
| `image[].contentUrl` | fallback de imagem | `https://s3.quoka.de/...webp` |
| `offers.price` / `priceCurrency` | fallback de preço | 3500.00 / EUR |
| `vehicleModelDate` | fallback de `year` | 2014 |
| `fuelType` | fallback de `fuel` | benzin |
| `vehicleEngine.engineDisplacement.value` (CMQ=cm³) | **`engine`** (cc) | 999 |

**GOTCHA:** o JSON-LD mete quebras de linha/tabs literais dentro das strings → JSON inválido.
Sanitizamos os caracteres de controlo (`\x00-\x1f` → espaço) antes de `JSON.parse` (igual ao
theparking/autocasion).

## Fonte 2 — card HTML `div.article-item` (PRINCIPAL)

Dividimos o HTML nos inícios de cada `class="article-item"` (o Premium usa `article-item`, os
regulares `article-item ` com espaço) e analisamos o pedaço de cada card:

| Elemento do card | → schema/extra | Exemplo |
|---|---|---|
| `.../anzeige/.../{hash}.html` (href/`location`) | `id` (hash 32c) + `detail_url` | `670293...1076` |
| `data-articleid` | `article_id` (UUID) | `34796024-8C3A-...` |
| `h2.article-title > a` | `variant` (título) + `make`/`model` (texto livre) | "VW T4 2,5 TDI…" |
| `p.article-description` | `description` (extra) | "Erstzulassung 09 2001…" |
| `article-short-info` "AAAA \| combust \| NNN km" | `year`, `fuel`, `km` | 2001 \| diesel \| 372000 km |
| `p.article-location > span` "Cidade, Bundesland" | `city` (extra) + `region` | Dachau, Bayern |
| `p.article-date > span` | `listing_date` (recência) | "heute 21:02" / "29 Juni" |
| `span.article-price` (texto "3 500 EUR") | `price` | 3500 |
| `span.new-price` / `span.old-price` | `price` / `price_old` (descida) | 5490 / 7490 |
| `.article-img-count-number` | `images` (nº fotos) | 10 |
| `.art-promoted` "Premium" | `premium` (bool) | true |
| `.article-lbl-validated-phone` | `verified_phone` (bool) | true |

### make/model — limitação honesta (P2P)

Não há campo estruturado de marca/modelo. Estratégia:
- **`--full` / `--brand`:** a marca vem do slug da query (`/automarkt/{marca}/`) → `make` 100%.
- **Listagem geral:** `make` por correspondência do título contra um dicionário de marcas
  conhecidas (com alias `VW`→Volkswagen, `Mercedes`→Mercedes-Benz). `model` = token seguinte ao
  match. Cobertura **parcial**: títulos como "keines Auto" ou "A Klasee 170" não têm marca
  reconhecível. Medido abaixo.

## Volume

- Contador `resultscount = 1 025 141` no `/automarkt/` e 51 258 páginas de paginação. Este número
  parece **inflacionado/global** (é pouco plausível 1 M de carros num classificados alemão); tomamo-lo
  como o valor **declarado pelo site**, não como verdade auditada. O `--full` por marca dá cortes
  mais fiáveis (VW 172 150, etc.), embora também elevados. Como nos outros coletores, a paginação
  satura antes do fim → cobertura real vem do fatiamento por marca (e, no futuro, por marca+região).

## Recência (watch)

- Sort default = `date` ("Neueste Anzeigen"); confirmado que `?sort=date` devolve o mesmo conjunto
  da página default. `article-date` = "heute HH:MM" (hoje) ou "DD Monat". A página 1 são os mais
  recentes (excepto ~1 card Premium fixo no topo, deduplicado pelo id). → **deteção de novos fiável**,
  ao contrário do AutoTrader/autocasion.
- Cards Premium repetem-se entre páginas (overlap p1∩p2 = 1, só o Premium) → o dedupe por `id` trata.

## Mapeamento → registo comum (`CAMPOS_BASE`)

| CAMPOS_BASE | origem |
|---|---|
| make | brandHint (query) OU dicionário sobre o título |
| model | best-effort (token após a marca no título) |
| variant | título completo do card |
| year | `article-short-info` (ou `vehicleModelDate`) |
| km | `article-short-info` |
| fuel | `article-short-info` (ou `fuelType`) |
| gearbox | best-effort (regex "Schaltgetriebe/Automatik" na descrição) — cobertura baixa |
| engine | `engineDisplacement` (cm³) do JSON-LD |
| color / doors / category | null (não estruturados na listagem) |
| price / currency | `article-price`/`new-price` (ou `offers.price`) / EUR |
| country | `'GERMANY'` |
| region | Bundesland (2ª parte de `article-location`) |
| postalCode | null (só cidade) |
| source | `'particular'` (P2P; card não nomeia vendedor) |
| detail_url | href do card |
| image | `img src` do card (ignora `no_img.png`), fallback JSON-LD |
| collected_at | injetado |

Extras próprios: `source_site='quoka.de'`, `id` (hash), `article_id` (UUID), `city`, `price_old`,
`images`, `listing_date`, `premium`, `verified_phone`, `description`.

## Verificação (dados reais)

Ver o relatório final da tarefa (números de `run --max-pages 3`, cobertura por campo, dedupe/resume,
fatia `--full` e `watch --interval 12 --cycles 2`). Saídas em `tools/collector/out/` (prefixo `quoka-`).
