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

1. **Histórico sem fim** ← o mais provável. `listing_price_history` e
   `pt_price_observations` crescem para sempre: **uma linha por anúncio por dia** enche os
   500 MB muito antes de o número de anúncios ser um problema.
2. **Pausa por inatividade** — o Free pausa o projeto ao fim de 1 semana sem atividade.
   A engine diária evita isto, mas convém saber.
3. **Egress (5 GB/mês)** — menos crítico do que parece. É o que as *queries devolvem*
   (não o tráfego do site, que é da Vercel). As queries do painel agregam no SQL
   (`count`/`sum`), têm `limit` e selecionam colunas → uns KB por render. 5 GB ÷ ~20 KB
   ≈ **250 000 renders/mês**; com 10 stands andamos nos ~30 000. **O risco real é a
   engine**: se um dia reler a tabela toda a cada run (ex.: 100k linhas × 2 KB = 200 MB ×
   30 dias = 6 GB), passa a ser o egress a rebentar, não o disco. Ler por lotes/incremental.

### Decisões 🔒

- ✏️ **Política de retenção** — proposta em aberto, a decidir **antes** de a engine
  debitar a sério: **[`08-RETENCAO-DE-DADOS.md`](08-RETENCAO-DE-DADOS.md)**. Em resumo:
  - `listing_price_history` → ✅ **já resolvido**: o `db-sink.ts` só grava mudanças de
    preço, e o `onDelete: cascade` limpa o histórico com o anúncio;
  - `pt_price_observations` → ⚠️ **1 linha por anúncio PT por dia, sem limpeza**. É este
    o problema. Atenção: gravar "só mudanças" **parte** o `estimatePtPrice` (janela de
    60 dias sobre `observed_at`) — ver a análise no 08 antes de mexer;
  - anúncios inativos há **> 90 dias** → ⚠️ **não é tão simples como parecia**: cinco
    tabelas cascateiam de `listings`, incluindo a **`favorites`** — apagar o anúncio faz
    o favorito de um stand desaparecer sem aviso. Decidir primeiro o que mostrar ao
    cliente (ver 08, opção A2 e decisão 3). O `deleted_at` não liberta espaço.
- 🔒 **Vigiar o tamanho**: `select pg_size_pretty(pg_database_size(current_database()))`.
  Acima de **400 MB (80%)** → decidir entre limpar ou passar a Pro. Não deixar chegar aos
  500 MB: a base passa a **recusar escritas** e a engine começa a falhar inserts.
- ✏️ **Quando passar a Pro:** ao ter os primeiros stands a pagar. Aos 100 €/mês por stand,
  os $25 pagam-se com um quarto de cliente — e trazem **backups diários**, que hoje **não
  existem** (ver secção seguinte).

### Alternativas consideradas (e porque ficamos no Supabase)

| Opção | Free | Veredito |
|---|---|---|
| **Supabase Pro** | $25/mês → 8 GB + backups | ✅ **o caminho quando houver clientes** |
| Neon | ~0,5 GB | Postgres serverless; **mesmo teto**, não resolve nada |
| Turso / Cloudflare D1 | ~5 GB | mais espaço, mas é **SQLite** — reescrever schema e reconfigurar Better Auth/Drizzle |
| Self-host (Hetzner + Coolify) | ~5 €/mês → 40+ GB | mais barato e maior, mas **passamos a gerir backups, updates, segurança e uptime** |
| Railway / Render | sem free útil | equivalente a pagar, sem vantagem |

**Decisão:** ficar no Supabase. Migrar custa dias de trabalho para poupar $25/mês — que
um único stand paga 4×. O self-host só faz sentido se um dia o custo de BD passar a ser
material (dezenas de GB), e mesmo aí troca dinheiro por tempo de manutenção, que é o
recurso mais escasso numa equipa de dois.

### Engenharia antes de dinheiro

- **Retenção** (acima) — resolve o disco, que é o limite real.
- **Engine incremental** — processar por lotes / só o que mudou desde a última run;
  nunca reler a tabela toda a cada execução.
- **Cache das agregações do painel** (`unstable_cache`, revalidate ~60 s) — corta egress e
  torna a app mais rápida. ⚠️ **A chave de cache tem de incluir o `standId`**: sem isso um
  stand vê os números de outro — deixa de ser performance e passa a ser fuga de dados.

## Dados & conformidade
- ✏️ **Dados pessoais (PII) guardados:** nome e email do utilizador; dados do stand (nome comercial, **NIF**, morada, telefone). **Sem dados de cartão** — pagamento tratado pelo Polar. Anúncios de viaturas não são dados pessoais.
- 🔒 Encriptar em trânsito e em repouso. Segredos fora da BD.
- ⚠️ **Backups:** o plano **Free não tem backups**. Assumimos essa perda enquanto não há
  clientes reais; **no dia em que houver, é razão suficiente para passar a Pro** (backups
  diários, 7 dias de retenção). Alternativa interina: `pg_dump` manual antes de operações
  de risco.
- ✏️ **Retenção / apagar conta (RGPD):** apagar conta → soft delete imediato + **purga da PII ao fim de 30 dias**; exportação dos dados do stand a pedido. Dados de mercado (anúncios/preços) são anónimos e mantêm-se.
