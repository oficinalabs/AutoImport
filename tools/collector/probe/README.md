# probe/ — teste de limites + recolha paralela (sem proxies)

Ferramentas da branch `investigacao/scrapers-python-migracao`. **Ambas são batch/NDJSON puro →
NUNCA tocam na base de dados** (o upsert só existe no `watch`/`ingest`). Segurança confirmada.

## `rate-probe.mjs` — mede o ritmo mínimo seguro de cada fonte

Corre o coletor REAL de cada fonte em rajadas curtas (3 páginas) a ritmos decrescentes
(1500 → 700 → 350 → 175 ms), a detetar bloqueio por avisos de falha (403/página-vazia após
retries) e queda de resultados. Fontes em paralelo (hosts diferentes); ritmos em série por fonte.
Honra o `Crawl-delay` do robots como piso (ooyyo 30 s, aramisauto 5 s) — não empurra além disso.

```bash
node probe/rate-probe.mjs        # 1 linha JSON por (fonte, ritmo) + SUMMARY final
```

### Resultado (2026-07-22) — `rate-probe-results-2026-07-22.log`

**0 avisos de bloqueio em TODO o probe.** Todas as 22 fontes HTTP-puras toleraram **175 ms
(~6 req/s)** sem bloquear — o mais rápido testado. As 2 com `Crawl-delay` foram honradas no piso
(ooyyo 30 s, aramisauto 5 s). Conclusão: os coletores estão **~4–8× sub-acelerados** face ao
default de 1500 ms.

> ⚠️ **Ressalva:** o probe testa RAJADAS CURTAS (3 págs). Em `--full` (milhares de págs) o risco
> de bloqueio acumula com o volume sustentado. Por isso a recolha usa ritmos **conservadores**
> (350–700 ms), não os 175 do probe, e o único IP (sem proxies) obriga a prudência: um bloqueio
> afeta todos os coletores.

## `collect-all.mjs` — recolha paralela cross-site

Corre os coletores em paralelo ENTRE sites (cada host vê só o seu stream em série — é o ganho de
velocidade seguro sem proxies), `--full --resume` → NDJSON em `out/`. Vigia o disco (pára de
arrancar fontes novas abaixo de 5 GB livres).

```bash
node probe/collect-all.mjs --tier core            # PT + EU médio (tratável em disco)
node probe/collect-all.mjs --tier mega            # autoscout24 pan-EU + autouncle (>10 GB, dias)
node probe/collect-all.mjs --tier all --concurrency 5
node probe/collect-all.mjs --tier core --rates ratesfile.json
```

**Tiers:** `core` = fontes HTTP-puras tratáveis; `mega` = agregadores gigantes (autoscout24
~2,15M pan-EU; autouncle multi-país). Separados por volume/disco/tempo.

> **Destino dos dados:** isto escreve NDJSON para disco. O carregamento na BD (`scripts/pipeline/
> ingest.ts`) é um passo à parte — e a Supabase Free tem **500 MB (~150k linhas)**, pelo que a
> full collection NÃO cabe na BD sem retenção/seleção. Decisão do dono dos dados.

## Onde fica o arquivo — `COLLECTOR_OUT_DIR`

Ambos os orquestradores (`collect-all.mjs` e `collector-daemon.mjs`) resolvem o diretório de
saída na mesma ordem que os coletores: `--out <dir>` > `COLLECTOR_OUT_DIR` >
`tools/collector/out/`. Como cada passagem `--full` de todas as fontes acrescenta ~564 MB ao
arquivo (o daemon faz uma de 3 em 3 dias), vale a pena apontá-lo para um disco com espaço:

```bash
export COLLECTOR_OUT_DIR="/Volumes/SSD 500GB/autoimport/collector-out"
node probe/collector-daemon.mjs
```

O daemon reencaminha o diretório resolvido para os processos-filho (`--out`), por isso os
`watch-*`/`run-*` que ele arranca escrevem todos no mesmo sítio — incluindo o
`daemon-state.json` e a guarda de espaço livre do `collect-all.mjs`, que passa a medir o disco
de destino. A variável não move o que já está no diretório antigo.
