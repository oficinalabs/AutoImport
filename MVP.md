# MVP — o que falta para o AutoImport estar pronto a usar

> **Auditoria de 3 de agosto de 2026**, sobre a `main` em `d61601d`, com o
> warehouse local (598 947 anúncios) e a app a correr em `pnpm dev` + `next build`.
> Cada item foi **verificado**, não inferido.
>
> **Corrigido no mesmo dia**, na branch `feat/mvp`. As secções abaixo mantêm o
> diagnóstico original — é ele que explica *porque* as coisas ficaram como
> ficaram — com o desfecho de cada item marcado.

---

## 0. Estado num relance

| Camada | Estado |
|---|---|
| Qualidade de código | ✅ Biome · `tsc --noEmit` · **203 testes** (200 + 3 de fumo) · `next build` |
| Motor de custos (ISV/IUC/transporte/legalização) | ✅ Funciona, com testes |
| Pipeline (ingest → match → mercado PT → custos → oportunidades) | ✅ Funciona ponta-a-ponta |
| Auth (registo, login, verificação de email, reset, multi-tenant) | ✅ Funciona |
| Landing pública | ✅ Números reais |
| Detalhe do anúncio / favoritos / comparar | ✅ Funcionam |
| **Pesquisa** | ✅ **Corrigida** — filtros em SQL, paginação, ordenação por % |
| **Alertas** | ✅ **Corrigidos** — nasciam todos mortos; ver P1-4 |
| **Pagamentos** | 🟡 Estado, gate e webhook prontos; **falta o checkout** (credenciais) |
| **Frescura dos dados** | 🟡 Indicador e alarme prontos; **falta decidir onde corre a recolha** |
| Negociações / Compras | ⬜ Escondidas do MVP, por decisão |
| Observabilidade (Sentry) | ⬜ Decidido adiar, com receita escrita — ver P2 |

**Veredito de então:** o motor está pronto, o produto não.
**Agora:** o produto é utilizável. Falta ser **vendável** (cobrar) e **fiável**
(os dados atualizarem-se sozinhos) — e as duas dependem de decisões e
credenciais que não vivem no código.

### O que continua nas mãos do dono

1. **Correr a recomputação**, sem a qual a produção mantém as ilhas e o KPI
   inflacionado: `compute-costs --all` → `flag-opportunities` → `pipeline:publish:apply`.
2. **Credenciais da Polar** — a tabela, o webhook e o gate estão prontos e
   testados; falta o checkout e o portal, que precisam de produtos criados do
   lado deles.
3. **Onde corre o daemon da recolha** — o workflow de publicação está escrito e
   inerte à espera dessa decisão (`.github/workflows/publicacao.yml`).

---

## 1. P0 — bloqueadores. Sem isto não se põe um stand a usar.

### P0-1 · A pesquisa não pesquisa

**O que se passa.** [`app/(app)/pesquisar/page.tsx:15`](app/(app)/pesquisar/page.tsx:15)
chama `searchListings()` **sem argumentos**. O servidor devolve sempre as mesmas
60 linhas (`SEARCH_LIMIT = 60` em [`lib/queries.ts:41`](lib/queries.ts:41)),
ordenadas por poupança absoluta. Todos os filtros — texto, país, combustível,
caixa, ano, km, preço, ordenação — correm **em memória sobre essas 60 linhas**
([`components/search-view.tsx:63`](components/search-view.tsx:63)).

**Consequência medida.** Escrevi "Golf" na pesquisa: **0 resultados**. A montra
tem 900 Golfs. O painel diz "11 721 a compensar" e a pesquisa mostra 60 — sempre
os mesmos 60, e são todos Lamborghini/Ferrari, porque ordenar por poupança
**absoluta** põe supercarros no topo. Preço médio dos 60 visíveis: **147 169 €**.
O público-alvo são stands de usados: 87% das oportunidades reais estão **abaixo
de 40 000 €**.

Um stand que abra a pesquisa e procure o que costuma vender não encontra nada.
É o gesto central do produto e não funciona.

- [x] Passar os filtros do URL para `searchListings()` (a query do servidor **já
      os suporta** — `SearchFilters` está completo em `lib/data.ts:59`)
