/**
 * Alarme por fonte (scripts/pipeline/check-sources.ts) com summaries gravados
 * num diretório temporário, na forma que os coletores escrevem (lib/cli.ts e o
 * summary multi-mercado do autouncle). Sem base de dados.
 *
 * Cenários do plano: fonte ok, fonte a 30 % da média, fonte a zero (o caso do
 * AutoTrader.nl). Mais: o mesmo summary lido duas vezes não conta como duas
 * corridas, e um mercado do autouncle a zero não se esconde atrás dos outros.
 */
import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { checkSources, isFailure } from "../../scripts/pipeline/check-sources";

const dirs: string[] = [];
after(() => {
  for (const d of dirs) rmSync(d, { recursive: true, force: true });
});

function novoDir(): string {
  const d = mkdtempSync(join(tmpdir(), "check-sources-"));
  dirs.push(d);
  return d;
}

function dia(n: number): string {
  return new Date(Date.UTC(2026, 9, n, 4)).toISOString();
}

function gravar(dir: string, fonte: string, generatedAt: string, total: number) {
  writeFileSync(
    join(dir, `${fonte}-summary.json`),
    JSON.stringify({ generatedAt, durationS: 600, total, pages: 10, bySource: {} }),
  );
}

/** Sete corridas "normais" para cada fonte, uma por dia, verificadas a cada uma. */
function semanaNormal(dir: string, totais: Record<string, number>) {
  for (let d = 1; d <= 7; d++) {
    for (const [fonte, total] of Object.entries(totais)) gravar(dir, fonte, dia(d), total);
    checkSources(dir, new Date(dia(d)));
  }
}

test("fonte ok, fonte a 30 % e fonte a zero", () => {
  const dir = novoDir();
  semanaNormal(dir, { standvirtual: 10_000, autoscout24: 50_000, autotrader: 3_000 });

  gravar(dir, "standvirtual", dia(8), 9_600);
  gravar(dir, "autoscout24", dia(8), 15_000);
  gravar(dir, "autotrader", dia(8), 0);
  const r = Object.fromEntries(checkSources(dir, new Date(dia(8))).map((x) => [x.fonte, x]));

  assert.equal(r.standvirtual.estado, "ok");
  assert.equal(r.autoscout24.estado, "caiu");
  assert.equal(r.autoscout24.media, 50_000);
  assert.equal(r.autotrader.estado, "zero");
  assert.equal(isFailure(r.standvirtual), false);
  assert.equal(isFailure(r.autoscout24), true);
  assert.equal(isFailure(r.autotrader), true);
});

test("zero falha mesmo sem histórico; a primeira corrida não tem média", () => {
  const dir = novoDir();
  gravar(dir, "autotrader", dia(1), 0);
  gravar(dir, "olxpt", dia(1), 8_000);
  const r = Object.fromEntries(checkSources(dir, new Date(dia(1))).map((x) => [x.fonte, x]));
  assert.equal(r.autotrader.estado, "zero");
  assert.equal(r.olxpt.estado, "ok");
  assert.equal(r.olxpt.media, null);
});

test("o mesmo summary lido duas vezes não entra duas vezes na média", () => {
  const dir = novoDir();
  semanaNormal(dir, { olxpt: 8_000 });
  gravar(dir, "olxpt", dia(8), 3_000); // 37,5 % → caiu
  assert.equal(checkSources(dir, new Date(dia(8)))[0].estado, "caiu");
  // Segunda leitura do mesmo ficheiro: a média continua a ser a das 7 anteriores,
  // não passa a incluir a própria corrida má.
  const r = checkSources(dir, new Date(dia(8)))[0];
  assert.equal(r.estado, "caiu");
  assert.equal(r.media, 8_000);
});

test("a média usa só as 7 corridas anteriores", () => {
  const dir = novoDir();
  // 3 corridas altas antigas, depois 7 mais baixas: a referência é 1 000, não as antigas.
  for (let d = 1; d <= 3; d++) {
    gravar(dir, "quoka", dia(d), 100_000);
    checkSources(dir, new Date(dia(d)));
  }
  for (let d = 4; d <= 10; d++) {
    gravar(dir, "quoka", dia(d), 1_000);
    checkSources(dir, new Date(dia(d)));
  }
  gravar(dir, "quoka", dia(11), 900);
  const r = checkSources(dir, new Date(dia(11)))[0];
  assert.equal(r.media, 1_000);
  assert.equal(r.estado, "ok");
});

test("autouncle: cada mercado é uma fonte", () => {
  const dir = novoDir();
  writeFileSync(
    join(dir, "autouncle-summary.json"),
    JSON.stringify({
      generatedAt: dia(1),
      total: 5_000,
      markets: { de: { total: 5_000 }, fr: { total: 0 } },
    }),
  );
  const r = Object.fromEntries(checkSources(dir, new Date(dia(1))).map((x) => [x.fonte, x]));
  assert.equal(r["autouncle-de"].estado, "ok");
  assert.equal(r["autouncle-fr"].estado, "zero");
  assert.equal(r.autouncle, undefined);
});

test("summary sem corrida nova há mais de 7 dias só avisa; ilegível falha", () => {
  const dir = novoDir();
  gravar(dir, "piscapisca", dia(1), 2_000);
  writeFileSync(join(dir, "trovit-summary.json"), "{ cortado");
  writeFileSync(join(dir, "ultimatespecs-summary.json"), JSON.stringify({ generatedAt: dia(1) }));
  const r = Object.fromEntries(checkSources(dir, new Date(dia(10))).map((x) => [x.fonte, x]));
  assert.equal(r.piscapisca.estado, "parada");
  assert.equal(isFailure(r.piscapisca), false);
  assert.equal(r.trovit.estado, "ilegivel");
  assert.equal(isFailure(r.trovit), true);
  assert.equal(r.ultimatespecs, undefined); // catálogo, não anúncios
});
