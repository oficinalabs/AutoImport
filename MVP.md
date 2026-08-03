# MVP — o que falta para o AutoImport estar pronto a usar

> Avaliação de **3 de agosto de 2026**, feita sobre a `main` em `d61601d`, com o
> warehouse local (598 947 anúncios) e a app a correr em `pnpm dev` + `next build`.
> Cada item abaixo foi **verificado**, não inferido. O que não consegui verificar
> está marcado como tal.

---

## 0. Estado num relance

| Camada | Estado |
|---|---|
| Qualidade de código | ✅ Biome limpo · `tsc --noEmit` limpo · **157/157 testes passam** · `next build` OK |
| Motor de custos (ISV/IUC/transporte/legalização) | ✅ Funciona, com testes | 
| Pipeline (ingest → match → mercado PT → custos → oportunidades) | ✅ Funciona ponta-a-ponta (teste de integração real) |
| Auth (registo, login, verificação de email, reset, multi-tenant) | ✅ Funciona — testado no browser de ponta a ponta |
| Landing pública | ✅ Números reais, bonita, rápida o suficiente |
| Detalhe do anúncio / favoritos / comparar / alertas | ✅ Funcionam |
| **Pesquisa** | ❌ **Não pesquisa** — ver P0-1 |
| **Pagamentos** | ❌ **Não existem** — ver P0-2 |
| **Frescura dos dados** | ❌ **Manual, e já 7 dias atrasada** — ver P0-3 |
| Negociações / Compras | ⬜ Cascas vazias, sem backend |
| Observabilidade (Sentry/PostHog) | ⬜ Na stack fixa, ausente do código |

**Veredito:** o motor está pronto. O produto não. Faltam três coisas para um MVP
utilizável e uma para um MVP **vendável** — e são exatamente as três de baixo.

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

- [ ] Passar os filtros do URL para `searchListings()` (a query do servidor **já
      os suporta** — `SearchFilters` está completo em `lib/data.ts:59`)
- [ ] Levar os filtros em falta para SQL: `minYear`, `maxKm`, `fuel`, `gearbox`
- [ ] Paginação (ou scroll infinito) — 60 é um teto, não um resultado
- [ ] Estado dos filtros no URL (partilhar/voltar atrás tem de funcionar)
- [ ] **Repensar a ordenação por omissão.** Poupança absoluta é a métrica errada
      para quem compra carros de 25 k€. Sugestão: ordenar por `savings_pct`, ou
      por poupança dentro de um escalão de preço

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
- [ ] Fechar o acesso quando a subscrição expira (hoje o trial não trava nada)
- [ ] Fluxo de upgrade/cancelamento a partir de `/stand`
- [ ] Alinhar os textos legais com o que existe de facto — enquanto não houver
      Polar ligada, prometer Polar nos termos é uma declaração falsa

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
- [ ] **Alarme de frescura**: se a última leitura passar das X horas, avisar a
      equipa — e dizê-lo na UI antes que seja um cliente a descobrir
- [ ] Corrigir a assimetria de cobertura: FR (6,6 k) e NL (3,6 k) contra DE
      (240 k). A landing promete "cinco mercados europeus"; dois deles são
      residuais

---

## 2. P1 — a app mente ou baralha. Corrigir antes de mostrar a um cliente.

### P1-1 · "Bom dia, Rui 👋" está escrito à mão

[`app/(app)/painel/page.tsx:25`](app/(app)/painel/page.tsx:25). Registei-me como
"QA Bot" e o painel deu-me os bons dias como Rui. O `TopBar` ao lado já mostra o
nome certo (a sessão está disponível no layout). É uma linha, e é a primeira
coisa que um cliente vê.

- [ ] Usar `getSessionUser()`

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

- [ ] Alinhar `flag-opportunities` com `MONTRA_MATCH_CONFIDENCE` (a constante já
      existe e é exportada precisamente para isto)

### P1-3 · "Km por verificar" em 100% dos anúncios

`kmTrust` é `l.vin ? "disponivel" : "por_verificar"`
([`lib/queries.ts:159`](lib/queries.ts:159)). **Nenhum dos 39 759 anúncios da
montra tem VIN** — verifiquei. Logo o aviso laranja aparece em todos os cartões,
sempre. Um aviso que nunca varia deixa de ser informação e passa a ruído; e o
utilizador aprende a ignorá-lo, que é o oposto do que se quer num sinal de
fraude.

