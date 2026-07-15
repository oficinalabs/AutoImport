// crawl.ts — recolha do catálogo de versões do ultimatespecs.com.
//
// FORMA: inventário (sitemaps, 3 pedidos, cache em disco) → filtro por marca/ano →
// 1 pedido por página de MODELO (≈10-20 versões/página) → NDJSON. Com --deep, mais
// 1 pedido por VERSÃO para a ficha completa (CO₂, código do motor, caixa…).
//
// RITMO: por omissão respeita o Crawl-delay: 30 s do robots.txt (~2 880 páginas/dia;
// catálogo completo com --deep ≈ 20 dias) → o crawl é RETOMÁVEL (--resume, checkpoint
// por página de modelo) e FILTRÁVEL (--make/--since-year). O modo --fast corre um POOL
// de workers com throttle próprio (exceção deliberada ao crawl-delay, ver README):
// a unidade de trabalho é a página de modelo + as suas versões, distribuída pelos
// workers; o dedupe/checkpoint (síncronos) são partilhados e seguros entre workers.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCrawlWriter } from '../lib/crawl.ts';
import { BASE, HttpClient } from './http.ts';
import { parseModelPage, parseModelUrl, parseSitemapLocs, parseVersionPage } from './parse.ts';
import type { ModelRef, VersionRecord } from './schema.ts';

export interface CrawlConfig {
  http: HttpClient;
  makes: string[] | null;      // filtro por marca (lowercase, "alfa romeo"); null = todas
  sinceYear: number | null;    // só modelos com ano ≥ N (páginas sem ano no slug passam)
  deep: boolean;               // buscar também a ficha completa de cada versão
  maxModels: number;           // limite de páginas de modelo neste run (0 = sem limite)
  concurrency: number;         // nº de workers (1 = sequencial educado; >1 só com --fast)
  rateMs: number;              // throttle POR WORKER (em --fast; senão o crawl-delay manda)
  fast: boolean;               // ignorar o crawl-delay do robots (exceção deliberada)
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
  falhas: number;              // páginas sem resposta (ficam para o próximo resume)
}

const SITEMAP_INDEX = `${BASE}/sitemapversions.xml`;

// Inventário de páginas de modelo a partir dos sitemaps, com cache em disco:
// o inventário muda pouco e assim os resumes não gastam pedidos.
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

// Pool mínimo: N workers consomem a mesma fila por índice partilhado.
async function inPool<T>(items: T[], size: number, fn: (item: T, worker: number) => Promise<void>) {
  let next = 0;
  const worker = async (w: number) => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item, w);
    }
  };
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, (_, w) => worker(w)));
}

export async function crawl(config: CrawlConfig) {
  const { http, makes, sinceYear, deep, maxModels, concurrency, rateMs, fast, outDir, resume } = config;

  const writer = createCrawlWriter<VersionRecord, CrawlStats>({
    outDir,
    source: 'ultimatespecs',
    resume,
    recordId: (r) => r.versionId,
    newStats: () => ({
      records: 0, pages: 0, deepPages: 0, byMake: {}, byFuel: {}, semPotencia: 0, falhas: 0,
    }),
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

  // cursor = mids de páginas de modelo já processadas (a unidade modelo+versões é
  // atómica do ponto de vista do checkpoint: o mid só entra no fim da unidade).
  const doneMids = new Set<string>((writer.cursor as string[] | null) ?? []);
  const pendentes = alvo.filter((ref) => !doneMids.has(ref.mid));
  const fatia = maxModels ? pendentes.slice(0, maxModels) : pendentes;

  console.log(`→ alvo: ${alvo.length}/${inventory.length} páginas de modelo`
    + ` (${pendentes.length} pendentes${maxModels ? `, ${fatia.length} neste run` : ''})`
    + `${makes ? ` | marcas: ${makes.join(', ')}` : ''}`
    + `${sinceYear ? ` | ano ≥ ${sinceYear}` : ''}${deep ? ' | DEEP' : ''}`
    + `${fast ? ` | FAST ×${concurrency} @ ${rateMs}ms` : ''}`);

  // Unidade de trabalho: 1 página de modelo + (--deep) as páginas das suas versões.
  const unit = async (ref: ModelRef, client: HttpClient) => {
    const html = await client.fetchText(ref.url);
    if (!html) {
      writer.stats.falhas++;
      console.error(`✗ sem resposta: ${ref.url} (fica para o próximo resume)`);
      return;
    }
    const versions = parseModelPage(html, ref, writer.collectedAt);
    let novos = 0;
    for (const v of versions) {
      if (writer.has(v.versionId)) continue;
      if (deep) {
        const page = await client.fetchText(v.url);
        if (page) {
          v.deep = parseVersionPage(page);
          writer.stats.deepPages++;
        } else {
          writer.stats.falhas++;
          console.error(`✗ deep sem resposta: ${v.url} (versão fica só com o resumo)`);
        }
      }
      if (writer.add(v)) novos++;
    }
    writer.stats.pages++;
    doneMids.add(ref.mid);
    writer.save([...doneMids]);
    console.log(`  ${ref.make} ${ref.slug}: +${novos} versões (total ${writer.stats.records})`);
  };

  if (fast && concurrency > 1) {
    // Cada worker tem o seu cliente (o throttle do lib/http.ts é por instância).
    const clients = Array.from({ length: concurrency }, () =>
      new HttpClient({ ignoreCrawlDelay: true, minDelayMs: rateMs }));
    await inPool(fatia, concurrency, (ref, w) => unit(ref, clients[w]));
  } else {
    for (const ref of fatia) await unit(ref, http);
  }
  if (maxModels && pendentes.length > fatia.length) {
    console.log(`■ limite --max-models (${maxModels}) atingido; retomar com --resume`);
  }

  return { ndjsonPath: writer.ndjsonPath, stats: writer.stats, alvo: alvo.length };
}