- [x] Levar os filtros em falta para SQL: `minYear`, `maxKm`, `fuel`, `gearbox`
- [x] Paginação (ou scroll infinito) — 60 é um teto, não um resultado
- [x] Estado dos filtros no URL (partilhar/voltar atrás tem de funcionar)
- [x] **Repensar a ordenação por omissão.** Poupança absoluta é a métrica errada
      para quem compra carros de 25 k€. Sugestão: ordenar por `savings_pct`, ou
      por poupança dentro de um escalão de preço

> **✅ Feito.** "Golf" passou de 0 para **761** resultados; o total real (32 920)
> substituiu o "60 anúncios" que a UI mostrava. O dedupe passou de `NOT EXISTS`
> correlacionado a `DISTINCT ON`, com equivalência provada sobre o corpus real
> (32 920 = 32 920, zero diferenças). Ordenação por omissão: `savings_pct`.
>
> Dois bugs que só os testes novos apanharam: numa página vazia o
> `count(*) over()` não vinha em linha nenhuma e o total dava 0; e o filtro de
> caixa tem de tratar `gearbox` nulo como manual, senão contradiz o cartão.
>
> **Medido depois** (publiquei a montra para uma base descartável — 39 759
> anúncios, 86 MB, o tamanho da produção — e cronometrei a app compilada):
>
> | | |
> |---|---|
> | `/painel` | **34–92 ms** (era 8–19 s em dev) |
> | `/pesquisar?q=Golf` | **~530 ms** |
> | `/pesquisar` sem filtros | **~1,8 s** |
>
> **Não é preciso índice nenhum, e isso foi testado, não assumido.** Criei um
> índice funcional sobre a expressão de identidade e o tempo não mexeu: 1,83 s
> com e sem. O custo não está a ordenar a identidade — está em percorrer a montra
> inteira para deduplicar, coisa que nenhum índice evita.
>
> ⚠️ O `NOT EXISTS` antigo, na **mesma base** e com a mesma forma de query (6
> joins + `LIMIT`), **não terminou em 10 minutos** — tive de o cancelar. Na forma
> em que eu o tinha medido antes (sem os joins e sem limite) fazia 278 ms. Ou
> seja: era um campo minado de planeador, rápido numa forma e catastrófico
> noutra. Isso explica os 8–19 s do painel na auditoria.
>
> ⬜ **Fica em aberto:** 1,8 s na pesquisa sem filtros é aceitável para arrancar,
> mas é o número a vigiar. A cura é materializar o representante numa coluna
> (escrita pelo pipeline), com migration e republicação — mais barulho do que o
> problema justifica hoje.

### P0-2 · Não há como cobrar

A métrica de sucesso do projeto é "nº de stands pagantes" ([docs/00-GERAL.md](docs/00-GERAL.md)).
Hoje é estruturalmente impossível chegar a um.

- A landing vende "100 €/mês, 1.º grátis"; `/legal/subscricao` e
  `/legal/privacidade` **nomeiam a Polar** como *Merchant of Record*
- `POLAR_ACCESS_TOKEN` / `POLAR_WEBHOOK_SECRET` estão no `.env.example` e **não
  são lidos em lado nenhum do código**
- O estado da subscrição é **derivado da data de registo**
  ([`lib/queries.ts:523`](lib/queries.ts:523)): `createdAt + 30 dias` → `trial`,
  depois → `expirada`
- O botão "Gerir subscrição" em `/stand` está `disabled` com
  `title="Ainda não disponível"`
- **Nada acontece quando o trial expira.** O estado muda de etiqueta e a app
  continua toda acessível

- [ ] Integrar a Polar (checkout + webhooks) e persistir o estado real
- [x] Fechar o acesso quando a subscrição expira (hoje o trial não trava nada)
- [ ] Fluxo de upgrade/cancelamento a partir de `/stand`
- [ ] Alinhar os textos legais com o que existe de facto — enquanto não houver
      Polar ligada, prometer Polar nos termos é uma declaração falsa

