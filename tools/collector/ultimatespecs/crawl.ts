// crawl.ts — recolha do catálogo de versões do ultimatespecs.com.
//
// FORMA: inventário (sitemaps, 3 pedidos) → filtro por marca/ano → 1 pedido por página
// de MODELO (≈10-20 versões/página). Com --deep, mais 1 pedido por VERSÃO para a ficha
// completa (CO₂, código do motor, caixa…).
//
// DESTINO: com DATABASE_URL (default) o upsert é DIRETO na BD (us_models/us_versions)
// — nada em disco; o resume deriva da própria BD (mid em us_models = modelo feito,
// version_id em us_versions = dedupe), pelo que interromper e relançar nunca duplica.
// Sem DATABASE_URL (ou com --ndjson) escreve NDJSON + checkpoint local (replay via
// scripts/pipeline/ingest-ultimatespecs.ts).
//
// RITMO: por omissão respeita o Crawl-delay: 30 s do robots.txt; o modo --fast corre
// um POOL de workers com throttle próprio (exceção deliberada, ver README). A unidade
// de trabalho é a página de modelo + as suas versões, distribuída pelos workers.

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createCrawlWriter } from '../lib/crawl.ts';
import type { UsDbSink } from './db-sink.ts';
import { BASE, HttpClient } from './http.ts';
import { parseGalleryImages, parseModelPage, parseModelUrl, parseSitemapLocs, parseVersionPage } from './parse.ts';
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
  db: UsDbSink | null;         // destino: BD direta (default) ou null → NDJSON local
  outDir: string;
  resume: boolean;             // só no modo NDJSON (na BD o resume é implícito)
}

export interface CrawlStats {
  records: number;
  pages: number;               // páginas de modelo processadas
  deepPages: number;           // páginas de versão (--deep)
  byMake: Record<string, number>;
  byFuel: Record<string, number>;
  semPotencia: number;
  falhas: number;              // páginas sem resposta (ficam para o próximo run)
}

const SITEMAP_INDEX = `${BASE}/sitemapversions.xml`;

const newStats = (): CrawlStats => ({
  records: 0, pages: 0, deepPages: 0, byMake: {}, byFuel: {}, semPotencia: 0, falhas: 0,
});

function updateStats(s: CrawlStats, r: VersionRecord) {
  s.records++;
  s.byMake[r.make] = (s.byMake[r.make] ?? 0) + 1;
  s.byFuel[r.fuelSection] = (s.byFuel[r.fuelSection] ?? 0) + 1;
  if (r.powerHp == null && r.powerKw == null) s.semPotencia++;
}

