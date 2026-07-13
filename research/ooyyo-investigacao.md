# Ooyyo (Bélgica) — investigação técnica (spec do coletor)

> Como recolher dados do Ooyyo (agregador/motor de busca de carros usados), secção **Bélgica**.
> Data: 2026-07-11. Método: reconhecimento estático (`curl`/`urllib` + análise do bundle JS, da
> API interna e do card HTML server-rendered).

## TL;DR — como recolhemos

- **HTTP puro (sem browser).** É recolhível: a página de resultados (SRP) é **server-rendered** com
  todos os campos no HTML. Anti-bot **Cloudflare PASSIVO** no `www.ooyyo.com` (200 com UA de
  browser, sem challenge).
- **Molde "card HTML"** (como os extras do theparking, mas aqui o card é a fonte COMPLETA — não há
  JSON-LD nem `__NEXT_DATA__` a juntar). Cada `<a class="car-card-1">` traz year/make/model/engine,
  preço (`data-price`), km, carroçaria+combustível, cidade e o **site de origem** (no URL da imagem).
- **É um AGREGADOR** → `source` = **site de origem** do anúncio (ex. `autolive.be`, `autoline.be`,
  `moniteurautomobile.be`, `woowmotors.com`), extraído do host do URL da imagem (o Ooyyo serve as
  fotos via proxy `images.ooyyo.com/media/…?url=<host-origem>/…`). `source_site='ooyyo.com'`.
- **~72.060 anúncios BE** (lido da API: `count`), Bélgica = `idCountry=23`.
- **Chegada à listagem via API `quicksearch/qselements`** (JSON, GET): devolve o URL da 1ª SRP (com
  um `code` determinístico), o `count` e a lista de marcas (com contagens) — seed do crawl e do
  `--full`. **Paginação = seguir o link "Next"** de cada SRP (o `code` codifica a página).
- **⚠️ Crawl-delay: 30** no robots.txt → `minDelayMs` default = **30000** (honramos o site; a
  recolha é lenta por desígnio). Pode baixar-se via `--rate`, com critério.
- **⚠️ Recência (como o AutoTrader/autocasion):** a SRP **não tem ordenação por data** e os ids são
  hashes (não sequenciais) → sem sinal de "mais recente". O watch usa a **ordem default** como proxy.

## Acesso / arquitetura (o que descobrimos)

- **Host canónico:** `https://www.ooyyo.com` (NÃO `ooyyo.be` — esse é um blog WordPress de aluguer,
  sem inventário).
- O site é **jQuery + Handlebars**: `OYO.appParams` (idDomain/idCountry/idLanguage/idCurrency/`code`
  …) alimenta a app (`d10y2oj5s0rxih.cloudfront.net/REV_j…/js/index.min.js`). As **páginas de país**
  (`/belgium/c=<code>/`, no sitemap) **NÃO trazem carros** — só um template + `appParams` com o
  `count`. O inventário só se alcança pela **SRP** `/belgium/…used-cars-for-sale/c=<code>/`.
- **API interna** `…/ooyyo-services/resources/…`: o host `analytics.ooyyo.com` é **gated**
  (responde `forbidden!`), mas a MESMA API servida em `www.ooyyo.com` aceita **HTTP puro** com os
  headers do `lib/http` (Accept html + Accept-Language). Endpoint usado:
  `GET /ooyyo-services/resources/quicksearch/qselements?json={…}`.
  - Params: `{idDomain:"1", idCountry:"23", idLanguage:"47", idCurrency:"3", isNew:"0",
    qsType:"advanced"}` (opcional `idMake` para filtrar por marca). **Não precisa de `code`.**
  - Resposta (chaves úteis): `url` (SRP com `code` válido), `count` (total), `makes.{top,black}`
    (marcas com `idMake`/`name`/`urlName`/`count`).
- **robots.txt** (`www.ooyyo.com`): `User-agent: *` → `Crawl-delay: 30`; `Disallow: /automobili/`,
  `/outlet-service-web/`, `/counter`. As rotas que usamos (API `/ooyyo-services/…` e
  `/belgium/…used-cars-for-sale/…`) **não** estão nos disallow. (`/automobili/` é um path legado →
  410 Gone.) Guarda em `ooyyo/http.mjs` + `lib/http.mjs`.

## Fonte — card HTML da SRP (server-rendered)

Cada anúncio é um `<a class="car-card-1" href="/belgium/c=<code>/-<idRecord>.html/" data-price="…"
data-currency="3">`. Mapa (→ schema em `tools/collector/ooyyo/schema.mjs`):

| Campo no card | → schema | Exemplo |
|---|---|---|
| `data-record` | **id** (hash único → dedupe) | -1244063680320233565 |
| `.mob-heading` spans [0..3] | year / make / model / engine | 2007 / Land Rover / Defender / 2.4 |
| `title` | variant (título) | Used Land Rover Defender 2007 |
| `data-price` / `data-currency=3` | price / currency | 43950 / EUR |
| `.mileage` "55,762 km" | km | 55762 |
| `.description` (por **vocabulário**) | category / fuel / color | Suv / Diesel / Black |
| `.mob-location` (1º segmento ≠ país) | region (cidade) | Aalter |
| `'BELGIUM'` | country | BELGIUM |
| host do `data-src` da imagem (proxy) | **source** (site de origem) | autolive.be |
| `href` (absoluto) | detail_url (página do registo no Ooyyo) | …/-…​.html/ |
| `data-src` | image | https://images.ooyyo.com/media/240x180?…&url=… |

