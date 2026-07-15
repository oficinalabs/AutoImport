// crawl.ts — recolha do catálogo de versões do ultimatespecs.com.
//
// FORMA: inventário (sitemaps, 3 pedidos, cache em disco) → filtro por marca/ano →
// 1 pedido por página de MODELO (≈10-20 versões/página) → NDJSON. Com --deep, mais
// 1 pedido por VERSÃO para a ficha completa (CO₂, código do motor, caixa…).
//
// RITMO: o robots.txt impõe Crawl-delay: 30 s → ~2 880 páginas/dia. O catálogo completo
// (~6 300 modelos) leva ~2,2 dias; por isso o crawl é RETOMÁVEL (--resume, checkpoint por
// página de modelo) e FILTRÁVEL (--make/--since-year) para recolhas dirigidas ao matching.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { HttpClient } from './http.ts';
import { BASE } from './http.ts';
import { parseModelPage, parseModelUrl, parseSitemapLocs, parseVersionPage } from './parse.ts';
import type { ModelRef, VersionRecord } from './schema.ts';

export interface CrawlConfig {
  http: HttpClient;
  makes: string[] | null;      // filtro por marca (lowercase, "alfa romeo"); null = todas
  sinceYear: number | null;    // só modelos com ano ≥ N (páginas sem ano no slug passam)
  deep: boolean;               // buscar também a ficha completa de cada versão
  maxModels: number;           // limite de páginas de modelo neste run (0 = sem limite)
  outDir: string;
  resume: boolean;
}

export interface CrawlStats {
  records: number;
  pages: number;               // páginas de modelo processadas
  deepPages: number;           // páginas de versão (--deep)
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  semPotencia: number;
}

const SITEMAP_INDEX = `${BASE}/sitemapversions.xml`;

// Inventário de páginas de modelo a partir dos sitemaps, com cache em disco:
// o inventário muda pouco e assim os resumes não gastam pedidos (nem os 30 s cada).
async function loadInventory(http: HttpClient, outDir: string): Promise<ModelRef[]> {
  const cachePath = join(outDir, 'ultimatespecs-models.json');
  if (existsSync(cachePath)) {
    const refs = JSON.parse(readFileSync(cachePath, 'utf8')) as ModelRef[];
    console.log(`≡ inventário em cache: ${refs.length} páginas de modelo (${cachePath})`);
    return refs;
  }
  const index = await http.fetchText(SITEMAP_INDEX);
  if (!index) throw new Error(`falha a obter ${SITEMAP_INDEX}`);
  const refs: ModelRef[] = [];
  for (const sub of parseSitemapLocs(index)) {
    const xml = await http.fetchText(sub);
    if (!xml) throw new Error(`falha a obter ${sub}`);
    for (const loc of parseSitemapLocs(xml)) {
      const ref = parseModelUrl(loc);
      if (ref) refs.push(ref);
    }
  }
  writeFileSync(cachePath, JSON.stringify(refs));
  console.log(`≡ inventário: ${refs.length} páginas de modelo (guardado em ${cachePath})`);
  return refs;
}

export async function crawl(config: CrawlConfig) {
  const { http, makes, sinceYear, deep, maxModels, outDir, resume } = config;

  const writer = createCrawlWriter<VersionRecord, CrawlStats>({
    outDir,
    source: 'ultimatespecs',
    resume,
    recordId: (r) => r.versionId,
    newStats: () => ({ records: 0, pages: 0, deepPages: 0, byMake: {}, byFuel: {}, semPotencia: 0 }),
    updateStats: (s, r) => {
      s.records++;
      s.byMake[r.make] = (s.byMake[r.make] ?? 0) + 1;
      s.byFuel[r.fuelSection] = (s.byFuel[r.fuelSection] ?? 0) + 1;
      if (r.powerHp == null && r.powerKw == null) s.semPotencia++;
    },
    resumeLog: (w) => `↻ resume: ${w.stats.records} versões de ${w.stats.pages} modelos já recolhidas`,
  });

  const inventory = await loadInventory(http, outDir);
  const alvo = inventory.filter((ref) => {
    if (makes && !makes.includes(ref.make.toLowerCase())) return false;
    if (sinceYear && ref.modelYear !== null && ref.modelYear < sinceYear) return false;
    return true;
  });
  console.log(`→ alvo: ${alvo.length}/${inventory.length} páginas de modelo`
    + `${makes ? ` | marcas: ${makes.join(', ')}` : ''}`
    + `${sinceYear ? ` | ano ≥ ${sinceYear}` : ''}${deep ? ' | DEEP' : ''}`);

  // cursor = mids de páginas de modelo já processadas (as versões deep ficam completas
  // no momento da escrita, por isso o mid só entra no cursor no fim da página).
  const doneMids = new Set<string>((writer.cursor as string[] | null) ?? []);
  let processed = 0;

  for (const ref of alvo) {
    if (doneMids.has(ref.mid)) continue;
    if (maxModels && processed >= maxModels) {
      console.log(`■ limite --max-models (${maxModels}) atingido; retomar com --resume`);
      break;
    }
    const html = await http.fetchText(ref.url);
    if (!html) {
      console.error(`✗ sem resposta: ${ref.url} (fica para o próximo resume)`);
      continue;
    }
    const versions = parseModelPage(html, ref, writer.collectedAt);
    let novos = 0;
    for (const v of versions) {
      if (writer.has(v.versionId)) continue;
      if (deep) {
        const page = await http.fetchText(v.url);
        if (page) {
          v.deep = parseVersionPage(page);
          writer.stats.deepPages++;
        } else {
          console.error(`✗ deep sem resposta: ${v.url} (versão fica só com o resumo)`);
        }
      }
      if (writer.add(v)) novos++;
    }
    writer.stats.pages++;
    processed++;
    doneMids.add(ref.mid);
    writer.save([...doneMids]);
    console.log(`  ${ref.make} ${ref.slug}: +${novos} versões (total ${writer.stats.records})`);
  }

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, alvo: alvo.length };
}
