# CLAUDE.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

---

# ⚠️ Este projeto (AutoImport) — regras críticas

Ler antes de mexer na base de dados ou no deploy. Isto não é teoria: **já partiu a produção**.

## Base de dados e deploy

**O deploy publica código. A base de dados não muda sozinha.**
Foi assim que a produção rebentou: o painel passou a ler `listings`, o merge publicou o
código, mas as tabelas nunca foram criadas na Supabase → `relation "listings" does not exist`.

- **Mudar o schema:** editar `db/schema.ts` → `pnpm db:generate` → **commitar a migration**.
- **Aplicar em produção:** *não corras nada à mão*. O `vercel.json` corre
  `pnpm db:migrate:deploy` antes do build, e o script só aplica quando `VERCEL_ENV=production`.
- **`pnpm db:push` NÃO funciona** com esta Supabase (bug do drizzle-kit ao introspecionar os
  schemas internos do Supabase). Usar **sempre** migrations.
- **Previews de PR não migram** — Preview e Production partilham a `DATABASE_URL`, e um PR
  por rever não pode alterar a produção. Se um PR trouxer migration + código que dependa
  dela, **o preview vai dar erro: é esperado, não é bug**.
- **CI verde ≠ produção OK.** O CI migra uma Postgres descartável; nunca prova o estado da
  Supabase real.
- Migration a falhar **falha o build de propósito** — a Vercel mantém a versão anterior no ar.

## Erros nunca expõem detalhes ao cliente

Um erro na produção mostrava *"Application error: a server-side exception has occurred…"* —
o ecrã cru do Next. Agora há boundaries próprios (`app/error.tsx`, `app/(app)/error.tsx`,
`app/global-error.tsx`, `app/not-found.tsx`), todos sobre `components/error-state.tsx`.

**Regra: nunca mostrar `error.message` nem stack traces na UI.** Podem trazer SQL, nomes de
tabelas ou caminhos internos. Só o **`digest`** — opaco, e serve para cruzar com os logs.
O detalhe fica nos logs do servidor (Vercel), que só a equipa vê.

Ao criar rotas novas: se a página puder falhar (lê a BD, chama uma API), confirma que está
coberta por um `error.tsx`. Testar um erro real em `next start` (não `dev` — em
desenvolvimento o Next mostra o overlay com tudo, e isso engana).

## A base de dados tem 500 MB — não é infinita

Plano **Free**: **500 MB de disco** e **5 GB/mês de egress**, sem backups. Medido: ~2 KB por
linha → cabem **~150 000 anúncios**, não milhões. Aos 500 MB a base **recusa escritas**.

Ao escrever código que insere dados (engine, pipeline, seeds): **não guardar histórico
diário sem limite** (`listing_price_history` só em mudança de preço; `pt_price_observations`
agregado). Anúncios inativos há >90 dias apagam-se — `deleted_at` não liberta espaço.
Vigiar com `select pg_size_pretty(pg_database_size(current_database()))`; acima de 400 MB,
falar com o Rui. Detalhe e política em `docs/04-BASE-DE-DADOS.md`.

## ☠️ O `.env.local` aponta para a Supabase de PRODUÇÃO

Não há base de dados de desenvolvimento separada. Qualquer `pnpm db:seed`, `db:migrate` ou
script com `--env-file=.env.local` **mexe em dados reais de clientes**. Confirma para onde
aponta a `DATABASE_URL` **antes** de correres o que quer que seja contra a base de dados.
Em caso de dúvida, pergunta em vez de correr.

## Segredos

Nunca leias nem imprimas o `.env.local`, e nunca coles connection strings ou API keys no
chat. Vivem na Vercel (produção) e no `.env.local` (local); o `.env.example` documenta
quais são precisas.

## Onde está o detalhe

- `docs/05-INFRA-E-DEPLOY.md` — deploy, migrations, domínio, rollback
- `docs/07-FRONTEND-HANDOFF.md` — fronteira frontend/backend, `lib/data.ts`, segurança
- `docs/03-BACKEND.md` — auth, regras de password, rate limiting

---

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
