/**
 * Gera `tests/fixtures/us-families.tsv` — auditoria determinística do mapeamento
 * de famílias/gerações do catálogo. Uma linha por mid, ordenada, byte-a-byte
 * estável. O diff deste ficheiro em PRs futuros É a review do mapeamento.
 *
 *   pnpm exec tsx scripts/eval/audit-families.ts [--out <ficheiro.tsv>]
 *
 * Colunas: mid, make, slug, família, regra_aplicada, gen_start, gen_end, n_versões.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { buildUsCatalog } from "../../lib/engine/us-catalog";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI */
}

function arg(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL em falta");
  const out = arg("--out") ?? "tests/fixtures/us-families.tsv";

  const t0 = Date.now();
  const { db, closeDb } = await import("../../db");
  const idx = await buildUsCatalog(db);
  const ms = Date.now() - t0;

  // linha por mid — precisamos de make/slug/nº versões: recarregar cru
  const { sql } = await import("drizzle-orm");
  const models = (await db.execute(sql`
    select mid, make, slug from us_models order by make, slug, mid
  `)) as unknown as { mid: string; make: string; slug: string }[];
  const nVer = new Map<string, number>();
  for (const v of (await db.execute(sql`
    select mid, count(*)::int as n from us_versions group by mid
  `)) as unknown as { mid: string; n: number }[]) {
    nVer.set(v.mid, v.n);
  }

  // generationId → janela
  const gen = new Map<string, { yearStart: number | null; yearEnd: number | null }>();
  for (const fam of idx.byFamily.values())
    for (const g of fam.generations) gen.set(g.id, { yearStart: g.yearStart, yearEnd: g.yearEnd });

  const lines = ["mid\tmake\tslug\tfamilia\tregra\tgen_start\tgen_end\tn_versoes"];
  for (const m of models) {
    const info = idx.midInfo.get(m.mid);
    if (!info) {
      lines.push(
        `${m.mid}\t${m.make}\t${m.slug}\tIGNORADO\texception:ignored\t\t\t${nVer.get(m.mid) ?? 0}`,
      );
      continue;
    }
    const g = gen.get(info.generationId);
    lines.push(
      [
        m.mid,
        m.make,
        m.slug,
        `${info.makeSlug}|${info.family}`,
        info.rule,
        g?.yearStart ?? "",
        g?.yearEnd ?? "",
        nVer.get(m.mid) ?? 0,
      ].join("\t"),
    );
  }

  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${lines.join("\n")}\n`);

  const s = idx.stats;
  console.log(`índice construído em ${ms}ms`);
  console.log(
    `mids=${s.mids} porRegra=${s.porRegra} porExcecao=${s.porExcecao} ignorados=${s.ignorados}`,
  );
  console.log(
    `familias=${s.familias} geracoes=${s.geracoes} versoes=${s.versoes} versoesExcluidasOther=${s.versoesExcluidasOther}`,
  );
  console.log(`TSV escrito em ${out} (${models.length} linhas)`);
  await closeDb();
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
