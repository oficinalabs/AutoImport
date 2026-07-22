# 🤝 Handoff Frontend → Backend

O frontend está implementado e a correr sobre **dados mock**. Este documento diz
ao backend **exatamente onde ligar os dados reais** para tornar a plataforma
dinâmica, sem mexer na UI.

## ✅ Autenticação (Better Auth) — implementada, falta a base de dados

O login/registo/logout já estão ligados ao **Better Auth** (email + password) com
**Drizzle + Postgres** e multi-tenant (cada **stand** é uma organização, papéis
owner/member). Só falta uma base de dados. Passos para a ativar:

1. Criar a Postgres no **Supabase** (região UE) e copiar a connection string
   (pooler *Transaction*, porta 6543).
2. `cp .env.example .env.local` e preencher `DATABASE_URL` + `BETTER_AUTH_SECRET`
   (gerar com `openssl rand -base64 32`).
3. `pnpm db:push` — cria as tabelas de auth (`user`, `session`, `account`,
   `verification`, `organization`, `member`, `invitation`).
4. `pnpm dev` → registar um stand em `/registar` e entrar. Feito.

Ficheiros: [`lib/auth.ts`](../lib/auth.ts) (config), [`lib/auth-client.ts`](../lib/auth-client.ts),
[`db/schema.ts`](../db/schema.ts) (gerado por `pnpm auth:generate`), [`middleware.ts`](../middleware.ts)
(protege as rotas da app), [`app/api/auth/[...all]/route.ts`](../app/api/auth) (endpoint),
[`components/auth-forms.tsx`](../components/auth-forms.tsx) (formulários).

**Pendente (não bloqueia o login):** envio de emails de reset via **Resend**
(`sendResetPassword` em `lib/auth.ts` está como TODO) + a página `/recuperar/definir`
que consome o token; criação do stand no signup ainda é feita no cliente (mover para
um `databaseHook` no servidor, para ser atómica). **Verificado sem DB:** o middleware
protege `/painel`, e um POST a `/api/auth/sign-up/email` gera o SQL correto e só falha
na ligação (`ECONNREFUSED`) — a cadeia está toda ligada.

> Regra de ouro: a UI só conhece os **tipos** em [`lib/types.ts`](../lib/types.ts) e
> lê tudo através da camada [`lib/data.ts`](../lib/data.ts). **Só é preciso reescrever
> o corpo das funções de `lib/data.ts`.** Se as assinaturas e os tipos se mantiverem,
> nada na UI muda.

## Arranque

```bash
pnpm install        # aprova builds via pnpm-workspace.yaml
pnpm dev            # http://localhost:3000 (aqui usámos :3005)
pnpm typecheck      # tsc --noEmit
pnpm lint           # biome
```

Stack conforme os docs 00–06: Next.js 15 (App Router, RSC-first), TypeScript strict,
Tailwind v4 + tokens em [`app/globals.css`](../app/globals.css), TanStack Query, Biome.

## Onde ligar o backend — `lib/data.ts`

Cada função devolve hoje mock ([`lib/mock.ts`](../lib/mock.ts)). Substituir o corpo por
Server Action, Route Handler (`fetch`) ou query Drizzle. Mapeamento sugerido:

| Função | O que faz | Entidades (ver [04](04-BASE-DE-DADOS.md)) |
|---|---|---|
| `searchListings(filters)` | pesquisa/filtra anúncios | `listings` + `import_cost_estimates` + `pt_price_observations` |
| `getListing(id)` | detalhe de um anúncio | idem, com histórico e ficha |
| `getListingsByIds(ids)` | comparação | idem |
| `getDashboardStats()` | KPIs do painel | agregações |
| `getTopOpportunities(n)` | oportunidades | `opportunities` |
| `getCountryInsights()` | dinâmica por país | agregação por país |
| `getFavorites()` / `toggleFavorite(id)` | favoritos | `favorites` (persistir) |
| `getAlerts()` | alertas | `saved_searches` / `alerts` |
| `getConversations()` / `getConversation(id)` | negociações | `conversations` + `messages` |
| `sendMessage(convId, body)` | enviar mensagem | **email mascarado** (ver abaixo) |
| `getDeals()` / `getDeal(id)` | pipeline de compra | `deals` |
| `getStand()` | conta/stand/subscrição | `stands` + `subscriptions` |

