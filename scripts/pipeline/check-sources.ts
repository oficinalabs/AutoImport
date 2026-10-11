/**
 * Alarme por fonte — falha quando um coletor devolve muito menos do que costuma.
 *
 * Em ago 2026 o AutoTrader.nl levava 404 (o site largou o `occasions` do URL),
 * esgotava as tentativas e terminava com "✓ 0 anúncios": verde, e vazio, durante
 * meses (MVP.md). O `frescura.yml` não apanha isto — as outras fontes continuam a
 * trazer dados frescos. Este script compara cada fonte consigo própria.
 *
 *   pnpm pipeline:fontes                    # lê COLLECTOR_OUT_DIR (ou tools/collector/out)
 *   pnpm pipeline:fontes --dir <arquivo>
 *
 * Lê os `<fonte>-summary.json` que os coletores escrevem no fim de cada `run-*`
 * (não precisa de base de dados). Como cada corrida reescreve o summary, o
 * histórico das contagens fica num ficheiro ao lado, `check-sources-history.json`.
 *
 * Sai com 1 se, na última corrida de alguma fonte:
 *   - a contagem for zero; ou
 *   - for menor do que 50 % da média das 7 corridas anteriores.
 * Uma fonte cujo summary não muda há mais de 7 dias só dá aviso: as fontes
 * corridas à mão (piscapisca, autouncle em modo stealth) ficariam vermelhas
 * para sempre, e um alarme que toca sem motivo aprende-se a ignorar.
 */
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

/** Uma corrida abaixo desta fração da média recente é uma fonte partida. */
export const FRACAO_MINIMA = 0.5;
/** Quantas corridas anteriores entram na média. */
export const CORRIDAS_NA_MEDIA = 7;
/**
 * Dias sem corrida nova até avisar. O daemon re-crawla cada fonte de 3 em 3
 * dias (`RECRAWL_DAYS` em tools/collector/probe/collector-daemon.mjs); 7 dá
 * duas falhas seguidas de folga.
 */
export const DIAS_SEM_CORRIDA = 7;
/** Summaries que não são contagens de anúncios (o catálogo de versões). */
const IGNORADAS = new Set(["ultimatespecs"]);

const HISTORICO = "check-sources-history.json";
const SUFIXO = "-summary.json";

export type Corrida = { generatedAt: string; total: number };
export type Historico = Record<string, Corrida[]>;
export type Resultado = {
  fonte: string;
  estado: "ok" | "zero" | "caiu" | "parada" | "ilegivel";
  total: number | null;
  media: number | null;
  generatedAt: string | null;
};

/**
 * Lê os summaries do diretório. O autouncle escreve um summary com vários
 * mercados (`markets.<código>.total`); cada mercado conta como fonte própria,
 * porque um mercado partido não pode esconder-se atrás dos outros.
 */
export function readSummaries(dir: string): {
  corridas: Record<string, Corrida>;
  ilegiveis: string[];
} {
  const corridas: Record<string, Corrida> = {};
  const ilegiveis: string[] = [];
  for (const file of readdirSync(dir).sort()) {
    if (!file.endsWith(SUFIXO)) continue;
    const fonte = file.slice(0, -SUFIXO.length);
    if (IGNORADAS.has(fonte)) continue;
    let s: {
      generatedAt?: unknown;
      total?: unknown;
      markets?: Record<string, { total?: unknown }>;
    };
    try {
      s = JSON.parse(readFileSync(join(dir, file), "utf8"));
    } catch {
      ilegiveis.push(fonte);
      continue;
    }
    if (typeof s.generatedAt !== "string" || typeof s.total !== "number") {
      ilegiveis.push(fonte);
      continue;
    }
    if (s.markets && typeof s.markets === "object") {
      for (const [code, m] of Object.entries(s.markets)) {
        if (typeof m?.total !== "number") ilegiveis.push(`${fonte}-${code}`);
        else corridas[`${fonte}-${code}`] = { generatedAt: s.generatedAt, total: m.total };
      }
    } else {
      corridas[fonte] = { generatedAt: s.generatedAt, total: s.total };
    }
  }
  return { corridas, ilegiveis };
}

/**
 * Junta as corridas novas ao histórico. Um summary que não mudou desde a última
 * verificação (mesmo `generatedAt`) não é uma corrida nova e não entra outra vez.
 * Guarda só o que a média precisa: a última e as `CORRIDAS_NA_MEDIA` anteriores.
 */
