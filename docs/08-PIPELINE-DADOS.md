# 🔁 Pipeline de dados

Do anúncio estrangeiro ao veredito: scrape → Postgres → matching → mercado PT
→ custos de importação (ISV/IUC) → poupança/veredito → oportunidades → UI.

## Arranque local (sem Supabase)

```bash
pnpm db:up          # Postgres 17 em docker (porta 54329)
pnpm db:migrate     # migrations versionadas (db/migrations)
pnpm db:seed        # fontes + tabelas fiscais 2026 (idempotente)
# recolher qualquer coisa (ver tools/collector/README.md), depois:
pnpm pipeline:daily # ingest → match → mercado PT → custos → oportunidades
pnpm dev            # a UI passa a mostrar dados reais (sem DATABASE_URL → mock)
```

## Os 6 passos do `pipeline:daily` (scripts/pipeline/run-daily.ts)

| # | Passo | O que faz |
|---|---|---|
| 1 | `ingest.ts` | replay dos NDJSON de `tools/collector/out` → upsert em `listings` (chave `source_site`+`external_id`) + `listing_price_history`. Idempotente. O modo watch dos coletores escreve direto na BD via `tools/collector/lib/db-sink.ts` quando há `DATABASE_URL`. Preço: fontes com contado estruturado (flexicar `cash_price`) usam-no em vez do financiado de montra; leilões (`/leilao/`) nunca geram estimativa. |
| 1b | `enrich-es.ts` | stands ES anunciam o FINANCIADO; para anúncios AS24-ES com estimativa, busca a página de detalhe e extrai o "precio al contado" da descrição (`lib/engine/precio-contado.ts`), corrigindo o preço (1 visita por anúncio, rate 1,5 s). |
| 2 | `match-models.ts` | normalização determinística (`lib/engine/normalize-vehicle.ts`): `norm_key = make\|model\|fuel` → `vehicle_models`; a variante desambigua HEV vs PHEV ("Plug-in" muitas vezes só aparece aí); loga taxa de match + top não-mapeados (alimentar o dicionário). GPL/GN ficam de fora por decisão. |
| 3 | `pt-market.ts` | 1 observação de preço/dia por anúncio PT ativo → `pt_price_observations`. |
| 4 | desaparecidos | soft-delete de anúncios sem sinal há 14+ dias (`--stale-days`). |
| 5 | `compute-costs.ts` | cost engine (`lib/cost-engine/`) + mediana PT (`lib/engine/pt-market.ts`: year±1/band±1, mín. 5 com ≥3 preços e ≥2 vendedores distintos; fallback ±2, mín. 3, confiança `alargada`; amostra **deduplicada por carro físico** — VIN, senão preço+ano+km) → `import_cost_estimates` com veredito (`lib/verdict.ts`). **Matching estrito por designação**: a potência é obrigatória dos dois lados e a amostra só aceita ±10%/±15cv (840i≠M850i, xDrive40≠45, Golf≠GTI). Sem CO₂/cilindrada/potência ou sem amostra → **sem estimativa** (nunca adivinhar). |
| 6 | `flag-opportunities.ts` | veredito `compensa` + confiança `normal` → `opportunities`. |

## Tabelas fiscais (ISV/IUC)

- Valores 2026 em `db/seed/isv-2026.ts` (cross-verificados com o folheto oficial
  da AT e a Lei 45-A/2024; fontes por bloco). Formas em `lib/cost-engine/types.ts`.
- Versionadas por ano em `isv_tables` — o OE 2027 será um novo conjunto `year=2027`.
- Assunções do motor (registadas por cálculo em `import_cost_estimates.inputs`):
  norma CO₂ por ano de matrícula (≥2019 WLTP, ≤2018 NEDC), agravamento diesel
  aplicado por omissão, autonomia elétrica de PHEV assumida quando falta,
  transporte por país e legalização fixos (`lib/cost-engine/transport.ts` /
  `legalization.ts`).
- Testes com casos de referência de simuladores: `tests/cost-engine/`.

## GitHub Actions

- **`daily-batch.yml`** — cron 03:00 UTC: matrix de scrapers com caps
  (`continue-on-error` por fonte) → artefactos NDJSON → job `ingest` corre o
  `run-daily` **se** o secret `DATABASE_URL` existir; sem secret publica só os
  artefactos. `workflow_dispatch` aceita uma fonte única para debug.
- **`ci.yml`** — lint → typecheck → migrations+seed+testes (serviço postgres,
  inclui o teste de integração `tests/pipeline/integration.test.ts`) → build.
- Manuais (fora do CI): `piscapisca` (Python/Camoufox — correr local, o NDJSON
  entra pelo ingest), crawls `--full` profundos, modo `watch` contínuo.

## Switch para a Supabase (quando o `.env` chegar)

1. `DATABASE_URL` no `.env.local` (pooler *Transaction*, porta 6543) e o secret
   homónimo no GitHub.
2. A Supabase já tem as tabelas de **auth** aplicadas à mão → marcar a migration
   `0000` (baseline auth) como aplicada antes de migrar:
   `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) SELECT hash, created_at FROM ...`
   — ou, mais simples, correr `pnpm db:migrate` numa BD vazia de staging;
   em produção aplicar só a `0001` (domínio). **Nunca `db:push`** (docs/07).
3. `pnpm db:seed` e está feito — nada mais muda (o `prepare:false` do postgres.js
   já é compatível com o pooler).

## Saúde do matching (loop de qualidade)

O `run-daily` termina com o painel: taxa de match, % com estimativa, distribuição
de vereditos, amostra PT média e o top-20 de não-mapeados — usar esse relatório
para alargar o dicionário `MODEL_RULES`/`MAKE_ALIASES` em
`lib/engine/normalize-vehicle.ts`. Casos difíceis ficam para a normalização LLM
(fase 2, docs/03).
