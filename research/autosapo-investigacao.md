# auto.sapo.pt — investigação técnica (spec do coletor)

> Como recolher dados do **Auto SAPO** (auto.sapo.pt), o marketplace automóvel nacional do portal
> SAPO — particulares (grátis) + profissionais (stands). Mercado: **Portugal**.
> Data: 2026-07-12. Método: reconhecimento estático (`curl` + análise do HTML SSR, do `pesquisa.js`
> da app e de probes reais à listagem/detalhe).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** `curl`/`fetch` com UA de browser → 200. Servidor **ASP.NET Core MVC**
  com **SSR** — anti-bot **inexistente** (sem challenge JS/Cloudflare/DataDome em nenhuma probe;
  cookie de sessão `assid` guardado pelo cookie jar do lib). ⚠️ **MAS há rate-limiting por rajada:**
  5 pedidos consecutivos sem pausa devolveram páginas VAZIAS (0 cartões); com o delay+jitter do lib
  (1500ms) nunca falhou → o `validate: temCartoes` trata as vazias como retryáveis.
- **A pista de "SPA JS-heavy / API JSON em `auto-frontoffice.sapo.pt`" REVELOU-SE FALSA.** A página de
  pesquisa é **SSR**: o HTML de `/carros-usados` já traz os 20 cartões renderizados. A camada Vue
  (`vue.min.js`) só hidrata favoritos/filtros no cliente e **não existe API JSON pública de pesquisa**.
  `auto-frontoffice.sapo.pt` é o **backoffice de anunciantes** (links "Anunciar grátis"/"Comerciantes")
  — serve quem PÕE anúncios, não o inventário. Não o tocamos.
- **Fonte PRIMÁRIA = cartões HTML da listagem** (molde theparking/autocasion, mas **sem JSON-LD** na
  listagem). Cada `<article class="vehicle-card">` traz: **id** (ObjectId de 24 hex no href
  `/carro-usado/{id}/{slug}`), marca+modelo (`<h3>`), variante+potência+portas (o `<span>`),
  ano/km/combustível (os `<li>`), preço e imagem.
- **Fonte OPCIONAL = página de DETALHE (flag `--detail`).** Traz um `dataLayer.push({…})` (analytics)
  **limpo e estruturado** (marca, modelo, versão, cor, combustível, carroçaria, portas, lugares,
  **`nacional`** = matrícula PT vs importado, **`vendedor`** = particular/profissional) + **1 bloco
  JSON-LD** (transmissão, VIN, cilindrada, tração, cores/interior) + microdados de morada
  (**distrito** em `addressRegion`, concelho, nome do stand). É **1 pedido/anúncio** → só se justifica
  em amostras/fatias, não no catálogo inteiro (~24k).
- **Paginação `?p=N`** (1-indexada; 20/página). Verificado: `p=1218` (última) devolve os 15 cartões
  finais → **1217×20 + 15 = 24.355 = `total`**. Iterar `p=1..1218` cobre TUDO sem facetas nem lacunas
  (o dedupe global apanha os "Em destaque" repetidos da 1ª página).
- **~24.355 viaturas usadas** (contador `Pág. 1 de 1.218 / 24.355 viaturas`).
- **✅ Recência:** o `orderby=1` ("Mais recente") é HONRADO pelo SSR; e — melhor ainda — o **ObjectId
  do anúncio codifica o timestamp de publicação** (primeiros 4 bytes = Unix time) → temos **data REAL
  por anúncio** (`published_at`) sem depender de nenhum campo do cartão.

## Acesso

- **Host canónico:** `https://auto.sapo.pt`. Tudo (listagem, detalhe, sitemaps) no mesmo host.
- **Anti-bot:** nenhum. Rate-limit por rajada mitigado pelo delay+jitter do lib + validador de página.
- **robots.txt** (`auto.sapo.pt/robots.txt`) — **quase totalmente permissivo**. Disallow **só** de
  `/account/` e `/user/`. As nossas rotas (`/carros-usados`, `/carro-usado/…`, `/carros/{marca}.html`,
  `/sitemap/…`) **NÃO** caem em nenhum disallow → **PERMITIDAS** (verificado com o guard `assertAllowed`).
  Sem `Crawl-delay` → mantemos o default educado do lib. O robots lista dezenas de sitemaps (marcas,
  distritos, combustíveis…) que usamos como taxonomia.
- **⚠️ host de "API":** não há API — a fonte é o HTML SSR do próprio host permitido. `services.sapo.pt`
  tem `Disallow: /` mas **não é usado** (irrelevante). `auto-frontoffice.sapo.pt` (backoffice) **não
  é usado**.

## Fonte — cartão da listagem (`<article class="vehicle-card">`)

Mapa (→ schema em `tools/collector/autosapo/schema.mjs`):