> **🟡 Metade feito.** Existe a tabela `subscriptions` (migration 0007), o estado
> real com o trial como fallback, o webhook em Standard Webhooks (fail-closed sem
> segredo) e o **gate**: com o período terminado, a app fecha-se e o stand vai
> parar a `/stand`, exatamente como os Termos prometem.
>
> O gate vive no grupo de rotas `app/(app)/(gated)/` e **falha fechado** — uma
> rota nova criada onde as outras vivem fica automaticamente protegida.
>
> ⬜ **Falta o checkout e o portal**, que precisam de `POLAR_ACCESS_TOKEN` e de
> produtos criados do lado da Polar. Até lá o botão "Gerir subscrição" fica
> honestamente desativado. A interop do webhook **está por confirmar** contra a
> sandbox: um verificador HMAC testado contra si próprio prova a lógica, não a
> compatibilidade.
>
> Os textos legais **não foram tocados**, por decisão — têm implicações
> jurídicas. Ficam falsos até a Polar estar ligada.

### P0-3 · Os dados não se atualizam sozinhos

A landing diz "ATUALIZADO A 27 DE JULHO". Hoje é **3 de agosto**.

Medido no warehouse:

| País | Última leitura | Anúncios vivos |
|---|---|---|
| DE | 2026-07-27 | 240 153 |
| PT | 2026-07-27 | 173 892 |
| ES | 2026-07-22 | 161 403 |
| BE | 2026-07-22 | 13 020 |
| FR | 2026-07-22 | 6 665 |
| NL | 2026-07-22 | 3 604 |

**Porquê.** `.github/workflows/daily-batch.yml` **já não tem `schedule:`** — é só
`workflow_dispatch`. A recolha mudou-se para o daemon local
(`tools/collector/probe/collector-daemon.mjs`), na máquina do operador, e a
publicação para produção é um comando **corrido à mão**:
`DB_TARGET=prod pnpm exec tsx scripts/pipeline/publish.ts --apply`.

Ou seja: **se ninguém ligar o portátil, a produção envelhece em silêncio.** Um
produto que se apresenta como "todos os dias recalculamos" não pode depender
disso. É a promessa central da landing e o que justifica os 100 €/mês.

- [ ] Decidir o modelo operacional: máquina sempre ligada (VPS/mini-PC) ou voltar
      à nuvem para as fontes que aguentam IP de datacenter
- [ ] Automatizar a publicação (hoje 100% manual, sem agendamento)
- [x] **Alarme de frescura**: se a última leitura passar das X horas, avisar a
      equipa — e dizê-lo na UI antes que seja um cliente a descobrir
- [ ] Corrigir a assimetria de cobertura: FR (6,6 k) e NL (3,6 k) contra DE
      (240 k). A landing promete "cinco mercados europeus"; dois deles são
      residuais

> **🟡 O que dava para fazer em código, está.** `pnpm pipeline:frescura` mede a
> idade da leitura mais recente e **falha** acima das 36 h (corrido contra o
> warehouse: 164,8 h → vermelho); corre em cron próprio em `frescura.yml`. A app
> autenticada passou a mostrar o indicador na barra de topo — só a landing o
> mostrava, e a landing é a página que a equipa não abre.
>
> `publicacao.yml` está escrito, com o `schedule` **comentado** e
> `runs-on: [self-hosted, warehouse]`. Não é esquecimento: o `publish.ts` lê o
> corpus local, que um runner da GitHub não tem nem pode ter.
>
> ⬜ **Falta a decisão de infraestrutura** — onde corre o daemon. É o que
> desbloqueia tudo o resto.

---

## 2. P1 — a app mente ou baralha. Corrigir antes de mostrar a um cliente.

### P1-1 · "Bom dia, Rui 👋" está escrito à mão

[`app/(app)/painel/page.tsx:25`](app/(app)/painel/page.tsx:25). Registei-me como
"QA Bot" e o painel deu-me os bons dias como Rui. O `TopBar` ao lado já mostra o
nome certo (a sessão está disponível no layout). É uma linha, e é a primeira
coisa que um cliente vê.

- [x] Usar `getSessionUser()`

### P1-2 · O KPI de oportunidades não bate certo com o que é possível ver

Números medidos hoje:

- `opportunities` ativas: **11 721** ← é o que a landing e o painel mostram
- dessas, as que passam a regra da montra (`exato` + `normal` + `compensa`) e
  portanto são **realmente visíveis**: **6 402**

