// sink.ts — sink do theparking.eu (fino wrapper do sink genérico lib/sink.ts).
// A costura para a base de dados está em lib/sink.ts (`>>> AQUI ENTRA A BASE DE DADOS <<<`).

import { Sink as BaseSink } from '../lib/sink.ts';

export class Sink extends BaseSink {
  constructor(outDir: string) { super(outDir, 'theparking'); }
}
