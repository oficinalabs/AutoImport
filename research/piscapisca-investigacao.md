# piscapisca.pt — investigação técnica (spec do coletor)

> Como recolher dados do PiscaPisca.pt (24º alvo; marketplace de stands PT — Credibom + APDCA).
> Data: 2026-07-13. Método: reconhecimento **com browser stealth** (Scrapling `StealthySession`,
> `solve_cloudflare=True`) — o único modo de ver o HTML, porque o Cloudflare bloqueia HTTP puro.

## ⚠️ Exceção deliberada de política — browser stealth

Este é o **1.º (e único) coletor a usar evasão de anti-bot ativo**, contra a norma "HTTP puro, sem
evasão" que o repo declara na secção 4 do [`scraping-estado.md`](scraping-estado.md). Decisão
**explícita do utilizador**. Isolada a este coletor (Python, venv próprio em
`tools/collector/piscapisca/.venv/`); os outros 23 coletores Node mantêm-se HTTP puro e zero-deps.

**Porquê é preciso:** probe 2026-07-13 confirmou **challenge ATIVO do Cloudflare** — `HTTP 403` a
qualquer cliente não-browser, **mesmo** com User-Agent + headers de browser completos e HTTP/2
(corpo ~1 MB com `challenge-platform`). `api.piscapisca.pt`, `/sitemap.xml` e `/api/` também 403.
Isto é diferente do Cloudflare *passivo* de sites como StandVirtual/CustoJusto (que passam a 200 com
UA de browser). O Scrapling resolve o challenge via **Camoufox** (browser stealth) com
`solve_cloudflare=True`.

## TL;DR — como recolhemos

- **Browser stealth (Scrapling).** `StealthySession(headless=True, solve_cloudflare=True)`. Uma
  **sessão QUENTE** por processo resolve o challenge **uma só vez** e reaproveita o `cf_clearance`
  em todas as páginas/ciclos (crítico para o watch de 1 min).
- **Fonte = `ng-state` (Angular Transfer State).** A listagem `/carros` é uma app **Angular SSR**;
  os dados vêm 100% estruturados no `<script id="ng-state" type="application/json">`. **Sem JSON-LD,
  sem `__NEXT_DATA__`.** 20 viaturas/página em `SEARCH_VEHICLES[]`.
- **~55.977 viaturas** (lido de `COUNT_VEHICLES`; flutua ao vivo — inventário real).
- **Rota de listagem `/carros`; paginação `?page=N`** (1-indexado). ⚠️ A vista base está **limitada
  a `total_elements=10000`** (500 págs × 20); para ir além, **fatiamos por FACETA** de path.
- **Facetas de path:** `/carros/{marca}` (ex. `/carros/bmw` = 5.197), `/carros/{distrito}` (ex.
  `/carros/aveiro` = 2.801). Marcas ficam abaixo do teto (a maior, Renault=5.264); distritos grandes
  excedem-no (Lisboa=17.859, Porto=14.091 → truncam a 10k).
- **`--full` = união marca ∪ distrito** (NÃO produto): o `?marca=` **não filtra** no SSR (devolve 0,
  testado), e o path só aceita 1 segmento. Marcas de cauda-longa dependem das facetas de distrito.
- **Recência POR PROXY** (ordem default = relevância). O sort "Mais recentes" (`publish_at|DESC`) é
  feito **client-side por POST à API interna** — não alcançável pela rota SSR sem tocar `/api` (que a
  allowlist proíbe). Como no AutoTrader/autocasion.
- **Misto stands/particulares:** cada viatura traz `stand` (profissional) ou `seller`; mapeamos
  `seller_type` + `source`. Na listagem base observada, ~100% são stands.

## Acesso

