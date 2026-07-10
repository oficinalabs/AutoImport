// sink.mjs — sink do theparking.eu (fino wrapper do sink genérico lib/sink.mjs).
// A costura para a base de dados está em lib/sink.mjs (`>>> AQUI ENTRA A BASE DE DADOS <<<`).

import { Sink as BaseSink } from '../lib/sink.mjs';

export class Sink extends BaseSink {
  constructor(outDir) { super(outDir, 'theparking'); }
}