**Cálculo do custo/veredito:** hoje é feito no mock a partir dos escalões em
[`lib/verdict.ts`](../lib/verdict.ts) (`verdictFromSavings`) e da soma em `CostBreakdown`.
Na produção, o **ISV e o custo final devem ser calculados na engine/backend** (as tabelas
de ISV mudam por ano) e vir já preenchidos em `Listing.cost` / `savings` / `verdict`.

## Pontos que precisam de backend a sério (hoje são stub/otimista)

1. **Autenticação (Better Auth, [03](03-BACKEND.md)).** ✅ Implementada — ver a secção no
   topo deste documento. Só falta a `DATABASE_URL`. Pendente ligado à sessão: o stand em
   `getStand()` ainda é fixo (mock) — passar a vir da organização ativa da sessão.
2. **Favoritos** — `CarCard` faz *optimistic update* local e chama `toggleFavorite` (no-op).
   Persistir por utilizador/stand.
3. **Negociações / email mascarado** — `sendMessage` só faz append local. Tem de enviar por
   **email proxy da plataforma** (o email real do fornecedor e do stand fica privado, só se
   comunica pela plataforma — requisito de produto, ver [06](06-SERVICOS-EXTERNOS.md)).
4. **Alertas** — a UI já cria alertas e liga/desliga o toggle (otimista, em
   `components/alerts-view.tsx`), chamando `createAlert`/`toggleAlert` em `lib/data.ts`
   (no-ops). Falta persistir e o job que dispara emails quando há match (Inngest ou engine).
5. **Subscrição** — "Gerir subscrição" deve ligar ao Polar (checkout/portal).
6. **Banner de demonstração** — `components/demo-banner.tsx` está fixo no layout da app;
   remover (ou condicionar a uma flag) quando os dados forem reais.

## Imagens dos carros

A capa é a **1.ª foto do próprio anúncio** (`listings.image_url`, gravada pelo coletor →
`Listing.images[0]`). [`components/car-image.tsx`](../components/car-image.tsx) tenta por
esta ordem: foto do anúncio → imagem do catálogo ultimatespecs (`catalogImage`) →
placeholder. Cobertura na produção: ~99,7% dos anúncios ativos têm foto.

**As fotos dos anúncios são `<img>` normal, sem o optimizer do Next — e não entram no
`images.remotePatterns`.** São ~24 CDNs distintos e cada coletor novo traz mais: um
allowlist obrigaria a editar o [`next.config.mjs`](../next.config.mjs) e fazer redeploy só
para a foto não rebentar, além de fazer passar 22k fotos pelo optimizer da Vercel. O
`remotePatterns` continua a ter só o ultimatespecs, que é servido com `<Image>`.

Notas apanhadas a testar os 24 hosts:
- `static.piscapisca.pt` (403) e `images.ooyyo.com` (415) **bloqueiam hotlinking** — ~2% dos
  anúncios. O `onError` do `CarImage` cai no catálogo/placeholder, por isso não se vê;
- o AutoScout24 (e o autotrader.nl, mesmo CDN) devolve miniaturas `250x188`; `listingPhoto`
  em [`lib/queries.ts`](../lib/queries.ts) sobe-as para `640x480` trocando o sufixo do URL;
- `referrerPolicy="no-referrer"` nas fotos: não vazamos os nossos URLs para os CDNs das fontes.

