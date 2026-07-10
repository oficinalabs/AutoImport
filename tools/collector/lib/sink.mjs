// lib/sink.mjs — destino dos registos (a "costura" para a base de dados), genérico.
//
// PORQUÊ isolado: queremos tudo pronto EXCETO o envio para a nossa base de dados. Este é o
// ÚNICO ponto a trocar quando a DB existir. Hoje escreve um log de eventos em NDJSON
// (append-only) — exatamente a forma de um stream de upserts. Parametrizado pelo nome da
// fonte, para cada coletor ter o seu ficheiro de eventos.

import { mkdirSync, appendFileSync } from 'node:fs';
import { join } from 'node:path';

export class Sink {
  constructor(outDir, sourceName) {
    mkdirSync(outDir, { recursive: true });
    this.sourceName = sourceName;
    this.eventsPath = join(outDir, `${sourceName}-events.ndjson`);
  }

  // upsert(record, event): persiste um anúncio novo ou com preço alterado.
  //
  // >>> AQUI ENTRA A BASE DE DADOS <<<
  // Trocar a escrita NDJSON por um upsert idempotente com conflito na chave natural
  // (source_site + id). Exemplo (Supabase), a implementar no futuro:
  //
  //   await db.from('listings').upsert(
  //     { ...record, source_site: this.sourceName },
  //     { onConflict: 'source_site,id' }
  //   );
  //
  // Por agora (sem DB) — log de eventos append-only:
  async upsert(record, event) {
    appendFileSync(this.eventsPath, JSON.stringify({ event, ...record }) + '\n');
  }
}