A causa: [`scripts/pipeline/flag-opportunities.ts:33`](scripts/pipeline/flag-opportunities.ts:33)
filtra por `verdict='compensa'` e `pt_confidence='normal'`, mas **não** por
`match_confidence='exato'` — que a montra exige
([`lib/queries.ts:216`](lib/queries.ts:216)). O KPI conta um universo maior do
que o que a lista consegue mostrar: quase **metade** do número anunciado não
tem página onde aterrar.

- [x] Alinhar `flag-opportunities` com `MONTRA_MATCH_CONFIDENCE` (a constante já
      existe e é exportada precisamente para isto)

> **✅ Feito** — e não é só o número. O alinhamento **corrige o dedupe**: um match
> `designacao` com poupança maior tapava o `exato` do mesmo carro, que é o único
> publicável, e o carro ficava de fora dos dois lados. Medido: 11 766 pela regra
> antiga → 6 439 pela nova, dos quais +10 são carros que antes não apareciam
> em lado nenhum.
>
> ⚠️ **O KPI público cai quase para metade.** É a correção de uma mentira, mas é
> visível — e só acontece depois de correr `flag-opportunities` e republicar.

### P1-3 · "Km por verificar" em 100% dos anúncios

`kmTrust` é `l.vin ? "disponivel" : "por_verificar"`
([`lib/queries.ts:196`](lib/queries.ts:196)). **Nenhum dos 39 759 anúncios da
montra tem VIN** — verifiquei. Logo o aviso laranja aparecia em todos os
cartões, sempre. Um aviso que nunca varia deixa de ser informação e passa a
ruído; e o utilizador aprende a ignorá-lo, que é o oposto do que se quer num
sinal de fraude.

**Medido (3 ago), no conjunto da montra — `exato` + `pt_confidence normal`:**

| | |
|---|---|
| anúncios | 39 759 |
| com coluna `vin` | **0** |
| linhas com `vin` em todo o warehouse | 3 908 — **todas PT** (Caetano 2 372, CarPlus 1 023, OLX 513), i.e. a amostra de comparação, nunca a montra |
| `detail_url` que casam com o regex de VIN de 17 chars | 1 158 — e **nenhum é um VIN** |

O fallback "VIN no URL" do [`lib/engine/car-identity.ts`](lib/engine/car-identity.ts)
**não serve aqui**: dos 1 158, 1 032 são hashes SHA-1 do meinauto.de
(`/fahrzeugsuche/detail/007f59b2f834ed69caf…`), 78 são ids de slug do Quoka,
47 URLs de tracking do Trovit e 1 do Ooyyo. Como chave de dedupe um hash estável
por anúncio é inofensivo; como sinal de confiança faria o cartão anunciar
"Histórico disponível · VIN" sobre um carro sem VIN nenhum — mentir é pior do que
o ruído. **Não foi escrito código para isto, de propósito.**

- [x] Badge fora do cartão. [`components/car-card.tsx:87`](components/car-card.tsx:87)
      só mostra o `KmTrustBadge` quando o nível **não** é `por_verificar` — hoje
      não aparece em nenhum cartão, e volta sozinho no dia em que houver
      informação real, sem ser preciso re-adicionar código. A mensagem completa
      continua dita **uma vez**, no bloco "Confiança" da ficha do anúncio
      ([`app/(app)/(gated)/anuncio/[id]/page.tsx:193`](app/\(app\)/\(gated\)/anuncio/[id]/page.tsx:193)),
      onde vem com a explicação e não a competir com mais 23 cartões
- [ ] VIN a sério: só de uma fonte que o publique, ou de carVertical/autoDNA.

> **✅ O ruído saiu; o VIN continua a não existir.** O badge deixou de aparecer
> quando não há informação — a mensagem fica dita uma vez, no bloco "CONFIANÇA"
> da ficha.
>
> ⚠️ **Reaproveitar o VIN que o `car-identity.ts` extrai do URL foi medido e
> recusado.** Dos 1 158 anúncios em que o regex de 17 caracteres casa, **zero são
> VINs**: 1 032 são hashes SHA-1 do meinauto.de, 78 ids de slug do Quoka, 47 URLs
> de tracking do Trovit. Como chave de dedupe um hash estável é inofensivo; aqui
> faria o cartão anunciar "Histórico disponível · VIN" sobre carros sem VIN
> nenhum. Trocar ruído por mentira não é melhoria.
      O nível `"verificado"` do tipo `KmTrust` continua sem ser produzido por
      código nenhum

