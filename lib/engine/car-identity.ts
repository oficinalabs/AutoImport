/**
 * Identidade de CARRO FÍSICO — não de anúncio.
 *
 * Grupos como Caetano/CarPlus (e agregadores como theparking/trovit) listam o
 * MESMO stock em vários sites, muitas vezes com preço/km ligeiramente diferentes
 * (montra financiada vs. contado, arredondamentos). Contar 2× infla a amostra PT,
 * duplica oportunidades e mostra o mesmo carro duas vezes na montra. A identidade
 * abaixo colapsa esses cross-listings num só:
 *
 *   1. `vin` — quando o anúncio o traz, é a prova definitiva;
 *   2. VIN no `detail_url` — caetano/carplus põem o chassis no slug do URL
 *      (ex.: `…atto-2-boost-lgxce4cb3t2078822/`); 17 caracteres do alfabeto VIN
 *      (sem I/O/Q), apanhados em maiúsc. OU minúsc. (o slug vem em minúsculas);
 *   3. `(model_id, year, round(km,-3), price)` — sem VIN de todo, o mesmo carro
 *      cross-listado partilha modelo+ano+preço e km na mesma casa dos milhares;
 *      carros distintos raramente coincidem nos quatro. No theparking o
 *      `seller_name` é o próprio portal, por isso não serve de desempate — a
 *      identidade tem de vir do carro, não da fonte.
 *
 * Usado nos 3 sítios que contam carros: `sample()` (amostra PT), a CTE `winners`
 * do flag-opportunities e o distinct da pesquisa. Um único sítio para a regra.
 */
import { sql, type SQL } from "drizzle-orm";

// VIN: 17 chars do alfabeto sem I/O/Q. Maiúsc.+minúsc. para apanhar o chassis
// em minúsculas no slug do URL (case-insensitive à mão — POSIX não tem flag `i`).
// Literal SQL (sem placeholder): a identidade tem de sair BYTE-a-BYTE igual em
// cada interpolação, senão um `distinct on (id) … order by id` deixa de casar
// ("DISTINCT ON expressions must match initial ORDER BY expressions"). Constante
// do código, sem plicas — sem risco de injeção.
const VIN_PATTERN = sql.raw("'[A-HJ-NPR-Za-hj-npr-z0-9]{17}'");

/**
 * Fragmento SQL da identidade de carro físico para um alias de `listings`.
 * O alias entra cru (ex.: `"l"`, `"l2"`, `"listings"`) — é sempre uma constante
 * do próprio código, nunca entrada externa.
 */
export function carIdentitySql(alias: string): SQL {
  const a = sql.raw(alias);
  return sql`coalesce(
    upper(${a}.vin),
    upper(substring(${a}.detail_url from ${VIN_PATTERN})),
    ${a}.model_id::text || ':' || coalesce(${a}.year, 0)::text || ':'
      || round(coalesce(${a}.km, 0)::numeric, -3)::text || ':' || coalesce(${a}.price, 0)::text
  )`;
}