O link para o anúncio de origem (`Listing.sourceUrl` ← `listings.detail_url`, 100% de
cobertura) está na página do anúncio, como ação **secundária** — a negociação pela
plataforma é que mantém o email do vendedor privado (ver [06](06-SERVICOS-EXTERNOS.md)).

## Tratamento de erros

| Ficheiro | Apanha |
|---|---|
| `app/(app)/error.tsx` | erros na app autenticada (mantém a top bar; dá "tentar de novo") |
| `app/error.tsx` | erros na landing/auth e rede de segurança geral |
| `app/global-error.tsx` | erros no **root layout** — os outros não os apanham; é o buraco que dava o ecrã cru do Next |
| `app/not-found.tsx` | 404 |

Todos usam `components/error-state.tsx`. **Nunca** expor `error.message`/stack — só o
`digest`, que o utilizador pode dar ao suporte para cruzar com os logs da Vercel.
Verificado em `next start`: o HTML entregue ao cliente não continha SQL, nomes de tabelas,
`postgresql://`, stack nem código de erro Postgres — só `E{"digest":"…"}`.

## Notas de segurança (já implementado)

- **Headers** em `next.config.mjs`: X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy, COOP, HSTS; `poweredByHeader: false`.
- **Rate limiting** e **regras de password** — ver [03](03-BACKEND.md). As regras vivem em `lib/password.ts` e são impostas nos dois lados.
- **Verificação de email obrigatória**: o registo não cria sessão; o stand (organização) é criado no **servidor** (`databaseHook` em `lib/auth.ts`), não no cliente.
- **Segredos**: nunca em `NEXT_PUBLIC_*`; `.env.local` está no gitignore. Só o `.env.example` é commitado.

⚠️ **Dívida conhecida:** `pnpm db:push` rebenta contra esta Supabase (bug do drizzle-kit 0.31 a introspecionar CHECK constraints dos schemas internos do Supabase). A coluna `user.stand_name` foi aplicada por `ALTER TABLE` direto. Para mudanças de schema futuras, preferir migrations versionadas (`pnpm db:generate` + `db:migrate`), como manda o [04](04-BASE-DE-DADOS.md).

## Convenções úteis

- **Idioma:** só PT (sem i18n) — ver [02](02-FRONTEND.md).
- **Design tokens:** nunca hex soltos; usar as classes do tema (`bg-surface`, `text-ink`,
  `text-good`, `bg-amber`, …) definidas em `globals.css`. Ver [01](01-DESIGN.md).
- **Veredito** (`compensa`/`marginal`/`nao_compensa`) é cor semântica, separada do âmbar.
- **`.npmrc`** tem `verify-deps-before-run=false` para o `pnpm dev` não falhar por build
  scripts pendentes; `pnpm-workspace.yaml` aprova os builds (biome, sharp, esbuild).

## Mapa de ficheiros

```
app/                     rotas (RSC-first), em 3 grupos:
  (marketing)/           landing pública em / (indexável)
  (auth)/                /entrar /registar /recuperar (UI pronta p/ Better Auth)
  (app)/                 a app (noindex até haver auth)
    painel/              Painel (nota: mudou de / para /painel)
    pesquisar/           Pesquisa (+ "Mais filtros" client-side)
    anuncio/[id]/        Detalhe
    comparar/            Comparação
    negociacoes/         Mensagens (email mascarado)
    compras/             Pipeline
    favoritos/ alertas/ stand/
    loading.tsx          skeleton partilhado do grupo
  robots.ts sitemap.ts   SEO (só a landing é indexável)
components/              UI (ui/ = primitivas estilo shadcn)
lib/
  types.ts               ← CONTRATO de domínio
  data.ts                ← SEAM: ligar backend aqui
  mock.ts                ← dados de exemplo (apagar quando houver backend)
  format.ts verdict.ts countries.ts deal-stages.ts
.github/workflows/ci.yml lint → typecheck → build em cada PR (docs/05)
```