### P1-4 · Os alertas não dizem quantas vezes dispararam

`matchCount: 0` está escrito à mão em [`lib/queries.ts:433`](lib/queries.ts:433)
com o comentário *"preenchido quando o job de matching de alertas existir"* — mas
o job **já existe** (`scripts/pipeline/match-alerts.ts`, com cron próprio em
`.github/workflows/alerts.yml`) e `alert_events` já é lido pelo sino. A UI de
`/alertas` esconde o badge quando é 0, portanto nunca o mostra.

Além disso o matching casa por **igualdade exata** de `make_raw`/`model_raw` em
minúsculas ([`match-alerts.ts:71`](scripts/pipeline/match-alerts.ts:71)). No
corpus real convivem `VOLKSWAGEN`/`Volkswagen` e `Golf`/`Golf VII`/`Golf VIII` —
um alerta criado a partir de um "Golf VII" **nunca** verá um "Golf".

- [x] Contar de `alert_events` (`matchCount` + `lastMatchAt`)
- [x] Casar por `model_id`/família em vez de texto cru
- [x] Não há forma de **apagar** um alerta — só desativar

> **✅ Feito, e era pior do que isto.** O formulário de `/alertas` não gravava
> marca/modelo, e o matching casava por `lower(criteria->>'make')` — que com a
> chave ausente é `lower(NULL)`, nunca verdadeiro. **Todos os alertas criados na
> página nasciam mortos**, em silêncio. Não escolher países fazia o mesmo
> (`any('{}')` nunca é verdade).
>
> A unidade de matching **não** é o `model_id`, ao contrário do que este
> documento sugeria: o `vehicle_models` separa por combustível, portanto casar
> por id deixava metade dos Golfs de fora. Casa-se pela família normalizada
> (marca, modelo).
>
> A caixa de texto livre desapareceu — escolhe-se de uma lista real de famílias
> que existem na montra. É melhor recusar "Golf 2.0 TDI" do que aceitar em
> silêncio um alerta que nunca vai avisar ninguém.

### P1-5 · Negociações e Compras são becos sem saída

"Iniciar negociação" na página do anúncio é um `<Link href="/negociacoes">`, e
`/negociacoes` diz *"Quando contactares um vendedor a partir de um anúncio, a
conversa aparece aqui"*. Não há como contactar. `getConversations()` e
`getDeals()` devolvem `[]` por construção ([`lib/data.ts:223`](lib/data.ts:223)).
O painel e a navegação principal dão-lhes destaque igual ao das funcionalidades
que existem.

Decisão a tomar, uma das duas:

- [ ] **Construir** o email mascarado + pipeline de compra (é trabalho grande), **ou**
- [x] **Esconder** as duas rotas do MVP e trocar "Iniciar negociação" por
      "Ver anúncio em \<fonte\>", que é o que o stand vai mesmo fazer

Recomendo a segunda para o MVP: o valor está na inteligência de decisão (que é o
âmbito declarado em `docs/00-GERAL.md`), não em ser um inbox.

### P1-6 · Transporte é uma constante por país — e há 1 384 carros nas ilhas

[`lib/cost-engine/transport.ts`](lib/cost-engine/transport.ts) tem um valor fixo
por país (ES 450 €, DE 1100 €…). Encontrei **1 384 anúncios da montra em Las
Palmas / Canárias / Baleares** a receberem os mesmos 450 € de um carro em Madrid.
Um deles apareceu-me em teste com a marca d'água "LAS PALMAS" na foto. Além do
custo de ferry, as Canárias estão **fora do território IVA da UE** — a conta de
importação não é a mesma.

- [x] Excluir as ilhas, ou dar-lhes um custo próprio e um aviso na ficha
- [ ] Modular o transporte por região/distância, nem que seja em escalões

