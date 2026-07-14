// lib/sink.ts — destino dos registos (a "costura" para a base de dados), genérico.
//
// PORQUÊ isolado: este é o ÚNICO ponto de escrita dos watch. Escreve SEMPRE o
// log de eventos NDJSON (append-only — serve de auditoria e de replay para o
// scripts/pipeline/ingest.ts) e, quando há DATABASE_URL (env ou .env.local da
// raiz), faz TAMBÉM o upsert no Postgres via db-sink.ts. Sem DATABASE_URL o
// comportamento é o original: NDJSON puro, zero dependências.

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';
import { createDbSink, type DbSink } from './db-sink.ts';

// Tipo de evento emitido para o sink: anúncio novo ou com preço alterado.
export type SinkEvent = 'new' | 'price_change';

export class Sink {
  sourceName: string;
  eventsPath: string;
  private db: DbSink | null;
  private dbErrors = 0;

  constructor(outDir: string, sourceName: string) {
    mkdirSync(outDir, { recursive: true });
    this.sourceName = sourceName;
    this.eventsPath = join(outDir, `${sourceName}-events.ndjson`);
    this.db = createDbSink();
    if (this.db) console.log(`⛁ sink: upsert em Postgres ativo (+ eventos em ${this.eventsPath})`);
  }

  // upsert(record, event): persiste um anúncio novo ou com preço alterado.
  // NDJSON sempre; Postgres quando configurado (upsert idempotente com
  // conflito na chave natural source_site + external_id — ver db-sink.ts).
  async upsert(record: object, event: SinkEvent) {
    appendFileSync(this.eventsPath, JSON.stringify({ event, ...record }) + '\n');
    if (this.db) {
      try {
        await this.db.upsertListing(record as Record<string, unknown>, event, this.sourceName);
      } catch (err) {
        // A recolha não pode morrer por causa da BD — o NDJSON fica para replay.
        if (++this.dbErrors <= 3) console.error(`✗ db-sink: ${(err as Error).message}`);
        if (this.dbErrors === 3) console.error('✗ db-sink: erros seguintes silenciados');
      }
    }
  }

  // Fechar a ligação à BD no fim (watch chama no encerramento; opcional).
  async close() {
    await this.db?.close();
  }
}
