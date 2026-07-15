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

## ⚠️ Limites do plano e capacidade

**Estamos no plano Free do Supabase.** A base de dados **não é infinita** — e o disco
nem sequer é o primeiro limite a bater.

| | Free (atual) | Pro ($25/mês) |
|---|---|---|
| **Disco** | **500 MB** | 8 GB · depois $0,125/GB |
| **Egress** (dados servidos) | **5 GB/mês** | 250 GB · depois $0,09/GB |
| RAM / CPU | 500 MB · partilhado | dedicado |
| Utilizadores ativos (MAU) | 50 000 | 100 000 |
| Backups | ❌ nenhum | diários, 7 dias |
| Inatividade | **pausa ao fim de 1 semana** | não pausa |

### Quanto cabe, a sério (medido, não estimado)

Em jul/2026: **37 MB de 500 MB (7,4%)**, ainda com `listings` vazia.
Custo real medido: **~2 122 bytes por linha** (`us_versions`, 12 190 linhas → 22 MB).

A esse ritmo, 500 MB dão para **~200 000 anúncios** — descontando índices e histórico,
conta com **~150 000**. Para efeito de comparação: **5 mil milhões de linhas seriam ~10 TB**,
20 000× o plano Free e 1 000× o Pro. Não é por aí.

**A boa notícia:** 150 mil anúncios chegam e sobram. Os 5 mercados (DE/FR/BE/NL/ES) têm
milhões de anúncios ativos, mas não precisamos de os guardar todos — só os relevantes para
os stands, e os anúncios morrem (vendem-se) ao fim de semanas.

### O que nos vai matar primeiro

1. **Egress (5 GB/mês)** — cada página servida conta. É o limite mais provável de bater
   antes do disco, sobretudo com o painel a renderizar no servidor a cada pedido.
2. **Histórico sem fim** — `listing_price_history` e `pt_price_observations` crescem para
   sempre. **Uma linha por anúncio por dia** enche 500 MB muito antes dos anúncios.
3. **Pausa por inatividade** — o Free pausa o projeto ao fim de 1 semana sem atividade.
   Com a engine a correr todos os dias isto não acontece, mas convém saber.

### Decisões 🔒

- ✏️ **Política de retenção** (a implementar **antes** de a engine debitar a sério):
  - anúncios inativos há **> 90 dias** → apagar (o `deleted_at` não liberta espaço);
  - `listing_price_history` → guardar só **mudanças de preço**, não uma linha por dia;
  - `pt_price_observations` → agregar por semana/mês em vez de guardar cada observação.
- 🔒 **Vigiar o tamanho**: `select pg_size_pretty(pg_database_size(current_database()))`.
  Acima de **400 MB (80%)** → decidir entre limpar ou passar a Pro. Não deixar chegar aos
  500 MB: a base passa a **recusar escritas** e a engine começa a falhar inserts.
- ✏️ **Quando passar a Pro:** ao ter os primeiros stands a pagar. Aos 100 €/mês por stand,
  os $25 pagam-se com um quarto de cliente — e trazem **backups diários**, que hoje **não
  existem** (ver secção seguinte).

## Dados & conformidade
- ✏️ **Dados pessoais (PII) guardados:** nome e email do utilizador; dados do stand (nome comercial, **NIF**, morada, telefone). **Sem dados de cartão** — pagamento tratado pelo Polar. Anúncios de viaturas não são dados pessoais.
- 🔒 Encriptar em trânsito e em repouso. Segredos fora da BD.
- ⚠️ **Backups:** o plano **Free não tem backups**. Assumimos essa perda enquanto não há
  clientes reais; **no dia em que houver, é razão suficiente para passar a Pro** (backups
  diários, 7 dias de retenção). Alternativa interina: `pg_dump` manual antes de operações
  de risco.
- ✏️ **Retenção / apagar conta (RGPD):** apagar conta → soft delete imediato + **purga da PII ao fim de 30 dias**; exportação dos dados do stand a pedido. Dados de mercado (anúncios/preços) são anónimos e mantêm-se.
