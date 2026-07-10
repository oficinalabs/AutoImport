// sink.mjs — destino dos registos recolhidos (a "costura" para a base de dados).
//
// PORQUÊ este módulo isolado: queremos tudo pronto para produção EXCETO o envio para a
// nossa base de dados. Toda a recolha/normalização/deteção de mudanças acontece a
// montante; aqui fica o ÚNICO ponto a trocar quando a DB existir. Hoje escreve um log
// de eventos em NDJSON (append-only), que é exatamente a forma de um stream de upserts.
//
// Cada evento tem `event` ∈ { 'new', 'price_change' } e o registo final (schema + id +
// first_seen/last_seen) — precisamente a linha que faríamos upsert numa tabela.

import { mkdirSync, appendFileSync } from 'node:fs';
import { join, dirname } from 'node:path';

export class Sink {
  constructor(outDir) {
    mkdirSync(outDir, { recursive: true });
    this.eventsPath = join(outDir, 'theparking-events.ndjson');
  }

  // upsert(record, event): persiste um anúncio novo ou com preço alterado.
  //
  // >>> AQUI ENTRA A BASE DE DADOS <<<
  // Quando ligarmos ao Postgres/Supabase, substituir a escrita NDJSON abaixo por um
  // upsert idempotente com conflito na chave natural (`source` + `id` do theparking).
  // Exemplo (Supabase), a implementar no futuro:
  //
  //   await db.from('listings').upsert(
  //     { ...record, source_site: 'theparking.eu' },
  //     { onConflict: 'source_site,id' }
  //   );
  //
  // Por agora (sem DB) — log de eventos append-only:
  async upsert(record, event) {
    appendFileSync(this.eventsPath, JSON.stringify({ event, ...record }) + '\n');
  }
}
