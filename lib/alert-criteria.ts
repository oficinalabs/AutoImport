/**
 * O que um alerta vigia — a forma do JSONB `alerts.criteria` e como dele se
 * tira o MODELO a casar.
 *
 * O matching casava texto cru (`lower(listings.make_raw) = criteria->>'make'`),
 * e no corpus real convivem `VOLKSWAGEN`/`Volkswagen`/`VW` e
 * `Golf`/`Golf VII`/`Golf VIII` — carros iguais que nunca casavam entre si. Um
 * alerta criado na página /alertas não trazia sequer marca/modelo: nascia morto.
 *
 * A unidade de matching passa a ser a **família normalizada**
 * `(vehicle_models.make, vehicle_models.model)` — a mesma que o
 * `scripts/pipeline/match-models.ts` atribui a cada anúncio em `model_id`. NÃO é
 * o `model_id` em si: `vehicle_models` separa por combustível
 * (`volkswagen|golf|diesel` ≠ `volkswagen|golf|gasolina`), e um alerta de "Golf"
 * criado a partir de um Golf diesel deixaria de fora o Golf a gasolina sem o
 * dizer a ninguém. A família é também estável: se o pipeline criar amanhã a
 * linha `volkswagen|golf|phev`, o alerta apanha-a — um conjunto de ids gravado
 * hoje não apanharia.
 *
 * ⚠️ Compatibilidade: o JSONB é livre e há alertas em produção com `make`/`model`
 * em texto cru. `alertModelKeys` normaliza-os no momento da leitura, com o mesmo
 * normalizador do pipeline — não é preciso migração nem reescrever linhas.
 */
import { normMake, normModel } from "./engine/normalize-vehicle";

export interface AlertCriteria {
  /** resumo legível, é o que a UI mostra */
  summary?: string;
  /** custo final em PT máximo, em euros */
  maxPrice?: number;
  /**
   * LEGADO: marca/modelo em texto CRU do anúncio ("VOLKSWAGEN", "Golf VII"),
   * como os gravava o formulário da ficha do anúncio. Continuam a ser gravados
   * (servem de rótulo de recurso) mas quem manda no matching são as chaves.
   */
  make?: string;
  model?: string;
  /** Família normalizada: `vehicle_models.make` / `vehicle_models.model`. */
  makeKey?: string;
  modelKey?: string;
}

/** Uma família de modelos — a unidade que um alerta vigia. */
export interface ModelFamily {
  makeKey: string;
  modelKey: string;
}

/**
 * A família que o alerta vigia, ou `null` se os critérios não chegarem para
 * identificar um modelo (alertas antigos criados só com texto livre). `null`
 * quer dizer "este alerta nunca poderá casar" — e a UI di-lo.
 */
export function alertModelKeys(criteria: AlertCriteria): ModelFamily | null {
  if (criteria.makeKey && criteria.modelKey) {
    return { makeKey: criteria.makeKey, modelKey: criteria.modelKey };
  }
  const makeKey = normMake(criteria.make);
  const modelKey = normModel(makeKey, criteria.model);
  return makeKey && modelKey ? { makeKey, modelKey } : null;
}

/**
 * Rótulo legível de uma família: `volkswagen`+`t-roc` → "Volkswagen T-Roc".
 * Deriva das chaves e não do texto de um anúncio qualquer: um "Golf VII" ou um
 * "320d" como rótulo da família faria crer que o alerta é só daquela geração.
 * Marcas de até 3 letras ficam em maiúsculas (BMW, MG, DS, KIA).
 */
export function familyLabel({ makeKey, modelKey }: ModelFamily): string {
  const make = makeKey.length <= 3 ? makeKey.toUpperCase() : capitalize(makeKey);
  return `${make} ${capitalize(modelKey)}`;
}

/** "classe-a" → "Classe-A"; "serie 3" → "Serie 3". */
function capitalize(slug: string): string {
  return slug.replace(/(^|[-\s])([a-z])/g, (_, sep: string, c: string) => sep + c.toUpperCase());
}
