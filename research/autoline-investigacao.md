# autoline.pt / Via-Mobilis — investigação técnica (spec do coletor)

> Como recolher dados do **autoline.pt** (marketplace pan-europeu do grupo **Via Mobilis / LineMedia**),
> secção **país = Bélgica (BE)**, categoria **CARROS** (ligeiros). 8º alvo, após theparking.eu,
> AutoTrader.nl, autoboerse.de, autocasión, OcasionPlus, Flexicar e Aramisauto.
> Data: 2026-07-11. Método: reconhecimento estático (`curl` + análise do JSON-LD e do card HTML).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/fetch com UA de browser → **200** em todas as probes.
  **SEM anti-bot ativo** (nada de Cloudflare/Incapsula/DataDome challenge).
- **⚠️ TIPO DE STOCK — ler com atenção:** o autoline é sobretudo de **veículos COMERCIAIS/PESADOS e
  máquinas** (camiões, reboques, autocarros, agrícola, construção). **MAS TEM categoria de LIGEIROS**
  — **`/carros` (`--c1169`, "Automóvel" / passenger cars)** — que é a que recolhemos. Ressalvas honestas:
  (a) a categoria mistura **ligeiros-comerciais leves** (Sprinter/Transit/Master) com automóveis;
  (b) a secção **Bélgica é quase toda de LEILÃO** (leiloeiras Troostwijk, Auctim, AuctionPort, VAVATO…) —
  ~**93–99 %** dos anúncios BE são lotes de leilão, muitos **sem preço fixo** (só "Leilão").
- **Molde theparking/autocasion** (card HTML + JSON-LD juntos por ID) — **mas com o CARD como fonte
  PRIMÁRIA** e o JSON-LD como enriquecimento (ver "Fonte" abaixo — decisão-chave).
- **Rota de listagem:** `/-/carros/{Pais}--c1169cnt{CC}` (o prefixo é `/-/`). **Por defeito: Bélgica**
  (`/-/carros/Belgica--c1169cntBE`, **~590 anúncios**, ≈25/página, ~26 páginas → a paginação cobre tudo).
- **Paginação `?page=N`** (confirmado: 0 sobreposição p1×p2). Volume global de ligiros (todos os países):
  **~11.064**; a fatia **BE ≈ 590**.
- **⚠️ Recência:** o robots proíbe `?sort=` (`Disallow: /-/*sort=`) → **sem ordenação por data**. MAS o
  **`id` (data-code) É um timestamp de criação** (`YYMMDDHHMMSS`+contador) → descodificamo-lo em
  **`created_at` (recência REAL)** e o watch loga `max(id)`.

## Acesso

- **Host canónico:** `https://autoline.pt` (instância pt-PT). `www.` dá 301 → usamos o host sem www.
- **Anti-bot:** nenhum ativo. 200 com UA de browser em todas as probes. Rate-limit + backoff do
  `lib/http` mitigam o risco sob volume. Sem `Crawl-delay` para `*` no robots (só para bots nomeados)
  → default do lib (1,5 s) é educado.
- **robots.txt (guarda em `autoline/http.mjs` + `lib/http.mjs`):** tolerante para a listagem. Bloqueia
  sobretudo UI/endpoints — `/api/`, `/search/`, `/sales/`, `/sales-history/`, `/export/`, `/big-photos/`,
  `/print-pdf/`, `/compare/`, `/order/`, `/login/`, `/registration`, `/-/sdb/`, `/my/`, `/stock.php`…
  A LISTAGEM que usamos (`/-/carros/{Pais}--c1169cnt{CC}`) é **permitida** — nunca lhe tocamos.
  **REGRA-CHAVE:** há `Disallow: /-/*sort=` (wildcard no meio do path, não exprimível por prefixo) →
  **NUNCA emitimos `?sort=`** (garantimos a conformidade não o gerando; ver watch).

## Fonte — CARD (primária) + JSON-LD `ItemList`→`Product` (enriquecimento)

**Decisão-chave (porque o card é a spine e não o JSON-LD):** o bloco JSON-LD `ItemList` vem **rico na
Bélgica** (23 `Product` com preço numérico/condição/carroçaria/potência) mas vem **VAZIO noutras
secções-país** (ex. **GB**: `itemListElement` len 0, apesar dos **25 cards populados** e 261 anúncios).
Usar o JSON-LD como primário **deixaria cair silenciosamente** esses países. Por isso iteramos os
**CARDS** (sempre presentes e completos) e juntamos o `Product` por ID quando existe.

**Card** `<div class="item sales-list-item" data-code="{ID}" data-brand="{make}" data-name="{title}">`:

| Sinal no card | → schema |
|---|---|
| `data-brand` | **make** (fallback: 1ª palavra do `data-name`) |
| `data-name` (menos make) | model / variant |
| `sl-main-props__item[title="ano"]` | year (e mês, se `AAAA-MM`) |
| `sl-main-props__item[title="quilometragem"]` | km |
| `<span class="name">Combustível</span><span class="value">…</span>` | **fuel** |
| `sl-main-props__item[title="Euro"]` | **euro_norm** (Euro 5/6…) |
| `.location-text` ("Bélgica, Lokeren") | **country** + **region** (cidade) |
| `.branding-company-name` | **source / dealer** (stand ou leiloeiro) |
| `.price-value` ("1 850 €" / "Leilão") | price (numérico; fallback do JSON-LD) |
| âncora `href=".../-/{venda|leilao}/carros/…--{ID}"` | **detail_url** (+ flag leilão) |
| `img.linemedia.com/…jpg` | image |

**JSON-LD `Product`** (quando presente) acrescenta: `offers.price`/`priceCurrency` (**preço numérico
fiável**, inclui estimativas de leilão), `offers.itemCondition` (New/Used), `additionalProperty` →
**Tipo de carroçaria** (category/body), **Potência** (power), **Configuração do eixo** (axle_config);
e a `description` traz o **ref_code** interno (ex. `LE51585`).

- **Junção card↔Product pelo ID** = `data-code` = o número final do `url` (após `--`).
- **GOTCHA (como no theparking/autocasion):** sanitizamos caracteres de controlo antes do `JSON.parse`;
  e descodificamos entidades HTML do card (`&amp;`, `&#39;`, `&eacute;`…).

Cobertura medida (amostra BE, 75 registos / 3 págs): make 75/75, model 74/75, year 73/75, km 64/75,
fuel 67/75, **price 58/75** (os ~17 sem preço são lotes de leilão sem número), country/region/source/
detail_url/image/created_at **75/75**, condition/ref_code 58/75, power 46/75, category/body 11/75 (esparso).

## Paginação e cobertura (`--full`)

- **Paginação `?page=N`** na rota do país; ~25 cards/página; termina em página vazia (BE: p26 = 0 cards).
  Para a fatia BE (~590), a **paginação simples cobre tudo** (~26 páginas) — não é preciso fatiar.
- **`--full` fatia por PAÍS** (não por marca): o robots proíbe `?sort=` **e o sidebar de MARCAS é
  truncado** ("Ver todas" → endpoint sob `/search/`, proibido). A partição limpa e path-based é por
  **PAÍS**: o modo sonda a página geral da categoria, lê os **facets de país europeus**
  (`<a href="/-/carros/{Pais}--c1169cnt{CC}">` → **DE, BE, GB, FR, ES, CH**) e itera-os — cobrindo todo
  o stock UE de ligeiros (cada país pagina até ao fim). É também a dimensão mais útil para o objetivo
  AutoImport (comparar preços por país de importação).
- **`--country <CC>`** faz uma só fatia (default BE). **`--category`** fica fixo em `carros--c1169`
  (redirecionar para pesados seria trocar a constante `CAT`).

## ⚠️ Recência

O robots proíbe `?sort=` → **sem ordenação por data na URL**. O watch usa a **ordem default** da página 1
do país como proxy. **BÓNUS vs. AutoTrader/autocasión:** o **`id` (data-code) É um timestamp de criação**
(`26071015164238004900` → `2026-07-10T15:16:42Z`) — descodificamo-lo em **`created_at` (recência real)** e
logamos `max(id)` por ciclo. Captura exaustiva de novos depende do re-crawl batch periódico.

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-autoline.mjs --max-pages 3` → **75 anúncios BELGIUM** (4s), cobertura acima; 74/75 em leilão.
2. `--resume --max-pages 5` → retomou em 75, +49 (p4–p5) sem duplicar (**124**).
3. `--full --max-pages 1` → **6 países** percorridos (DE/BE/**GB**/FR/ES/CH), 25–26 cada = **151**
   (GB inclui-se corretamente — validou a decisão card-primário: o JSON-LD de GB vem vazio).
4. `watch-autoline.mjs --interval 12 --cycles 2` → ciclo 1: 25 novos; ciclo 2: 0 novos (dedupe);
   `maxId`/`created_at` logados; eventos emitidos para o sink.
5. Guarda robots: `/api/`, `/search/`, `/sales/`, `/-/sdb/`, `/export/` **bloqueados**; a listagem passa.

## Ficheiros

- Coletor: `tools/collector/autoline/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-autoline.mjs`, `tools/collector/watch-autoline.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
