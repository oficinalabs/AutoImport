# 🗄️ Base de Dados

> 🔒 fixo · ✏️ preencher · ☑️ escolher

## Motor & fornecedor
- 🔒 **Motor:** PostgreSQL.
- ☑️ **Fornecedor:**
  - [x] Supabase (default — gerido, + auth/storage) _— região **UE** (Frankfurt). Usamos só a BD (auth é Better Auth); storage fica disponível se precisarmos._
  - [ ] Neon (serverless, scale-to-zero)
  - [ ] Self-host (Coolify / Hetzner)
  - [ ] SQLite / Turso (edge, app pequena)
- ☑️ **ORM:**
  - [x] Drizzle (default — SQL-first, leve) _— schema partilhado; a engine Python escreve via SQL/Postgres direto no mesmo schema_
  - [ ] Prisma 7 (abstração + tooling)

## Convenções de schema (fixas)
- 🔒 Tabelas em `snake_case`, no plural (`users`, `orders`).
- 🔒 Chave primária: `id` (uuid ou cuid2).
- 🔒 Timestamps `created_at` e `updated_at` em todas as tabelas.
- ☑️ **Soft delete (`deleted_at`):** [ ] Não · [x] Sim
  - _Guardamos histórico: anúncios que saem de mercado, oportunidades passadas e contas apagadas não são hard-deleted (exceto PII no fim da retenção — ver RGPD)._
- ✏️ **Entidades principais:**
  - **Tenancy & conta:** `users`, `stands` (tenant), `memberships` (user↔stand + papel), `subscriptions` (estado Polar), `invites`.
  - **Catálogo:** `vehicle_models` (marca/modelo/versão canónicos + cilindrada/CO₂/combustível), `sources` (as fontes por país — seed a partir de [research/sites](../research/sites-stands-por-pais-2026.md)).
  - **Dados de mercado:** `listings` (anúncio estrangeiro: fonte, país, preço, km, ano, matrícula/URL, `seen_at`, `deleted_at`), `pt_price_observations` (histórico de preço PT por modelo), `import_cost_estimates` (ISV + IUC + transporte + total + poupança, por listing/modelo), `isv_tables` (tabelas cilindrada + CO₂ + redução por antiguidade, **versionadas por ano**).
  - **Produto:** `saved_searches` / `alerts` (critérios de vigilância de um stand), `opportunities` (listings marcados como compensatórios, com poupança calculada), `alert_events` (o que já foi notificado, para não repetir).
- ✏️ **Seed de desenvolvimento:** 208 `sources` (dos relatórios), `isv_tables` de 2026, uma amostra de `vehicle_models` e `listings` fictícios para desenvolver a UI sem depender da engine.
- 🔒 Índices nas colunas de filtro/junção mais usadas. _→ `listings(model_id, country, price)`, `listings(seen_at)`, `opportunities(stand_id, savings)`, `pt_price_observations(model_id, observed_at)`._

## Migrations & ambientes
- 🔒 Migrations **versionadas no repo**. Nunca alterar produção à mão.
- 🔒 Bases separadas por ambiente: dev · (staging) · prod.
- 🔒 Índices nas colunas de filtro/junção mais usadas.

## Dados & conformidade
- ✏️ **Dados pessoais (PII) guardados:** nome e email do utilizador; dados do stand (nome comercial, **NIF**, morada, telefone). **Sem dados de cartão** — pagamento tratado pelo Polar. Anúncios de viaturas não são dados pessoais.
- 🔒 Encriptar em trânsito e em repouso. Segredos fora da BD.
- ✏️ **Backups:** backups automáticos diários do Supabase + PITR; retenção 7–30 dias.
- ✏️ **Retenção / apagar conta (RGPD):** apagar conta → soft delete imediato + **purga da PII ao fim de 30 dias**; exportação dos dados do stand a pedido. Dados de mercado (anúncios/preços) são anónimos e mantêm-se.
