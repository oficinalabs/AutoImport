# Harness de avaliação (`scripts/eval`)

Mede a saúde do pipeline de matching num **snapshot JSON determinístico** e
guarda baselines committed para comparar fases do "matching perfeito". Os diffs
entre baselines têm de explicar-se pela mudança que os gerou — nada de ruído.

## Como correr

```bash
# snapshot do estado atual (só corre o pipeline, sem re-ingerir NDJSON)
pnpm exec tsx scripts/eval/run-eval.ts --out scripts/eval/baselines/<nome>.json

# re-ingerir fontes afetadas antes do pipeline (upsert idempotente)
pnpm exec tsx scripts/eval/run-eval.ts --out scripts/eval/baselines/<nome>.json \
  --ingest /caminho/para/tools/collector/out --source standvirtual,aramisauto
```

- `--out` (obrigatório): ficheiro do snapshot.
- `--ingest <dir>`: re-corre o `scripts/pipeline/ingest.ts` sobre esse diretório
  antes do pipeline (para o upsert coalescer campos novos do db-sink).
- `--source a,b`: limita o re-ingest a essas fontes (nomes de ficheiro NDJSON).

Depois do (opcional) ingest, corre sempre `match-models → pt-market →
compute-costs → flag-opportunities` e escreve o snapshot. Os passos são
idempotentes: re-correr sobre a mesma BD dá um ficheiro byte-a-byte igual.

## O que significa cada métrica

`porFonte[<source_site>]` — por fonte, sobre anúncios **ativos**:
- `ativos` — anúncios não soft-deleted.
- `pctModelId` — % com modelo canónico ligado (matching).
- `pctPowerHp` / `pctDisplacementCc` / `pctCo2` / `pctVariant` — % com esse
  campo preenchido. A potência é a mais crítica: o matching estrito exclui
  observações sem ela.

`global`:
- `taxaMatch` — % de ativos com `model_id`.
- `vehicleModels` — nº de modelos canónicos.
- `estimativas` — sobre anúncios estrangeiros elegíveis (espelha a
  elegibilidade do `compute-costs.ts`): `total`, `calculadas` (têm estimativa),
  `semDados` (sem cc/CO₂ nos não-elétricos, ou sem potência), `semAmostra`
  (têm dados mas o mercado PT não tem amostra suficiente).
- `vereditos` — distribuição `compensa` / `marginal` / `nao_compensa`.
- `oportunidadesAtivas` — nº de oportunidades ativas.
- `amostraPt` — observações PT dos últimos 60 dias (janela da estimativa),
  partidas por `comPotencia` / `semPotencia` (as sem potência ficam de fora do
  matching estrito).

`naoMapeados` — top-20 `(make | model | fuel)` cru sem modelo (alimenta o
dicionário `MODEL_RULES`/`MAKE_ALIASES` em `lib/engine/normalize-vehicle.ts`).

## Baselines

- `00-antes-quickwin.json` — estado antes do quick-win `engine_power_cv`/
  `power_ch` no db-sink.
- `01-baseline.json` — depois do quick-win (baseline oficial das fases
  seguintes). O diff para o `00` explica-se só pela potência recuperada de
  standvirtual (0,1→99,9%) e aramisauto (37,8→100%).

**Regra:** um baseline só muda com justificação no commit. Mexer num baseline
sem explicar a origem do diff é um erro — o objetivo é rastrear cada ganho/perda
de qualidade a uma mudança concreta.
