# 🤝 Fronteira Frontend ⇄ Backend

Nasceu como handoff, quando a UI corria sobre mock. **O mock foi apagado** — hoje
tudo vem da base de dados, e este documento passou a descrever *onde é a
fronteira* e o que continua por ligar.

## ✅ Autenticação (Better Auth)

Registo, login, logout, verificação de email obrigatória, reset de password e
multi-tenant (cada **stand** é uma organização, papéis owner/member) — tudo a
funcionar sobre Drizzle + Postgres. O stand é criado no **servidor**, num
`databaseHook` de `lib/auth.ts`, para ser atómico com o utilizador.

Ficheiros: [`lib/auth.ts`](../lib/auth.ts) (config), [`lib/auth-client.ts`](../lib/auth-client.ts),
[`db/schema.ts`](../db/schema.ts), [`middleware.ts`](../middleware.ts)
(protege as rotas da app), [`app/api/auth/[...all]/route.ts`](../app/api/auth) (endpoint),
[`components/auth-forms.tsx`](../components/auth-forms.tsx) (formulários).

⚠️ **`pnpm auth:generate` regenera o `db/schema.ts`** a partir do Better Auth e
apaga o que lá foi acrescentado à mão (os campos `nif`/`address`/`phone` da
`organization`, por exemplo). Por isso a subscrição vive em tabela própria.

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

## A fronteira — `lib/data.ts`

Todas as funções lêem a base por [`lib/queries.ts`](../lib/queries.ts) (Drizzle).
A UI **nunca** importa o Drizzle nem o `lib/queries.ts`.

| Função | O que faz | Entidades (ver [04](04-BASE-DE-DADOS.md)) |
|---|---|---|
| `searchListings(filters)` → `SearchPage` | pesquisa; **todos os filtros são SQL** | `listings` + `import_cost_estimates` |
| `getListing(id)` | detalhe de um anúncio | idem, com histórico PT |
| `getListingsByIds(ids)` | comparação | idem |
| `getDashboardStats()` | KPIs do painel | `opportunities` |
| `getTopOpportunities(n)` | oportunidades | `opportunities` |
| `getCountryInsights()` | dinâmica por país | agregação por país |
| `getFavorites()` / `toggleFavorite(id)` | favoritos | `favorites` |
| `getAlerts()` / `createAlert()` / `toggleAlert()` | alertas | `alerts` + `alert_events` |
| `getNotifications()` | o sino | `alert_events` |
| `getStand()` / `updateStand()` | conta, stand e subscrição | `organization` + `subscriptions` |
| `getConversations()` / `getDeals()` | ⬜ **sem backend** — devolvem vazio | — |

**Custo e veredito são calculados na engine**, nunca na UI: o pipeline grava
`import_cost_estimates` e a UI recebe `Listing.cost`/`savings`/`verdict` já
preenchidos. As tabelas de ISV mudam por ano — ver [08](08-PIPELINE-DADOS.md).

⚠️ **`searchListings` devolve `SearchPage`, não `Listing[]`** — tem `items`,
`total`, `page`, `pageSize` e `hasMore`. Sem o `total`, a UI mostrava o tamanho
do array como se fosse o número de anúncios que existem.

## O que continua por ligar

1. **Negociações e Compras** — `getConversations()`/`getDeals()` devolvem vazio
   por construção, e as rotas estão **escondidas da navegação**. A decisão de
   produto foi não as construir no MVP: o âmbito é a inteligência de decisão, não
   ser um inbox. As rotas ficam a existir (um link guardado dá uma página honesta
   em vez de 404) e o middleware continua a protegê-las.
2. **Pagamentos** — a tabela `subscriptions` e o webhook
   (`app/api/polar/webhook/`) existem, e o gate fecha a app quando o período
   acaba. Falta o **checkout e o portal de faturação**, que precisam de
   `POLAR_ACCESS_TOKEN` e de produtos criados do lado da Polar; até lá o botão
   "Gerir subscrição" fica honestamente desativado.
3. **Convidar equipa** — desativado. A landing vende "toda a equipa incluída";
   hoje um stand é um utilizador.
4. **Observabilidade** — sem Sentry. Os boundaries já mostram o `digest`
   precisamente para cruzar com os logs; falta o sítio onde cruzar.

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
cobertura) é o **CTA principal** da página do anúncio. Já foi secundário, quando a
negociação pela plataforma era o caminho previsto; com essa fora do MVP, mandar o
stand ao anúncio é o que ele vai mesmo fazer.

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

⚠️ **`pnpm db:push` não funciona** contra esta Supabase (bug do drizzle-kit a introspecionar os schemas internos do Supabase). Todas as mudanças de schema são **migrations versionadas** — `pnpm db:generate`, commitar o `.sql`, e a Vercel aplica-o no build. Ver o [CLAUDE.md](../CLAUDE.md), que tem a história de como isto já partiu a produção.

## Convenções úteis

- **Idioma:** só PT (sem i18n) — ver [02](02-FRONTEND.md).
- **Design tokens:** nunca hex soltos; usar as classes do tema (`bg-surface`, `text-ink`,
  `text-good`, `bg-amber`, …) definidas em `globals.css`. Ver [01](01-DESIGN.md).
- **Veredito** (`compensa`/`marginal`/`nao_compensa`) é cor semântica, separada do âmbar.
- **`.npmrc`** tem `verify-deps-before-run=false` para o `pnpm dev` não falhar por build
  scripts pendentes; `pnpm-workspace.yaml` aprova os builds (biome, sharp, esbuild).

## Mapa de ficheiros

```
app/                     rotas (RSC-first), em 4 grupos:
  (marketing)/           landing pública em / (indexável)
  (auth)/                /entrar /registar /recuperar
  (legal)/               /ajuda /legal/* (indexáveis)
  (app)/                 a app (noindex)
    layout.tsx           barra de topo — envolve TUDO, /stand incluída
    loading.tsx          skeleton partilhado do grupo
    stand/               conta e subscrição — FORA do gate, de propósito
    (gated)/             ⚠️ grupo do gate da subscrição. Os parênteses não
      layout.tsx           entram no URL: /painel continua /painel. Rota nova
      painel/              aqui dentro fica fechada por omissão — falha
      pesquisar/           FECHADO, que é o que se quer numa porta.
      anuncio/[id]/
      comparar/ favoritos/ alertas/
      negociacoes/ compras/   (escondidas da navegação, ver acima)
  api/auth/[...all]/     Better Auth
  api/polar/webhook/     estado da subscrição
  robots.ts sitemap.ts   SEO (só a landing e as legais são indexáveis)
components/              UI (ui/ = primitivas estilo shadcn)
lib/
  types.ts               ← CONTRATO de domínio
  data.ts                ← A FRONTEIRA: a UI lê tudo por aqui
  queries.ts             ← Drizzle, só servidor. A UI nunca importa isto.
  subscription.ts polar-webhook.ts
  format.ts verdict.ts countries.ts deal-stages.ts
tests/
  helpers/db.ts          base descartável partilhada
  queries/               a camada de queries da app
  smoke/                 a app compilada, a servir (pnpm test:smoke)
.github/workflows/       ci · alertas · frescura · publicação · daily-batch
```
