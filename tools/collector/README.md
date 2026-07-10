# collector — recolha de dados de anúncios (AutoImport)

Coletores próprios (sem vendedores) que recolhem anúncios de carros no estrangeiro e
normalizam para um schema comum, para comparar preços PT vs. UE.

## theparking.eu (primeiro coletor)

Agregador da rede LeParking/TheParking-cars. Escolhido como primeira fonte por ser o
mais fácil e rico tecnicamente — e por **agregar stock de sites que nos bloqueiam
diretamente** (gocar.be, autoscout24.be, marktplaats.nl, autowereld.nl…), tornando-os
acessíveis sem os atacar um a um.

Investigação técnica completa: [`../../research/theparking-investigacao.md`](../../research/theparking-investigacao.md).

### Como usar

```bash
# amostra (default: DE, NL, BE, FR)
node run-theparking.mjs

# estreitar por país/marca
node run-theparking.mjs --country belgium --make bmw --max-pages 3

# multi-país
node run-theparking.mjs --country germany --country netherlands --max-pages 2

# cobertura máxima (fatiar país × modelo via sitemap — longo)
node run-theparking.mjs --full --max-pages 10

# retomar a última recolha (checkpoint)
node run-theparking.mjs --resume
```

Flags: `--country <slug|nome-pt>` (repetível), `--make <slug>`, `--max-pages <n>`,
`--rate <ms>` (intervalo entre pedidos), `--full`, `--resume`, `--out <dir>`.

### Saída (em `out/`, gitignored)
- `theparking-<timestamp>.ndjson` — um registo normalizado por linha.
- `theparking-summary.json` — contagens (total, por país, por fonte), preços, duração.
- `theparking-checkpoint.json` — progresso + dedupe (permite `--resume`).

### Schema de cada registo
`make, model, variant, year, km, fuel, gearbox, engine, color, doors, category,
price, currency, country, region, postalCode, source, detail_url, image, collected_at`.

Exemplo real recolhido:
```json
{ "make":"BMW","model":"3 SERIES","variant":"BMW 3 SERIES 318D 2.0 150 EDITION AVANTAGE",
  "year":2016,"km":123415,"fuel":"Diesel","gearbox":"Manual","engine":"2.0 Diesel",
  "color":"BLACK","doors":4,"category":"SEDAN","price":12099,"currency":"EUR",
  "country":"BELGIUM","region":"BRUXELLES-CAPITALE","postalCode":"1000","source":"gocar.be",
  "detail_url":"https://www.theparking.eu/used-cars-detail/.../A25BLZZZ.html","image":"https://…jpg" }
```

## Arquitetura e o "porquê" das decisões

```
run-theparking.mjs        CLI: flags, resolução de países, resumo
theparking/
  http.mjs                cliente HTTP (UA browser, cookies, rate-limit, retry, guarda robots)
  parse.mjs               extrai JSON-LD Vehicle + fonte por card; junta por ID
  schema.mjs              schema-alvo + normalizadores + mapa JSON-LD→schema
  sitemap.mjs             enumera slugs de modelo (modo --full)
  crawl.mjs               plano de queries, paginação, dedupe, checkpoint, NDJSON
```

- **HTTP puro, sem browser** — a investigação confirmou que um GET com UA de browser
  passa o Cloudflare (200). Sem Playwright → rápido (66 anúncios em ~4s) e barato.
- **JSON-LD `schema.org/Vehicle`** (27/página) como fonte de dados — estruturado e
  robusto a mudanças de CSS; o site publica-o de propósito para máquinas.
  *Gotcha:* tem quebras de linha literais dentro das strings → sanitizamos antes do
  `JSON.parse` (ver `parse.mjs`).
- **Fonte por card, junta por ID de anúncio** (não por índice) — mais robusto.
- **Paginação por GET** `/used-cars/{path}/{N}.html`; `path` combinável (país, marca,
  país/marca) → segmentação simples.
- **Rate-limit + retry/backoff** — o Cloudflare bloqueia intermitentemente (200 mas
  página vazia); tratamos com `validate` + backoff no `http.mjs`.
- **Dedupe global + checkpoint/resume** — recolhas grandes retomam sem duplicar.
- **Respeita o robots.txt** — nunca pede `/extlink/`, `/tools/`, `/tag/` (guarda em `http.mjs`).
- **Cobertura (`--full`)** — a paginação de um país satura; fatiar país × modelo (seed
  do sitemap) dá muito mais cobertura útil.

### Limitações / notas
- Nível de listagem (rápido). A página de detalhe teria galeria de fotos + vendedor,
  ao custo de ~27× pedidos — não recolhemos (a listagem já traz tudo para comparar preços).
- É agregador → o mesmo carro pode aparecer via fontes diferentes; o dedupe é por
  anúncio do theparking (ID), não por veículo físico entre fontes.
- O `checkpoint.json` guarda o conjunto de IDs vistos; em recolhas `--full` muito
  grandes esse ficheiro cresce (aceitável nesta fase).
