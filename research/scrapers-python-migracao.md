# Investigação: migrar os scrapers para Python + acelerar a recolha

> Branch `investigacao/scrapers-python-migracao`. Documento **só de investigação** — sem
> alterações ao código dos coletores. Objetivo: perceber como funcionam os scrapers hoje e
> avaliar (a) passá-los todos para Python "para ficar mais organizado" e (b) melhorar a
> velocidade mantendo as medidas anti-deteção / anti-bloqueio de IP.

## TL;DR (a recomendação em três frases)

1. **A base de código já é limpa e coesa** — ~15.200 linhas de TypeScript, 24 coletores que
   partilham um `lib/` genérico e um molde fixo de 5 ficheiros por site. "Passar para Python"
   não resolve nenhum problema real; é uma reescrita de milhares de linhas com risco alto e
   ganho zero de organização.
2. **A velocidade não está limitada pela linguagem** — está limitada de propósito, pelos
   `rate-limit` e pela cortesia (1 pedido de cada vez por site). O acelerador que já existe
   (`--fast` do ultimatespecs: pool de workers) mostra que dá para ir muito mais depressa em
   **TS** sem tocar em Python.
3. **O único sítio onde o Python é obrigatório já está em Python** — os sites com Cloudflare
   *ativo* (piscapisca + 4 domínios do autouncle) usam browser stealth (Scrapling/Camoufox),
   que só existe em Python, e estão isolados atrás de um bridge. **A arquitetura certa já foi
   escolhida:** TS para o HTTP puro, Python só para o transporte stealth.

**Proposta:** não migrar. Investir antes em (a) concorrência entre sites/facetas no orquestrador
TS e (b) generalizar o padrão do bridge stealth. Detalhe e alternativas em baixo.

---

## 1. Como funcionam os scrapers hoje

### 1.1 Estrutura

Tudo vive em [`tools/collector/`](../tools/collector/). Há **26 coletores** (24 de anúncios +
`ultimatespecs` de catálogo + o `oparking` bloqueado). Cada um é uma pasta com o **mesmo molde**:

```
<site>/
  http.ts      wrapper fino sobre lib/http.ts (baseUrl, robots-disallow, Accept-Language, rate)
  parse.ts     extrai a fonte de dados da página (JSON-LD / __NEXT_DATA__ / card HTML / API)
  schema.ts    mapeia os campos crus → schema comum (make, model, year, km, price, …)
  crawl.ts     recolha batch (paginação/facetas) — usa lib/crawl.ts
  watch.ts     recolha contínua (polling) — usa lib/watch.ts
run-<site>.ts    CLI batch    (casca lib/cli.ts → defineRunCli)
watch-<site>.ts  CLI contínuo (casca lib/cli.ts → defineWatchCli)
```

O código **partilhado** vive em [`tools/collector/lib/`](../tools/collector/lib/):

| Ficheiro | Papel |
|---|---|
| [`http.ts`](../tools/collector/lib/http.ts) | Cliente HTTP: UA de browser, cookie jar, rate-limit (delay+jitter), retry/backoff, guarda robots (`assertAllowed`). |
| [`crawl.ts`](../tools/collector/lib/crawl.ts) | Inner-core do batch: `createCrawlWriter` (dedupe global por id, NDJSON append, stats, checkpoint/resume) + `runPagedCrawl` (o loop `for query { for page }`). |
| [`watch.ts`](../tools/collector/lib/watch.ts) | Inner-core do polling: estado `id→linha`, eventos `new`/`price_change`, sleep fatiado, SIGINT. |
| [`sink.ts`](../tools/collector/lib/sink.ts) | Destino: escreve sempre NDJSON de eventos; se houver `DATABASE_URL`, faz upsert no Postgres. |
| [`db-sink.ts`](../tools/collector/lib/db-sink.ts) | O upsert canónico em `listings` (SQL cru via `postgres`), com toda a normalização de fronteira (país→ISO2, cilindrada, kW→hp, preço contado ES, histórico de preço). |
| [`cli.ts`](../tools/collector/lib/cli.ts) | Casca dos CLIs: parseArgs, spine `parse → outDir → HttpClient → crawl/watch → summary.json`. |

