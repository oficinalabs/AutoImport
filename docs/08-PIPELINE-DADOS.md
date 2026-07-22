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

## Os 9 passos do `pipeline:daily` (scripts/pipeline/run-daily.ts)

| # | Passo | O que faz |
|---|---|---|
| 1 | `ingest.ts` | replay dos NDJSON de `tools/collector/out` → upsert em `listings` (chave `source_site`+`external_id`) + `listing_price_history`. Idempotente. O modo watch dos coletores escreve direto na BD via `tools/collector/lib/db-sink.ts` quando há `DATABASE_URL`. Preço: fontes com contado estruturado (flexicar `cash_price`) usam-no em vez do financiado de montra; leilões (`/leilao/`) nunca geram estimativa. O upsert **preserva** o contado já verificado (passo 7) enquanto o preço de montra não mudar — se mudar, larga as marcas e o anúncio volta à fila. |
| 2 | `match-models.ts` | **(A) modelo:** normalização determinística (`lib/engine/normalize-vehicle.ts`): `norm_key = make\|model\|fuel` → `vehicle_models`; a variante desambigua HEV vs PHEV ("Plug-in" muitas vezes só aparece aí); loga taxa de match + top não-mapeados (alimentar o dicionário). GPL/GN ficam de fora por decisão. **(B) versão:** resolve cada anúncio ativo → versão do catálogo `us_versions` (`us_version_id`/`match_confidence`/`match_evidence`); loga a distribuição por tier e fonte + top-20 de anúncios com potência mas sem confirmado. Ver "Resolução de versão" abaixo. |
| 3 | `pt-market.ts` | 1 observação de preço/dia por anúncio PT ativo → `pt_price_observations`. |
| 4 | desaparecidos | soft-delete de anúncios sem sinal há 14+ dias (`--stale-days`). |
| 5 | `check-gone.ts` | HEAD às oportunidades ativas: 404/410 → soft-delete, antes de recalcular veredito sobre um carro que já não existe. |
| 6 | `compute-costs.ts` (1.ª) | cost engine (`lib/cost-engine/`) + mediana PT (`lib/engine/pt-market.ts`: year±1/band±1, mín. 5 com ≥3 preços e ≥2 vendedores distintos; fallback ±2, mín. 3, confiança `alargada`; amostra **deduplicada por carro físico** — VIN, senão preço+ano+km) → `import_cost_estimates` com veredito (`lib/verdict.ts`). **Matching estrito por designação**: a potência é obrigatória dos dois lados e a amostra só aceita ±10%/±15cv (840i≠M850i, xDrive40≠45, Golf≠GTI). Sem CO₂/cilindrada/potência ou sem amostra → **sem estimativa** (nunca adivinhar). Ver "Resolução de versão" e "Specs efetivas" abaixo. |
| 7 | `enrich-es.ts` | stands ES anunciam o FINANCIADO. Para os AS24-ES que a 1.ª passagem deu como `compensa`/`marginal`, busca a página de detalhe e extrai o "precio al contado" da descrição (`lib/engine/precio-contado.ts`), corrigindo o preço (1 visita por anúncio, rate 1,5 s). Só visita quem já parece negócio: o contado é ≥ ao anunciado, logo nunca cria uma oportunidade — só a pode desfazer. |
| 8 | `compute-costs.ts` (2.ª) | recalcula os anúncios corrigidos no passo 7 (o `pending` filtra por `updated_at > computed_at`). |
| 9 | `flag-opportunities.ts` | veredito `compensa` + confiança `normal` → `opportunities`. Corre no fim: nada é publicado como oportunidade ao preço financiado. |

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

## Resolução de versão (match-models, passo B)

O passo (A) liga o anúncio a um **modelo canónico** (`vehicle_models`); o passo (B)
resolve-o a uma **versão do catálogo ultimatespecs** (`us_versions`) para dar specs
fiáveis (cc/CO₂/potência) e uma janela de geração. O resolver
(`lib/engine/match-version.ts`) é **puro e determinístico** — mesmo input + mesmo
catálogo (`lib/engine/us-catalog.ts`) ⇒ mesmo output — e escreve três colunas em
`listings`: `us_version_id`, `match_confidence` e `match_evidence` (jsonb com os
sinais batidos, para auditoria). É idempotente: a 2.ª corrida escreve 0.

**Filosofia: nunca adivinhar.** Um match exige **sinais duros** do anúncio
(potência, cilindrada/litragem, badge alfanumérico tipo `320d`/`xDrive45`) que
batem no catálogo dentro de tolerâncias apertadas (potência ±max(7, 4%) cv;
cilindrada ±30 cm³ ou litragem a 1 casa). O combustível é obrigatório e exato
(elétrico nunca casa térmico; HEV≠PHEV; GPL/GN → fora). Os tiers e o que alimentam:

- **`confirmado`** — ≥2 sinais duros, candidatos concordantes entre si (cc/potência/
  CO₂ da norma do ano) **e ano presente**. É a única afirmação forte o suficiente
  para (1) **restringir a amostra de mercado PT** à janela de geração da versão e
  (2) **preencher specs em falta** a partir do catálogo (ver abaixo).