- [ ] Ou extrair VIN onde as fontes o dão, ou integrar carVertical/autoDNA, ou
      tirar o badge e passar a mensagem uma vez só (não por cartão)

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

- [ ] Contar de `alert_events` (`matchCount` + `lastMatchAt`)
- [ ] Casar por `model_id`/família em vez de texto cru
- [ ] Não há forma de **apagar** um alerta — só desativar

### P1-5 · Negociações e Compras são becos sem saída

"Iniciar negociação" na página do anúncio é um `<Link href="/negociacoes">`, e
`/negociacoes` diz *"Quando contactares um vendedor a partir de um anúncio, a
conversa aparece aqui"*. Não há como contactar. `getConversations()` e
`getDeals()` devolvem `[]` por construção ([`lib/data.ts:223`](lib/data.ts:223)).
O painel e a navegação principal dão-lhes destaque igual ao das funcionalidades
que existem.

Decisão a tomar, uma das duas:

- [ ] **Construir** o email mascarado + pipeline de compra (é trabalho grande), **ou**
- [ ] **Esconder** as duas rotas do MVP e trocar "Iniciar negociação" por
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

- [ ] Excluir as ilhas, ou dar-lhes um custo próprio e um aviso na ficha
- [ ] Modular o transporte por região/distância, nem que seja em escalões

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
      cruzar com logs — falta o sítio onde cruzar
- [ ] **`Content-Security-Policy` ainda em `Report-Only`.** A política está
      escrita no `next.config.mjs` e não bloqueia nada — só reporta. Falta
      observar produção durante um tempo e, se estiver limpa, passar ao header
      a sério (`Content-Security-Policy`)
- [ ] **Performance da montra.** `/painel` levou **8–19 s** em dev; a query de
      dedupe por identidade de carro leva **3,4 s** sozinha sobre o warehouse.
      Em produção o conjunto publicado é menor, mas a forma da query é a mesma.
      Medir com dados de produção e indexar antes de pôr utilizadores lá
- [ ] **Sem testes da app.** Os 157 testes cobrem coletores, motor de custos e
      pipeline — não há um único teste de componente ou E2E. Os bugs P0-1 e P1-1
      teriam sido apanhados por um smoke test de duas linhas
- [ ] Tabelas de ISV só de **2026** (`isv_tables`). Confirmar o plano de
      atualização anual antes da viragem do ano
- [ ] `components/demo-banner.tsx` é código morto — nada o importa
- [x] ~~Um UUID inválido em `/anuncio/<lixo>` dá erro 500 (com o boundary bonito,
      mas mesmo assim) em vez de 404~~ Feito: as páginas validam o formato antes
      de ir à base de dados (`/anuncio` → 404, `/comparar` → ignora os ids
      malformados)
- [ ] Em mobile, a etiqueta "Comparar" sobrepõe o badge "Compensa" no cartão
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

## 5. Caminho mais curto até um MVP utilizável

Ordenado por "o que desbloqueia mais com menos trabalho".

1. **Pesquisa a sério** (P0-1) — filtros no servidor + paginação + ordenação por
   percentagem. Sem isto não há produto.
2. **"Bom dia, Rui"** (P1-1) e **alinhar o KPI** (P1-2) — uma linha cada, e são
   as duas coisas que fazem a app parecer uma demo.
3. **Frescura automática** (P0-3) — recolha agendada + publicação automática +
   alarme. É o que sustenta a promessa da landing.
4. **Decidir Negociações/Compras** (P1-5) — recomendo esconder no MVP.
5. **Sentry** (P2) — antes do primeiro cliente, não depois.
6. **Pagamentos** (P0-2) — bloqueia a receita, não o uso. Um piloto com 3–5
   stands em trial pode começar antes disto; a cobrança tem de estar pronta
   **antes de o primeiro trial acabar**.

O 1, 2 e 4 são dias. O 3 e o 6 são as decisões grandes.

---

## 6. O que testei

Para dar contexto ao que está acima:

- `pnpm lint`, `pnpm typecheck`, `pnpm test` (157 testes), `pnpm build` — todos verdes
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

---

*Documento vivo. Atualizar à medida que os itens forem fechando.*
