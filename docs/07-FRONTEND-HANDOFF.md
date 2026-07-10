# 🤝 Handoff Frontend → Backend

O frontend está implementado e a correr sobre **dados mock**. Este documento diz
ao backend **exatamente onde ligar os dados reais** para tornar a plataforma
dinâmica, sem mexer na UI.

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

1. **Autenticação (Better Auth, [03](03-BACKEND.md)).** Não há login. Adicionar middleware de
   sessão e proteger `app/(app)`. O stand em `getStand()` está fixo — passar a vir da sessão
   (multi-tenant: stand = tenant).
2. **Favoritos** — `CarCard` faz *optimistic update* local e chama `toggleFavorite` (no-op).
   Persistir por utilizador/stand.
3. **Negociações / email mascarado** — `sendMessage` só faz append local. Tem de enviar por
   **email proxy da plataforma** (o email real do fornecedor e do stand fica privado, só se
   comunica pela plataforma — requisito de produto, ver [06](06-SERVICOS-EXTERNOS.md)).
4. **Alertas** — o toggle ativo/inativo e o "Novo alerta" são visuais; falta persistir e o job
   que dispara emails quando há match (Inngest ou engine).
5. **Subscrição** — "Gerir subscrição" deve ligar ao Polar (checkout/portal).

## Imagens dos carros

Não há fotos reais: [`components/car-image.tsx`](../components/car-image.tsx) é um placeholder.
Quando `Listing.images` trouxer URLs reais:
1. trocar o placeholder por `<Image>` do Next;
2. adicionar os hosts em [`next.config.mjs`](../next.config.mjs) → `images.remotePatterns`.

## Convenções úteis

- **Idioma:** só PT (sem i18n) — ver [02](02-FRONTEND.md).
- **Design tokens:** nunca hex soltos; usar as classes do tema (`bg-surface`, `text-ink`,
  `text-good`, `bg-amber`, …) definidas em `globals.css`. Ver [01](01-DESIGN.md).
- **Veredito** (`compensa`/`marginal`/`nao_compensa`) é cor semântica, separada do âmbar.
- **`.npmrc`** tem `verify-deps-before-run=false` para o `pnpm dev` não falhar por build
  scripts pendentes; `pnpm-workspace.yaml` aprova os builds (biome, sharp, esbuild).

## Mapa de ficheiros

```
app/                     rotas (RSC-first)
  page.tsx               Painel
  pesquisar/             Pesquisa
  anuncio/[id]/          Detalhe
  comparar/              Comparação
  negociacoes/           Mensagens (email mascarado)
  compras/               Pipeline
  favoritos/ alertas/ stand/
components/              UI (ui/ = primitivas estilo shadcn)
lib/
  types.ts               ← CONTRATO de domínio
  data.ts                ← SEAM: ligar backend aqui
  mock.ts                ← dados de exemplo (apagar quando houver backend)
  format.ts verdict.ts countries.ts deal-stages.ts
```