**A organização já é o ponto forte do projeto.** O refactor que criou `lib/crawl.ts`,
`lib/watch.ts` e `lib/cli.ts` eliminou a duplicação byte-a-byte que havia nos 24 sites — os
comentários nesses ficheiros documentam isso ("48 cópias byte-a-byte de parseArgs", "23 dos 24
watch.ts tinham o mesmo núcleo"). Um site típico são **~5 ficheiros de ~100 linhas cada**.

### 1.2 Fluxo de um coletor

```
run-<site>.ts (CLI)
  → new HttpClient (rate, robots)
  → crawl(): para cada faceta/query, para cada página:
      http.fetchText(url)                 ← GET com throttle + retry
      → parse.ts: extrai a fonte estruturada da página
      → schema.ts: mapeia para o schema comum
      → writer.add(record)                ← dedupe por id + append NDJSON + stats
      → writer.save(cursor)               ← checkpoint (permite --resume)
  → summary.json
```

O `watch-<site>.ts` é o mesmo, mas em loop de polling: faz poll da página 1 (ordenada por
recência quando o site permite), compara com o estado `id→linha` e emite só `new` /
`price_change`, com upsert direto na BD via `sink.ts`.

### 1.3 Onde vem a "fonte de dados" (o que distingue os sites)

O trabalho intelectual de cada coletor está no `parse.ts` — descobrir onde o site esconde os
dados estruturados. Há ~5 famílias:

- **JSON-LD `schema.org/Vehicle`** (theparking, autocasion, trovit, autopt, autouncle, quoka…) — o
  site publica-o de propósito para máquinas; robusto a mudanças de CSS.
- **`__NEXT_DATA__` (Next.js SSR)** (autotrader, autoboerse, flexicar, standvirtual, custojusto,
  autoscout24…) — o estado da app embutido no HTML.
- **`__NUXT__` / `__NUXT_DATA__` (Nuxt SSR, formato *devalue*)** (aramisauto via `node:vm`,
  meinauto, carplus) — precisa de re-hidratar o grafo de referências.
- **Card HTML server-rendered** (santogal, autosapo, ooyyo, quoka) — quando não há bloco
  estruturado, faz-se scrape do próprio cartão.
- **API JSON interna** (autohero GraphQL, caetano "Digital Store", ooyyo qselements) — quando o
  robots permite e a API não exige token.

**Isto é independente da linguagem.** Reescrever em Python não simplifica nenhum destes parses —
a complexidade é o formato do site, não a sintaxe do TS.

---

## 2. Anti-deteção / anti-bloqueio de IP — o que EXISTE hoje

A filosofia do projeto está escrita em [`lib/http.ts`](../tools/collector/lib/http.ts):
**"HTTP puro, sem browser"**. A investigação de cada site confirmou que um `GET` com
User-Agent de browser passa o Cloudflare/DataDome *passivo* dos sites (200, sem challenge) →
rápido e barato, sem Playwright.

### O que o cliente HTTP faz (`lib/http.ts`)

- **User-Agent de browser fixo** — Chrome 126 / macOS. Um só, não roda.
- **Cookie jar** — guarda e reenvia cookies para manter a sessão (importa para o
  Imperva/Incapsula passivo do autoboerse, p.ex.).
- **Rate-limit `_throttle()`** — `minDelayMs` (default 1500 ms) + `jitterMs` aleatório entre
  pedidos. Muitos sites sobem o default por cortesia (aramisauto/ultimatespecs honram o
  `Crawl-delay`; ooyyo usa 30 s).
- **Retry com backoff** — 4 tentativas, backoff exponencial (1s, 2s, 4s…), com um `validate()`
  opcional que trata "200 mas página vazia" (anti-bot intermitente) como retryável.
- **Guarda robots (`assertAllowed`)** — recusa qualquer path na lista disallow do site. É uma
  medida de *boa cidadania*, não de evasão.

### O que NÃO existe (e é importante para a pergunta sobre "bloquear IP")

- **❌ Sem proxies.** Não há rotação de IP, nem residential, nem SOCKS — confirmado por grep em
  todo o `tools/collector`. Todos os pedidos saem do IP da máquina que corre o coletor.
- **❌ Sem rotação de User-Agent.** Um UA fixo para todos.
- **❌ Sem TLS/JA3 impersonation no lado HTTP puro** (usa o `fetch` nativo do Node).

> **Consequência direta para o objetivo do utilizador:** "manter as medidas anti-deteção /
> anti-bloqueio de IP" — hoje a única defesa contra bloqueio de IP é **ir devagar** (rate-limit
> + backoff + honrar robots). Não há infra de proxies. Se o objetivo é acelerar sem ser
> bloqueado, o rate-limit é exatamente o que teria de ceder — e aí a proteção de IP passa a
> depender de algo que **ainda não existe** (ver secção 4).