- **Host canónico:** `https://www.piscapisca.pt` (com `www`).
- **Anti-bot Cloudflare ATIVO:** 403 a HTTP puro; resolvido por Camoufox (`solve_cloudflare=True`).
  Verificado ao vivo: `/carros` → **200 com HTML real** (title "Carros usados com garantia e
  certificação"; `challenge=False`), prova que o solve passou.
- **robots.txt:** **ilegível** (o Cloudflare devolve 403 também a `/robots.txt`). Mitigação por
  **allowlist estrita** (ver Política).
- **App Android** `pt.credibom.piscapiscaapp` (não usada; a via web SSR chega).

## Fonte — `ng-state` → `SEARCH_VEHICLES[]`

Um `<script id="ng-state" type="application/json">` por página (o Angular Transfer State). Chaves:

| Chave | Conteúdo |
|---|---|
| `COUNT_VEHICLES` | total real da query (ex. 55977 na base; 5197 em `/carros/bmw`) |
| `VEHICLES_PAGINATION` | `{size:20, total_elements, total_pages, number}` (`number` 0-indexado; `total_elements` limita a 10000 na base) |
| `SEARCH_VEHICLES` | **os 20 anúncios orgânicos** da página (a nossa fonte) |
| `SEARCH_VEHICLES_HIGHLIGHT_PLUS` / `_SEGMENT` | carrosséis de anúncios promovidos (ignorados; o dedupe por id trata sobreposição) |
| `QUICK_ACCESS_LINKS` | grupos "MARCAS", "MODELOS", "LOCALIZAÇÕES" → seed das facetas do `--full` |

Campos por viatura (→ mapeamento em `tools/collector/piscapisca/schema.py`):
`id` (natural, ex. "z3Lrr"), `brand`, `model`, `serie` (variant), `prices{private,professional}`,
`year`, `km` ("182 350 km"), `fuel`, `transmission`, `cylinderCapacity` ("2143 cm3"), `powerCV`
("170 cv"), `vehicleType` (carroçaria), `origin` ("Nacional"/"Importado"), `stand`, `stand_url`,
`company_url`, `seller`, `warranty`, `certification{inspected,associate,controlAuto,homeDelivery}`,
`standLocation{address,city,district,county,country,postal_code}`, `link` (URL do detalhe),
`thumbnail`. `color`/`doors` **não** expostos na listagem → `None`.

⚠️ **Gotcha `engine_cc`:** `to_int("2143 cm3")` daria `21433` (apanha o "3" de "cm3"). Lemos só os
dígitos **antes** de "cm" (`_parse_cc` em `schema.py`).

## Cobertura (`--full`) e o teto dos 10000

Medido na Fase 0. A vista base (`/carros`) tem `COUNT`~56k mas `total_elements`=10000 → só 500 págs.
As facetas de path expõem o total real da fatia:
- **Marcas** (`/carros/{marca}`): todas abaixo do teto (Renault=5264 é a maior) → **totalmente
  pagináveis**. Como todo o veículo tem marca, a união das facetas de marca cobriria tudo… se
  tivéssemos a taxonomia completa. Só temos as ~20 marcas "populares" do `QUICK_ACCESS_LINKS`.
- **Distritos** (`/carros/{distrito}`): apanham as marcas de cauda-longa. Lisboa (17859) e Porto
  (14091) excedem o teto → truncam a 10k (mas os seus veículos de marca popular já vêm das facetas de
  marca; só escapa a interseção cauda-longa × grande-distrito além do teto — resíduo pequeno).
- **Combos marca×distrito impossíveis:** `?marca=bmw` em `/carros/aveiro` devolve `COUNT=0` (não
  filtra no SSR); o path só aceita 1 segmento. Por isso a estratégia é **união**, não produto.

## Recência (watch)

O sort SSR é sempre relevância. O bundle expõe as opções (`main.*.js`): "Mais recentes" =
`publish_at|DESC`, mas o valor é enviado num **payload POST à API interna** (`sort:[{order,field}]`),
não num query param da rota SSR (guessed `?order=`/`?sort=` são ignorados). A API está fora da
allowlist. → **recência por proxy** (ordem default), como AutoTrader/autocasion. O watch deteta
novos/preço comparando `id`→estado; `--pages` alarga a captura por ciclo.

## Política, robots e boa cidadania

- **Allowlist estrita** (`fetcher.py`): só paths `/carros[...]` (listagem base, facetas de marca/
  distrito, e detalhe `/carros/usados/...`). **Nunca** `/api`, `/admin`, `/conta`, `/login`,
  `/backoffice`, `/empresa`, `/stand`, `/favoritos`, `/robots.txt`. Testado (9/9 bloqueados, 5/5
  permitidos).
- **Ritmo conservador:** `--rate` default **4000 ms**, headless, **1 sessão por processo, sem
  concorrência** (mais lento que os HTTP-puros, para reduzir peso e deteção). `--interval`
  configurável para abrandar o watch.

## Dependências

- **Python 3.10+**; `scrapling[fetchers]==0.4.11` + `scrapling install` (Camoufox, centenas de MB).
- ⚠️ A máquina tem **Python 3.14** (demasiado recente → faltavam wheels do Camoufox/patchright).
  **Validado em Python 3.13.2** num **venv dedicado** (`tools/collector/piscapisca/.venv/`, no
  `.gitignore`). Ver `requirements.txt` e o README.

## Verificação (2026-07-13, dados reais)

1. **Cloudflare passou:** `/carros` → 200 HTML real (não challenge). ✅
2. `run-piscapisca.py --max-pages 3` → **60 anúncios**, 16s. Cobertura: make/model/variant/year/km/
   fuel/gearbox/category/price/source/detail_url/image/seller_type/origin/power_hp = **60/60**;
   engine/engine_cc 54/60; region 52/60 (8 sem distrito na fonte — stand sem `district`). ✅
3. `--resume` estende (págs 4–6) → **117** registos, **117 únicos** (dedupe por id no limite de
   página). ✅
4. `--brand bmw --max-pages 2` → 40 anúncios, **40/40 = BMW** (faceta filtra). ✅
5. `watch --interval 60 --cycles 2` → ciclo 1: 20 novos (7s); **ciclo 2: 0 novos (3s), sem re-solve**
   do challenge (sessão quente — o solver reporta "No Cloudflare challenge found", i.e. já resolvido).
   20 eventos `new`. ✅
6. Allowlist: nenhum pedido fora de `/carros[...]`; ritmo 4000 ms respeitado. ✅