export function recordRuns(historico: Historico, corridas: Record<string, Corrida>): Historico {
  const novo: Historico = { ...historico };
  for (const [fonte, corrida] of Object.entries(corridas)) {
    const lista = novo[fonte] ?? [];
    if (lista.at(-1)?.generatedAt === corrida.generatedAt) continue;
    novo[fonte] = [...lista, corrida].slice(-(CORRIDAS_NA_MEDIA + 1));
  }
  return novo;
}

/** Avalia cada fonte com summary presente. Fontes sem summary saem do relatório. */
export function evaluate(
  historico: Historico,
  fontes: string[],
  ilegiveis: string[],
  agora: Date,
): Resultado[] {
  const resultados: Resultado[] = ilegiveis.map((fonte) => ({
    fonte,
    estado: "ilegivel",
    total: null,
    media: null,
    generatedAt: null,
  }));
  for (const fonte of fontes) {
    const lista = historico[fonte] ?? [];
    const ultima = lista.at(-1);
    if (!ultima) continue;
    const anteriores = lista.slice(0, -1).slice(-CORRIDAS_NA_MEDIA);
    const media = anteriores.length
      ? anteriores.reduce((n, c) => n + c.total, 0) / anteriores.length
      : null;
    const dias = (agora.getTime() - new Date(ultima.generatedAt).getTime()) / 86_400_000;

    let estado: Resultado["estado"] = "ok";
    if (ultima.total === 0) estado = "zero";
    else if (media !== null && ultima.total < media * FRACAO_MINIMA) estado = "caiu";
    else if (dias > DIAS_SEM_CORRIDA) estado = "parada";

    resultados.push({
      fonte,
      estado,
      total: ultima.total,
      media: media === null ? null : Math.round(media),
      generatedAt: ultima.generatedAt,
    });
  }
  return resultados.sort((a, b) => a.fonte.localeCompare(b.fonte));
}

/** Estados que põem o alarme a vermelho. `parada` é só aviso (ver cabeçalho). */
export function isFailure(r: Resultado): boolean {
  return r.estado === "zero" || r.estado === "caiu" || r.estado === "ilegivel";
}

/** Lê, regista e avalia. Escreve o histórico atualizado no próprio diretório. */
export function checkSources(dir: string, agora = new Date()): Resultado[] {
  const path = join(dir, HISTORICO);
  const anterior: Historico = existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : {};
  const { corridas, ilegiveis } = readSummaries(dir);
  const historico = recordRuns(anterior, corridas);
  writeFileSync(path, JSON.stringify(historico, null, 2));
  return evaluate(historico, Object.keys(corridas), ilegiveis, agora);
}

function linha(r: Resultado): string {
  const fmt = (n: number | null) => (n === null ? "—" : n.toLocaleString("pt-PT"));
  const quando = r.generatedAt?.slice(0, 16).replace("T", " ") ?? "—";
  return `${r.fonte}: ${fmt(r.total)} anúncios (média anterior ${fmt(r.media)}) · corrida de ${quando}`;
}

if (process.argv[1]?.endsWith("check-sources.ts")) {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* ausente: as variáveis vêm do ambiente */
  }
  const i = process.argv.indexOf("--dir");
  // Mesma precedência dos coletores (tools/collector/lib/cli.ts).
  const dir =
    (i >= 0 ? process.argv[i + 1] : undefined) ||
    process.env.COLLECTOR_OUT_DIR ||
    "tools/collector/out";

  if (!existsSync(dir)) {
    console.error(`::error::fontes: o diretório ${dir} não existe. Define COLLECTOR_OUT_DIR.`);
    process.exit(1);
  }
  const resultados = checkSources(dir);
  if (resultados.length === 0) {
    console.error(`::error::fontes: nenhum *-summary.json em ${dir}.`);
    process.exit(1);
  }

  for (const r of resultados) {
    // ::error:: / ::warning:: para o GitHub Actions destacar no resumo da corrida.
    if (r.estado === "zero") console.error(`::error::Fonte a zero — ${linha(r)}`);
    else if (r.estado === "caiu")
      console.error(`::error::Fonte abaixo de ${FRACAO_MINIMA * 100} % da média — ${linha(r)}`);
    else if (r.estado === "ilegivel")
      console.error(`::error::Summary ilegível ou sem total — ${r.fonte}`);
    else if (r.estado === "parada")
      console.warn(`::warning::Sem corrida nova há mais de ${DIAS_SEM_CORRIDA} dias — ${linha(r)}`);
    else console.log(`ok · ${linha(r)}`);
  }
  const falhas = resultados.filter(isFailure).length;
  console.log(`\nfontes: ${resultados.length} verificadas · ${falhas} com alarme`);
  process.exit(falhas ? 1 : 0);
}