### A exceção: browser stealth (já em Python)

Alguns sites têm Cloudflare **ativo** (403 a qualquer cliente não-browser, mesmo com headers
completos). Para esses — e **só esses** — usa-se browser stealth:

- **[`piscapisca/fetcher.py`](../tools/collector/piscapisca/fetcher.py)** — o coletor inteiro do
  piscapisca.pt (~56k viaturas) é Python, com [Scrapling](https://github.com/D4Vinci/Scrapling)
  `StealthySession` (Camoufox headless, `solve_cloudflare=True`). Uma **sessão quente** resolve o
  challenge UMA vez e reutiliza o `cf_clearance`.
- **[`autouncle/stealth_fetch.py`](../tools/collector/autouncle/stealth_fetch.py)** — um daemon
  Python que serve **só o transporte** (busca o HTML cru) para os 4 domínios autouncle com CF
  ativo (de, it, es, uk). O parse fica em TS.

O **bridge** [`autouncle/stealth.ts`](../tools/collector/autouncle/stealth.ts) é a peça-chave
desta investigação: um `StealthHttpClient` com a **mesma interface** do `HttpClient`, que em vez
de `fetch()` fala com o daemon Python por STDIN + FD 3 (JSON por linha, HTML em base64). Isto
prova que **o padrão híbrido TS↔Python já está resolvido e é elegante**: o Node orquestra tudo,
o Python entra só onde é insubstituível (o browser stealth).

Dependência isolada: `scrapling[fetchers]==0.4.11`, cada um no seu venv (`piscapisca/.venv`,
`autouncle/.venv`), Camoufox de centenas de MB. Os 23 coletores Node continuam zero-deps.

---

## 3. Velocidade — onde está o gargalo (e não é o TypeScript)

O throughput hoje é limitado por **três coisas, todas deliberadas**:

1. **1 pedido de cada vez, por site.** O `HttpClient` serializa (`_lastReqAt`); o `runPagedCrawl`
   é um `for query { for page }` sequencial. Não há concorrência dentro de um coletor (exceto
   ultimatespecs `--fast`).
2. **Rate-limit + jitter** entre pedidos (1,5 s típico; até 30 s onde o robots pede).
3. **Sem paralelismo entre sites** no orquestrador — cada `run-<site>.ts` é um processo à parte,
   lançado à mão. Não há um scheduler que corra os 24 em paralelo (o `run-daily.ts` só faz
   *ingest* do NDJSON para a BD; a recolha em si é manual).

### O acelerador que já existe — e que é a prova de conceito

O `ultimatespecs --fast` ([`ultimatespecs/crawl.ts:94-207`](../tools/collector/ultimatespecs/crawl.ts))
corre um **pool de N workers** (default 6), cada um com o seu `HttpClient` (throttle por
instância) a consumir uma fila partilhada → ~6 pedidos/s → o catálogo completo passa de **~20
dias para ~3 h**. É TypeScript puro. Mostra que a velocidade se resolve com **concorrência
controlada no orquestrador**, não com a linguagem.

**Conclusão:** Node/TS não é o gargalo. O trabalho é I/O-bound (esperar respostas HTTP); Python
não seria mais rápido — seria igual ou mais lento (o `asyncio`/`httpx` daria o mesmo perfil que
o `fetch` concorrente do Node). Migrar não compra velocidade nenhuma.

---

## 4. A pergunta central: migrar tudo para Python?

### 4.1 "Fica mais organizado" — não fica

A base já está bem organizada (secção 1.1): molde fixo, `lib/` partilhado, ~100 linhas por
ficheiro, checkpoint/resume/stats grátis para todos. Uma reescrita para Python:

- **Reescreve ~15.200 linhas** de parses delicados (JSON-LD com newlines literais, devalue do
  Nuxt, `node:vm` do aramisauto, GraphQL do autohero) — cada um é uma fonte de bugs de
  regressão silenciosos (um campo mal mapeado = dados errados na BD, não um crash).
- **Perde o acoplamento com o frontend.** O `db-sink.ts` usa `postgres` (a mesma lib do
  frontend, resolvida do `node_modules` da raiz) e o schema Drizzle. Em Python teria de
  reimplementar o upsert canónico — incluindo a lógica subtil do "precio al contado ES" e do
  histórico de preço — e manter dois clientes de BD em sincronia. **Risco alto** (o CLAUDE.md
  do projeto avisa que a BD já rebentou a produção uma vez por dessincronização código↔schema).
- **Não remove o Python.** Os sites com CF ativo continuariam em Python. Ficaria tudo Python,
  sim, mas o "insubstituível" e o "trivial" misturados — perdendo a separação limpa atual
  (Node orquestra, Python só stealth).

### 4.2 O que o Python traz de facto (e onde vale a pena)

O Python **só** é obrigatório para o **browser stealth** (Scrapling/Camoufox — não há equivalente
maduro em Node; `puppeteer-extra-stealth` é mais fraco contra o CF managed challenge). Isso já
está feito e isolado. Se, no futuro, **mais sites** passarem a CF ativo, a jogada certa **não é
migrar o coletor** — é reutilizar o **bridge stealth** (secção 2, `stealth.ts`): manter o
parse/schema/crawl em TS e trocar só o transporte. O autouncle já faz exatamente isto para 4
domínios sem reescrever nada.

### 4.3 Anti-deteção / anti-bloqueio: o que realmente faria diferença

Se o objetivo é **ir mais depressa sem apanhar bloqueio de IP**, o que falta não é linguagem — é
infra que hoje não existe:

- **Pool de proxies** (residential/datacenter rotativos) — permitiria subir a concorrência sem
  concentrar todos os pedidos num IP. É a medida nº1 real de anti-bloqueio. Independente de
  TS/Python (funciona nos dois via `fetch`/`undici` `ProxyAgent` ou `httpx`).
- **TLS/JA3 impersonation** para o HTTP puro — o `curl_cffi` (Python) ou `undici` com fingerprint
  no lado Node. Só necessário se os sites passivos começarem a exigir; hoje o `fetch` nativo
  passa.
- **Rotação de User-Agent / headers** — trivial, alto valor, qualquer linguagem.

Nenhuma destas exige reescrever os coletores.

---

## 5. Recomendação

**Não migrar os coletores para Python.** A migração é uma reescrita cara de código que já está
limpo, sem ganho de organização, sem ganho de velocidade, e com risco de regressão na
normalização e no acoplamento com a BD do frontend.

Em vez disso, três frentes com retorno real (por ordem de custo/benefício):

1. **Concorrência entre sites no orquestrador (TS).** Generalizar o padrão do `ultimatespecs
   --fast` para um scheduler que corre os 24 coletores em paralelo (processo por site + pool de
   facetas por site), com um teto global de pedidos/s. Ganho de velocidade grande, zero reescrita
   de parses. Ver `run-daily.ts` como ponto de entrada natural.
2. **Infra de anti-bloqueio partilhada no `lib/http.ts`:** rotação de UA/headers + suporte
   opcional a pool de proxies. É aqui que se compra "acelerar sem bloquear IP", e beneficia os 24
   de uma vez.
3. **Generalizar o bridge stealth** (`stealth.ts` → `lib/`) para que qualquer coletor possa, por
   flag, trocar o transporte HTTP puro pelo Camoufox se o site passar a CF ativo — sem virar um
   coletor Python. Mantém a regra "Python só onde é insubstituível".

Se ainda assim se quiser **uniformizar linguagem**, a direção honesta seria a **inversa** da
proposta: manter tudo em **TS** e reescrever o piscapisca para usar o **mesmo bridge stealth** do
autouncle (parse em TS, transporte no daemon Python), eliminando o único coletor "todo Python" e
ficando com uma só arquitetura.

---

## Anexos — factos apurados

- **Tamanho:** ~15.200 linhas TS (24 coletores + `lib/` + CLIs) vs ~920 linhas Python
  (piscapisca completo + bridge stealth do autouncle).
- **Execução:** Node 23 corre os `.ts` diretamente (type-stripping nativo); `node run-<site>.ts`.
  Os Python correm com o venv do subdiretório: `piscapisca/.venv/bin/python run-piscapisca.py`.
- **Sem scheduler de recolha:** os coletores são lançados à mão (batch ou watch contínuo). O
  `pnpm pipeline:daily` só faz *ingest* do NDJSON acumulado em `out/` para a BD.
- **Anti-bot por site:** ~19 passam a HTTP puro (CF/DataDome/Imperva passivos); 2 casos usam
  stealth Python (piscapisca; 4 domínios autouncle: de/it/es/uk). Detalhe site-a-site no
  [`README`](../tools/collector/README.md) do collector.
- **Sem proxies, sem rotação de UA** em lado nenhum (verificado por grep).
</content>
</invoke>