// Inventário de páginas de modelo a partir dos sitemaps. `cacheDir` (modo NDJSON):
// guarda em disco para os resumes não gastarem pedidos; no modo BD é null — 3 pedidos
// por run é barato e não fica nada em disco.
async function loadInventory(http: HttpClient, cacheDir: string | null): Promise<ModelRef[]> {
  const cachePath = cacheDir ? join(cacheDir, 'ultimatespecs-models.json') : null;
  if (cachePath && existsSync(cachePath)) {
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
  if (cachePath) {
    writeFileSync(cachePath, JSON.stringify(refs));
    console.log(`≡ inventário: ${refs.length} páginas de modelo (guardado em ${cachePath})`);
  } else {
    console.log(`≡ inventário: ${refs.length} páginas de modelo (sitemaps, sem cache local)`);
  }
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
  const { http, makes, sinceYear, deep, maxModels, concurrency, rateMs, fast, db, outDir, resume } = config;

  // ── estado inicial: da BD (modo direto) ou do checkpoint local (modo NDJSON) ──
  const writer = db
    ? null
    : createCrawlWriter<VersionRecord, CrawlStats>({
        outDir,
        source: 'ultimatespecs',
        resume,
        recordId: (r) => r.versionId,
        newStats,
        updateStats,
        resumeLog: (w) => `↻ resume: ${w.stats.records} versões de ${w.stats.pages} modelos já recolhidas`,
      });
  const stats = writer ? writer.stats : newStats();
  const collectedAt = writer ? writer.collectedAt : new Date().toISOString();

  let doneMids: Set<string>;
  let seenVersions: Set<string> | null = null; // modo BD (no NDJSON o writer é dono do seen)
  if (db) {
    const done = await db.loadDone();
    doneMids = done.doneMids;
    seenVersions = done.seenVersions;
    console.log(`⛁ destino: Postgres (us_models/us_versions) — ${doneMids.size} modelos e ${seenVersions.size} versões já na BD`);
  } else {
    doneMids = new Set<string>((writer?.cursor as string[] | null) ?? []);
  }

  const inventory = await loadInventory(http, db ? null : outDir);
  const alvo = inventory.filter((ref) => {
    if (makes && !makes.includes(ref.make.toLowerCase())) return false;
    if (sinceYear && ref.modelYear !== null && ref.modelYear < sinceYear) return false;
    return true;
  });
  const pendentes = alvo.filter((ref) => !doneMids.has(ref.mid));
  const fatia = maxModels ? pendentes.slice(0, maxModels) : pendentes;

  console.log(`→ alvo: ${alvo.length}/${inventory.length} páginas de modelo`
    + ` (${pendentes.length} pendentes${maxModels ? `, ${fatia.length} neste run` : ''})`
    + `${makes ? ` | marcas: ${makes.join(', ')}` : ''}`
    + `${sinceYear ? ` | ano ≥ ${sinceYear}` : ''}${deep ? ' | DEEP' : ''}`
    + `${fast ? ` | FAST ×${concurrency} @ ${rateMs}ms` : ''}`);

  // Unidade de trabalho: 1 página de modelo + (--deep) as páginas das suas versões.
  // Erros de uma unidade (parse inesperado, BD) não matam o run: contam como falha
  // e o modelo fica para o próximo relançamento (não é marcado como feito).
  const unit = async (ref: ModelRef, client: HttpClient) => {
    try {
      await unitInner(ref, client);
    } catch (err) {
      stats.falhas++;
      console.error(`✗ ${ref.make} ${ref.slug}: ${(err as Error).message} (fica para o próximo run)`);
    }
  };
  const unitInner = async (ref: ModelRef, client: HttpClient) => {
    const html = await client.fetchText(ref.url);
    if (!html) {
      stats.falhas++;
      console.error(`✗ sem resposta: ${ref.url} (fica para o próximo run)`);
      return;
    }
    const parsed = parseModelPage(html, ref, collectedAt);
    const novosArr = parsed.filter((v) =>
      writer ? !writer.has(v.versionId) : !(seenVersions as Set<string>).has(v.versionId));
    for (const v of novosArr) {
      if (!deep) continue;
      const page = await client.fetchText(v.url);
      if (page) {
        v.deep = parseVersionPage(page);
        stats.deepPages++;
      } else {
        stats.falhas++;
        console.error(`✗ deep sem resposta: ${v.url} (versão fica só com o resumo)`);
      }
    }
    if (db) {
      await db.upsertUnit(ref, parseGalleryImages(html, ref.mid.slice(1)), novosArr);
      for (const v of novosArr) {
        (seenVersions as Set<string>).add(v.versionId);
        updateStats(stats, v);
      }
    } else if (writer) {
      for (const v of novosArr) writer.add(v);
    }
    stats.pages++;
    doneMids.add(ref.mid);
    writer?.save([...doneMids]);
    console.log(`  ${ref.make} ${ref.slug}: +${novosArr.length} versões (total ${stats.records})`);
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
    console.log(`■ limite --max-models (${maxModels}) atingido; relançar para continuar`);
  }
  await db?.close();

  return {
    ndjsonPath: writer ? writer.ndjsonPath : '(direto na BD — sem NDJSON)',
    stats,
    alvo: alvo.length,
  };
}
