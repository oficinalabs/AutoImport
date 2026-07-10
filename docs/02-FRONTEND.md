# 🖥️ Frontend

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Base
- 🔒 **Framework:** Next.js (App Router), **RSC-first** — client components só quando preciso.
- 🔒 **Estilo:** Tailwind CSS.
- 🔒 **UI:** shadcn/ui (ver [Design](01-DESIGN.md)).

## Estado
- 🔒 **Estado do servidor:** TanStack Query (cache de dados remotos).
- ☑️ **Estado do cliente:**
  - [x] Zustand (default) _— filtros de pesquisa, seleção de veículos a comparar, estado do comparador_
  - [ ] Jotai (atómico, granular)
  - [ ] Nenhum (só estado local)

## Formulários & dados
- 🔒 **Formulários:** React Hook Form + Zod.
- 🔒 **Validação:** Zod — **schema partilhado** com o backend.
- ☑️ **Chamada à API:**
  - [x] Server Actions (default) _— pesquisa, guardar alertas, gestão de conta/stand_
  - [ ] Route Handlers (REST) _— só para webhooks (Polar) e callback de ingestão; ver [Backend](03-BACKEND.md)_
  - [ ] tRPC (RPC tipado, apps grandes)

## Conteúdo
- ☑️ **i18n:** [x] Não · [ ] Sim (next-intl) — idiomas: ✏️ PT
  - _Desvio ao default (que sugere Sim): o produto é **só PT no MVP**. Os stands e o mercado-alvo são portugueses e o go-to-market é presencial em Portugal. Reavaliar (next-intl) só quando/se houver EN._
- ☑️ **Tabelas:** [x] TanStack Table _— núcleo da app: listas de anúncios, comparação PT vs. estrangeiro, colunas de custo (preço, ISV, IUC, transporte, total, poupança), ordenação e filtros_
- ☑️ **Gráficos:** [ ] Nenhum · [x] Recharts · [ ] Tremor · [ ] Nivo / visx
  - _Histórico de preços PT por modelo (linha), distribuição de poupança, sparklines por anúncio._
- 🔒 **SEO:** Metadata API, `sitemap.ts`, `robots.ts`, imagens OG. _(Relevante sobretudo na landing pública; a app fica atrás de login e `noindex`.)_

## Estrutura de pastas (sugestão fixa)
```
app/            rotas (App Router)
components/     UI reutilizável
  ui/           shadcn
lib/            helpers, clients, utils
server/         lógica de servidor / actions
db/             schema + queries (ver Base de Dados)
styles/         tokens + globals
```
- ✏️ **Desvios a esta estrutura:**
  - `engine/` — **engine de dados em Python** (ingestão/scraping das fontes europeias, normalização de anúncios, cálculo de ISV/custo final). Corre em GitHub Actions, não no Next.js. Pode viver em subpasta ou repo separado.
  - `emails/` — templates React Email (Resend).
  - `app/(marketing)/` vs `app/(app)/` — separar a **landing pública** da **app autenticada** (temas/layouts e indexação diferentes).