> **✅ As ilhas saem da montra** (decisão do dono: não fingir que sabemos
> calcular). 8 398 anúncios ES apanhados, 2 319 estimativas passam a órfãs, 559
> oportunidades caem (4,8%).
>
> Duas armadilhas que a implementação obrigou a resolver: `07xxx` também é código
> postal alemão (6 410 anúncios DE), e "palma" sozinho apanha Palma del Río, que
> é continente. Só 12% dos anúncios ES têm código postal, portanto o texto da
> região não é redundância — é o caminho principal. Falha aberto: sem região e
> sem CP, o anúncio fica.
>
> ⚠️ **Exige `compute-costs --all` + `flag-opportunities` + republicar** para a
> produção deixar de as mostrar.

---

## 3. P2 — dívida a fechar antes de abrir ao público

- [x] **`/mockups` está público em produção** (~4,4 MB). ~~Já documentado em
      [`docs/00-VISAO.md`](docs/00-VISAO.md) com instruções de remoção. A direção
      de design já foi escolhida — remover~~ Feito: `public/mockups/` apagado e a
      entrada saiu do `app/robots.ts`. As maquetes continuam em
      `design/direcoes/` (não são servidas)
- [ ] **Sem Sentry e sem PostHog.** Estão na stack fixa
      (`docs/00-GERAL.md`) e no `.env.example`; não estão no código. Sem eles não
      se sabe o que rebenta a um cliente. A UI já mostra o `digest` do erro para
      cruzar com logs — falta o sítio onde cruzar.

      **Decisão (3 ago): não instalar ainda — instalar com o DSN à mão, antes do
      primeiro piloto.** Não é preguiça, é a regra do `CLAUDE.md`: *CI verde ≠
      produção OK*. Não há DSN, nem `SENTRY_ORG`, nem `SENTRY_AUTH_TOKEN` nesta
      máquina, portanto **nada do que se instalasse podia ser verificado**: não
      se veria um único evento chegar. O que se mergia era um plugin de webpack a
      envolver o `next.config.mjs` (que acabou de receber a CSP), a ligar geração
      e upload de source maps no build da Vercel — o mesmo build que já partiu
      produção uma vez — e ~20–50 kB de JS no cliente, tudo a correr pela
      primeira vez em produção. Um Sentry que ninguém viu funcionar é pior do que
      não ter Sentry: dá a sensação de estar coberto.

      Escrever à mão um POST para o endpoint de envelopes (a alternativa (ii))
      tem o mesmo problema — sem DSN não se confirma que o envelope é aceite (um
      envelope malformado leva 400 em silêncio) — e ainda deixava código morto no
      repositório enquanto o DSN não existisse.

      **O que se perde entretanto, exatamente:** os erros de *servidor* já são
      observáveis — o Next escreve o digest nos logs da Vercel, e é com esse
      digest que o `ErrorState` deixa o cliente falar connosco. O buraco real são
      os erros de **cliente**: o `console.error` de
      [`app/error.tsx:20`](app/error.tsx:20), [`app/(app)/error.tsx:21`](app/\(app\)/error.tsx:21)
      e [`app/global-error.tsx:27`](app/global-error.tsx:27) fica no browser do
      utilizador e não chega a ninguém.

      **Receita, para quem tiver o DSN** (investigada a 3 ago, `@sentry/nextjs`
      v10, Next 15 App Router — [manual setup](https://docs.sentry.io/platforms/javascript/guides/nextjs/manual-setup)):

      1. `instrumentation.ts` na raiz: `register()` importa
         `sentry.server.config.ts` / `sentry.edge.config.ts` conforme
         `NEXT_RUNTIME`, e `export const onRequestError = Sentry.captureRequestError`
         — é isto que apanha erros de Server Component, que é a classe de erro
         que já partiu produção aqui
      2. `instrumentation-client.ts` para o browser, **com init condicional**:
         `if (process.env.NEXT_PUBLIC_SENTRY_DSN) Sentry.init({…})`. Um
         `Sentry.init` com DSN vazio não envia nada, mas continua a instalar
         handlers globais e a embrulhar o `fetch`; a app tem de ficar exatamente
         como está hoje quando a variável não existir
      3. Só erros: **sem** `browserTracingIntegration` e **sem** Session Replay
         (o Replay ainda obrigaria a abrir `worker-src blob:` na CSP, e não
         combina com a postura de privacidade do projeto)
      4. `tunnelRoute: "/monitoring"` no `withSentryConfig` — o browser passa a
         POSTar para a nossa própria origem, portanto **o `connect-src 'self'`
         do `next.config.mjs` fica intocado**: não é preciso abrir
         `*.ingest.sentry.io` a ninguém. O matcher do `middleware.ts` já não
         apanha `/monitoring`
      5. Nos 3 boundaries: acrescentar `Sentry.captureException(error)` dentro do
         `useEffect` que já existe. **Não** adotar o `global-error.tsx` de
         exemplo da Sentry — substitui o ecrã por `NextError` e deitava fora o
         nosso, que é de propósito auto-suficiente (sem fontes, sem tema)
      6. Env: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN` na Vercel (e no
         `.env.example`). Sem token o build **passa na mesma**, só não
         simboliza os stack traces
      7. Verificar depois: `pnpm test:smoke` — o `distDir` é dinâmico
         (`NEXT_DIST_DIR`, `next.config.mjs:108`) e o plugin da Sentry assume o
         standard
      8. Com Sentry no ar, a CSP ganha finalmente um `report-uri` para onde
         apontar — é o que falta para a passar de `Report-Only` a header a sério
         (item seguinte)
- [ ] **`Content-Security-Policy` ainda em `Report-Only`.** A política está
      escrita no `next.config.mjs` e não bloqueia nada — só reporta. Falta
      observar produção durante um tempo e, se estiver limpa, passar ao header
      a sério (`Content-Security-Policy`)
- [ ] **Performance da montra.** `/painel` levou **8–19 s** em dev; a query de
      dedupe por identidade de carro leva **3,4 s** sozinha sobre o warehouse.
      Em produção o conjunto publicado é menor, mas a forma da query é a mesma.
      Medir com dados de produção e indexar antes de pôr utilizadores lá
- [x] **Sem testes da app.** Os 157 testes cobrem coletores, motor de custos e
      pipeline — não há um único teste de componente ou E2E. Os bugs P0-1 e P1-1
      teriam sido apanhados por um smoke test de duas linhas
- [ ] Tabelas de ISV só de **2026** (`isv_tables`). Confirmar o plano de
      atualização anual antes da viragem do ano
- [x] `components/demo-banner.tsx` é código morto — nada o importa
- [x] ~~Um UUID inválido em `/anuncio/<lixo>` dá erro 500 (com o boundary bonito,
      mas mesmo assim) em vez de 404~~ Feito: as páginas validam o formato antes
      de ir à base de dados (`/anuncio` → 404, `/comparar` → ignora os ids
      malformados)
- [x] ~~Em mobile, a etiqueta "Comparar" sobrepõe o badge "Compensa" no cartão~~
      Feito: acontecia nas duas larguras, não só em mobile — os dois ocupavam
      `left-2 top-2`. A etiqueta passou para `top-9`
      ([`components/search-view.tsx:328`](components/search-view.tsx:328)),
      debaixo do veredito, sem tocar no `CarCard` (que é o mesmo dos favoritos,
      onde não há "Comparar"). Verificado a 1440 e a 375: sem interseção de
      caixas
- [ ] A poupança aparece como **"−95 958 €"**. O sinal negativo lê-se como
      prejuízo; é poupança. Confirmar que é mesmo a leitura pretendida

---

## 4. Riscos que não se resolvem com código

- **Legalidade da recolha.** Continua por fechar o *"parecer sobre agregação/scraping
  das fontes (ToS + direito da UE sobre bases de dados)"* — está marcado como
  **bloqueador** em [`docs/06-SERVICOS-EXTERNOS.md`](docs/06-SERVICOS-EXTERNOS.md)
  e em [`docs/README.md`](docs/README.md), e o produto foi construído em cima
  dele na mesma. Vale a pena decidir conscientemente se se avança assim.
- **Convidar equipa está desativado.** A landing vende "toda a equipa do stand
  incluída". Hoje um stand = um utilizador (`Convidar` está `disabled`). Ou se
  implementa, ou se muda o texto comercial.
- **Não verifiquei a Supabase de produção** (regra do `CLAUDE.md`: não correr
  contra a base real sem confirmação). Fica por confirmar: quando foi a última
  publicação e o que está lá dentro neste momento.

---

## 5. O que falta, por ordem

O código está feito. O que resta são **operações e decisões** — nada disto se
resolve escrevendo mais linhas.

1. **Correr a recomputação.** Nada do que se corrigiu no motor chega à produção
   sem isto, e são duas coisas de raio de explosão grande a acontecer ao mesmo
   tempo (as ilhas mudam os `savings`, o alinhamento do KPI muda as
   oportunidades). Sugestão: correr, comparar a distribuição de vereditos antes e
   depois, e só então publicar.

       pnpm exec tsx scripts/pipeline/compute-costs.ts --all
       pnpm exec tsx scripts/pipeline/flag-opportunities.ts
       DB_TARGET=prod pnpm pipeline:publish          # ensaio primeiro
       DB_TARGET=prod pnpm pipeline:publish:apply

   ⚠️ Contar com o KPI público a cair de ~11 700 para ~6 400.

2. **Decidir onde corre a recolha** (P0-3). É a decisão que sustenta a promessa
   central da landing, e a única coisa que impede os dados de envelhecerem em
   silêncio. O alarme já avisa; alguém tem de poder agir sobre ele.

3. **Credenciais da Polar** (P0-2). Bloqueia a receita, não o uso: um piloto com
   3–5 stands em trial pode começar antes. Mas a cobrança tem de estar pronta
   **antes de o primeiro trial acabar** — e agora o trial fecha mesmo a porta.

4. **Sentry**, com o DSN à mão, antes do primeiro cliente (receita em P2).

5. **Cobertura de FR e NL** — 6,6 k e 3,6 k anúncios contra 240 k da Alemanha. A
   landing promete cinco mercados; dois são residuais. É trabalho de coletores.

### Ficou por fazer, com razão escrita

- **Índice de pesquisa** — só depois de medir `EXPLAIN` sobre dados do tamanho de
  produção. Cada índice é uma migration que não se testa em preview.
- **`gearbox_norm`** — o cartão rotula um DSG como "manual", e o filtro copia
  esse erro de propósito para não o contradizer. A correção a sério é uma coluna
  normalizada, com migration e republicação.
- **Negociações e Compras** — escondidas, não construídas. O âmbito declarado do
  produto é a inteligência de decisão.
- **Convidar equipa** — desativado. A landing vende "toda a equipa incluída".
- **Textos legais** — continuam a nomear a Polar. Ficam falsos até ela estar
  ligada; mexer-lhes é decisão com implicações jurídicas.

---

## 6. O que testei

Para dar contexto ao que está acima:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (157 testes na auditoria; **203**
  depois das correções), `pnpm build` — todos verdes
- Landing, `/ajuda` e as 6 páginas legais — todas 200
- Registo completo no browser → criação de utilizador **e** de organização/owner
  na BD, com verificação de email obrigatória a funcionar
- Login → painel → pesquisa → detalhe do anúncio → favoritar (confirmado na BD)
  → criar alerta (confirmado na BD) → `/alertas` → comparar 3 carros →
  `/negociacoes`, `/compras`, `/stand`
- 404, error boundary (mostra só o `digest`, sem stack nem SQL — correto),
  cabeçalhos de segurança, `robots.txt`, `sitemap.xml`
- Responsivo a 375×812
- Consultas diretas ao warehouse para confirmar cada número citado
- Os dados de teste que criei foram apagados no fim

### E o que passou a estar coberto por testes

A auditoria notou que os 157 testes de então não tocavam num único componente
nem numa única rota — e que os dois piores bugs (P0-1 e P1-1) teriam sido
apanhados por um smoke test trivial. Passaram a existir:

- **`tests/queries/`** — a camada de queries da app, que nunca tinha sido
  testada: filtros da pesquisa, dedupe, paginação, estado da subscrição,
  verificação do webhook, matching de alertas.
- **`tests/smoke/`** — a app **compilada e a servir**, com sessão real, via
  `fetch` e `data-testid`. Sem Playwright e sem jsdom. Corre com
  `pnpm test:smoke` e num passo próprio do CI.

O smoke test foi validado ao contrário: desfiz a correção da pesquisa e ele ficou
vermelho na asserção certa. Um teste que nunca se vê falhar não prova nada.

---

*Documento vivo. Atualizar à medida que os itens forem fechando.*