| Sinal no cartão | → schema | Exemplo |
|---|---|---|
| `<h3>` marca+modelo ÷ lista de marcas | make / model | "Land Rover" / "Range Rover Sport" |
| `<span>` "[variante -] Ncv - NP" | variant / power_cv / doors | "2.0 TDI R-Line DSG" / 240 / 4 |
| `<li>` ano (4 díg.) | year | 2019 |
| `<li>` "… km" | km | 134000 |
| `<li>` combustível | fuel | Gasolina / Diesel / Eléctrico / Híbrido (Gasolina) |
| `.price` | price | 27900 |
| href `/carro-usado/{id}/{slug}` | detail_url + **id** (ObjectId) | 6a52130cf65fdbd00592d8c5 |
| ObjectId[:8] hex → Unix time | **published_at** (recência) | 2026-07-11T09:55:24Z |
| `<img src>` | image (absolutizado) | https://auto.sapo.pt/carro-usado/…/…-0.jpg |
| classe `highlighted` | highlighted ("Em destaque") | true/false |

- **`country`='PORTUGAL'**, **`currency`='EUR'**, **`source`='Auto SAPO'** (marketplace; o vendedor
  concreto só existe no detalhe).
- **`gearbox`/`color`/`category`/`region`/`postalCode`/`engine` = null por design** — o cartão não os
  expõe (só a página de detalhe). Preenchidos com `--detail` (ver abaixo).
- **Separação marca/modelo:** o `<h3>` concatena marca+modelo. Carregamos os **83 slugs de marca** do
  sitemap `/sitemap/carros-usados/marcas` (`/carros/{marca}.html`) e casamos o prefixo (2 tokens →
  1 token; resolve "Land Rover", "Mercedes-Benz", "Alfa Romeo"…). Fallback: 1º token = marca.

## Enriquecimento por detalhe (`--detail`, opcional)

Da página `/carro-usado/{id}/{slug}` extraímos (parse tolerante do `dataLayer` + `JSON.parse` do
JSON-LD + microdados de morada):

- **gearbox** (`vehicleTransmission`, ex. "Automática"), **color** (`cor`), **category** (`carrocaria`,
  ex. "SUV/TT"), **region** (`addressRegion` = **distrito**, ex. "Lisboa"), **engine** (cilindrada cc),
  `locality` (concelho), `seats`, `vin`, `interior_color`/`interior_type`, `drive_train`.
- **`seller_type`** = `particular` | `profissional` (do `vendedor`), **`national`** = matrícula PT vs
  **importado** (do `nacional` — valioso para comparar preço nacional vs. importação), **`dealer`**
  (nome do stand, do fim da `description` "…por X" ou da `streetAddress`). Quando há vendedor, `source`
  passa a ser o stand (ou "Particular").

⚠️ **Custo:** 1 pedido extra por anúncio. Adequado a amostras/fatias (`--slice`), **não** ao catálogo
inteiro (~24k pedidos). Sem `--detail`, estes campos ficam null (o cartão chega para make/model/
variant/year/km/fuel/price/doors/power/imagem/recência).

## Cobertura (batch) e watch

- **Batch (`crawl.mjs`)** — pagina `?p=N` (20/pág), ordem default (os "Em destaque" só na 1ª página):
  - **default:** até `--max-pages` páginas (amostra).
  - **`--full`:** até esgotar (nº de páginas lido da própria listagem, ~1218). Dedupe global por `id`,
    checkpoint/resume (página), NDJSON, stats. **Sem facetas** — a paginação chega ao fim.
  - **`--slice <filtro>`:** uma query filtrada (ex. `marca=volvo` → 657 viaturas/33 págs; `localizacao=porto`).
  - **`--detail`:** enriquece cada anúncio novo (ver acima).
- **Watch (`watch.mjs`)** — poll das primeiras páginas por `orderby=1` (default 3; a 1ª é toda
  promovida, os recentes surgem da 2ª-3ª); novos/price_change por `id`; sinal de recência =
  `max(published_at)` do ciclo (descodificado do ObjectId).

## Verificação (dados reais, 2026-07-12)

- `run --max-pages 3` → **60 anúncios** (catálogo 24.355), 6s. Cobertura: make/model/year/km/fuel/
  price/doors/power_cv/image/detail_url/id/**published_at 100%**; variant 53% (correto — muitos
  anúncios não têm texto de variante, só "Ncv - NP"); gearbox/color/category/region 0% (por design).
- `--resume --max-pages 5` → 60→**100**, dedupe perfeito (100 linhas = 100 ids únicos).
- `--slice "marca=volvo" --detail` (1 pág) → 20 anúncios enriquecidos: gearbox="Automática",
  color="Azul", category="SUV/TT", region="Lisboa", engine=1969, seller_type="profissional",
  national=false, dealer="Ayvens", drive_train, seats — todos preenchidos.
- `watch --interval 12 --cycles 2 --pages 3` → ciclo 1: 60 novos; ciclo 2: 0 (estado estável);
  recência logada = `max(published_at)` do dia (confirma que o `orderby=1` faz emergir os recentes).
- `assertAllowed`: `/carros-usados`, `/carro-usado/…`, `/carros/*.html`, `/sitemap/…` **PERMITIDOS**;
  `/account/…`, `/user/…` **BLOQUEADOS**.
- `detail_url` e `image` resolvem (200).

## Ficheiros

`tools/collector/autosapo/{http,parse,schema,crawl,watch}.mjs` +
`tools/collector/run-autosapo.mjs` + `tools/collector/watch-autosapo.mjs`. Reutiliza `lib/` sem alterar.