- **Extras próprios:** `source_site='ooyyo.com'`, `source_host` (host completo da imagem, ex.
  `pictures-cdn.autolive.be`), `deal` (rótulo, ex. "Super price"), `save_percent` (%), `image_count`.
- **GOTCHA (ordem da descrição varia):** a `<div class="description">` pode vir `[carroçaria,
  combustível]`, `[combustível, cor]`, `[carroçaria, combustível, cor]`, etc. Classificamos por
  **vocabulário** (inglês, por via de `idLanguage=47`), não por posição — como no autocasion.
- **Não expostos na listagem:** `gearbox`, `doors`, `postalCode` → null. `engine` é a cilindrada
  textual (ex. "2.4"); `km`/`fuel`/`region`/`color` faltam quando a origem não os publica.

## Paginação e cobertura (`--full`)

- **Paginação = seguir "Next"** (`<a … class="btn … btn-warning">Next</a>`). O `code` codifica a
  página (p1 `…AA651453` → p2 `…AA661453` → p3 `…AA671453`); seguimos o href para não depender do
  cifrado. **15 anúncios/página**, overlap 0 entre páginas (confirmado). Última página não tem Next.
- **`--full` por marca:** a listagem geral (~72k) satura antes de esgotar. Fatiamos por MARCA
  chamando `qselements` com `idMake` → o campo `url` devolve a SRP da marca (ex. BMW →
  `/belgium/used-bmw-for-sale/c=<code>/`, `count` 8.989). ~100+ marcas extraíveis da 1ª qselements.
- Marcas densas (BMW ~9k, Mercedes ~8.7k, VW ~7.4k) podem ainda ser grandes; o corte fino seguinte
  seria por modelo/preço (não implementado — ver README).

## ⚠️ Recência (como o AutoTrader/autocasion)

A SRP só ordena por price/year/mileage/deal — **sem sortByDate** — e os ids são hashes (não
sequenciais), logo não há sinal de "mais recente". O watch usa a **ordem default da SRP como
proxy** (percorre as N primeiras páginas seguindo "Next", deteta novos/alterados por id + preço).
Captura exaustiva de novos depende do **re-crawl batch periódico** (`--full`).

## Verificação (ponta-a-ponta, dados reais — 2026-07-11)

1. `run-ooyyo.mjs --max-pages 3` → **45 anúncios** BE (14s a `--rate 4000`). Cobertura (45):
   make/model/variant/year/price/currency/country/source/detail_url/image/id/deal/image_count 45/45;
   category 44/45; fuel 32/45; engine 27/45; km 30/45; region(cidade) 13/45; color 18/45 (numa
   fatia BMW). `gearbox` 0/45 (não exposto). Fontes: autolive.be, autoline.be, moniteurautomobile.be,
   woowmotors.com.
2. `--resume --max-pages 5` → retomou pelo `nextUrl` do checkpoint (p4-p5), +30, **75 no total, 0
   duplicados**.
3. `--make bmw --max-pages 3` → **45 anúncios, todos BMW** (via `qselements idMake` → SRP da marca +
   "Next").
4. `watch-ooyyo.mjs --interval 12 --cycles 2` → ciclo 1: 15 novos; ciclo 2: 0 novos (dedupe por
   estado). Eventos `new` escritos em `ooyyo-events.ndjson`.
5. Guarda robots (`assertAllowed`): `/automobili/`, `/counter`, `/outlet-service-web/` bloqueados; a
   SRP e a API passam. `minDelayMs` default = **30000** (honra Crawl-delay: 30).

Registo-exemplo (real):

```json
{"make":"Land Rover","model":"Defender","variant":"Used Land Rover Defender 2007","year":2007,
 "km":55762,"fuel":"Diesel","gearbox":null,"engine":"2.4","color":null,"doors":null,"category":"Suv",
 "price":43950,"currency":"EUR","country":"BELGIUM","region":"Aalter","postalCode":null,
 "source":"autolive.be","detail_url":"https://www.ooyyo.com/belgium/c=…/-1244063680320233565.html/",
 "image":"https://images.ooyyo.com/media/240x180?sc=http&url=pictures-cdn.autolive.be/…","source_site":"ooyyo.com",
 "id":"-1244063680320233565","source_host":"pictures-cdn.autolive.be","deal":"Super price","save_percent":25.85,"image_count":20}
```

## Ficheiros

- Coletor: `tools/collector/ooyyo/{http,parse,schema,crawl,watch}.mjs`.
- CLIs: `tools/collector/run-ooyyo.mjs`, `tools/collector/watch-ooyyo.mjs`.
- Reutiliza (sem tocar) `tools/collector/lib/{http,normalize,sink}.mjs`.