- **`provavel`** — 1 sinal duro + candidato único (ou um confirmado a que falta só
  o ano). Fica registado para observabilidade mas **não** alimenta specs efetivas
  nem restringe a amostra.
- **`null` (sem match)** — 0 sinais duros, ou nenhuma versão bate um sinal presente.
  Sem prova ⇒ sem versão (mesmo com um só candidato).

A família do anúncio e a do catálogo vivem no **mesmo espaço** (`normModel` canoniza
ambos), por isso a convergência é automática para as marcas com regras. Uma guarda
anti-fallback impede colisões quando a família vem do fallback primeiro-token
("Grand i10" ≠ "Grand Santa Fe").

## Specs efetivas (compute-costs, proveniência)

Por omissão, cc/CO₂/potência vêm **só do próprio anúncio** — nada de medianas do
modelo (uma mediana entre-trims produz ISV confiantemente errado; o ISV é €5,61/cm³).
**Exceção (Fase 4): `match_confidence='confirmado'`** — aí a versão canónica do
catálogo **preenche os campos em falta** (nunca substitui um valor que o anúncio já
traz): cc, potência, e CO₂ **na norma do ano de matrícula** (≥2019 WLTP, ≤2018 NEDC;
sem cross-norma — se a versão não tem o CO₂ dessa norma, fica `semDados`). A potência
efetiva vai à amostra PT e a **janela de geração** da versão confina a mediana (evita
contaminar com a geração vizinha de anos adjacentes). A proveniência fica registada
em `import_cost_estimates.inputs` (`versionId`, `fromCatalog[]`, `genWindow`) — cada
estimativa é auditável até à versão que a alimentou.

## Guarda de geração (pt-market)

`estimatePtPrice` (`lib/engine/pt-market.ts`) aceita uma `GenWindow` opcional
(derivada da versão confirmada). Quando presente, a amostra PT fica confinada à
**interseção** de `year±spread` com `[start, end]` da geração — impede que a mediana
de um anúncio da geração nova seja contaminada por carros PT da geração velha de anos
vizinhos (fronteira de geração). O guard **nunca relaxa, só aperta**: o fallback
alargado (spread=2) continua confinado à geração; interseção vazia → sem amostra.

## Harness de avaliação (`scripts/eval`)

Mede a saúde do matching num **snapshot JSON determinístico** (`metrics.ts` →
`baselines/*.json`) e usa os baselines committed como **contrato**: um baseline só
muda com justificação no commit, e o diff entre baselines tem de explicar-se pela
mudança que o gerou (nada de ruído). Ver `scripts/eval/README.md` para o significado
de cada métrica. Ferramentas de observação (não mutam a BD):

- `run-eval.ts` — corre o pipeline e escreve o snapshot (baseline de uma fase).
- `audit-families.ts` — gera `tests/fixtures/us-families.tsv` (uma linha por mid); o
  **diff deste ficheiro É a review** do mapeamento de famílias/gerações do catálogo.
- `alias-gap.ts` — famílias de anúncios (via `normalizeVehicle`, ≥5 anúncios) **sem
  correspondência no catálogo** us_*, com sugestão da família mais próxima da mesma
  marca (distância de edição). Aponta o que falta recolher/mapear para subir os
  `confirmado`.

## Saúde do matching no `run-daily` (loop de qualidade)

O `run-daily` termina com dois painéis. O **geral**: taxa de match, % com estimativa,
distribuição de vereditos, amostra PT média. O **de versão** (`versionHealthPanel`):
% confirmado/provável/sem-match global e por fonte (top-8) e nº de estimativas com
versão/specs efetivas do catálogo. O passo (B) do match-models imprime ainda o
**top-20 de anúncios com potência mas sem confirmado** — os alvos para alargar o
catálogo/dicionário. Usar estes relatórios (mais o `alias-gap`) para alargar o
dicionário `MODEL_RULES`/`MAKE_ALIASES` em `lib/engine/normalize-vehicle.ts` e para
priorizar recolha no ultimatespecs. Casos difíceis ficam para a normalização LLM
(fase 2, docs/03).

## Manutenção do catálogo (us_*)

O catálogo `us_models`/`us_versions` é a referência de versões que alimenta o matching
estrito. Manutenção:

- **Refresh mensal** — no **checkout principal** (não neste worktree), sincronizar
  novidades: `node run-ultimatespecs.ts --refresh --deep --fast` (modelos novos do
  sitemap + versões novas em páginas já recolhidas; ~40 min). Ver
  `tools/collector/README.md` › ultimatespecs.
- **Ao mexer no catálogo** (novas marcas, regras de família, exceções): re-correr
  `pnpm exec tsx scripts/eval/audit-families.ts` e **rever o diff** do
  `tests/fixtures/us-families.tsv`, e correr o **property test**
  (`tests/engine/us-catalog.test.ts`: 100% dos mids resolvem por regra/exceção,
  orçamento de exceções ≤ 90). Um slug novo desconhecido **falha o build** do índice
  de propósito — é visto por um humano antes de entrar.
