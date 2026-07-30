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
 *      (ex.: `…atto-2-boost-lgxce4cb3t2078822/`); tem de ser um segmento inteiro
 *      de 17 caracteres do alfabeto VIN, ver `VIN_URL_PATTERN` abaixo;
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

/**
 * VIN no slug: 17 chars do alfabeto sem I/O/Q, em maiúsc. OU minúsc. (o slug vem
 * em minúsculas; POSIX não tem flag `i`), e **delimitado** por `/`, `-` ou pelas
 * pontas da string.
 *
 * Os delimitadores são o ponto todo. Sem eles o padrão casava os primeiros 17
 * chars de QUALQUER corrida alfanumérica do URL e fabricava identidades a partir
 * de ids de portal. Medido no armazém (598 947 anúncios): disparava em 109 866,
 * dos quais só 3 395 eram chassis a sério — `auto.sapo.pt` (ObjectId de 24 chars)
 * e `meinauto.de` (SHA1 de 40) davam 100% de falsos positivos, e o mesmo Porsche
 * 911 aparecia 2× na montra porque o clone do meinauto ficava com "VIN" próprio
 * em vez de colapsar pelo ponto 3. Delimitado: 3 416 disparos — caetano (2 372) e
 * carplus (1 023) mantidos a 100%, e 21 restantes (8 deles VINs a sério no slug).
 *
 * O grupo de captura não é decorativo: `substring(x from '…(…)…')` devolve o
 * GRUPO, não o match inteiro — os delimitadores ficam de fora da identidade.
 *
 * Exportado só para o teste (`tests/engine/car-identity.test.ts`) poder correr o
 * padrão contra URLs reais.
 */
export const VIN_URL_PATTERN = "(?:^|[/-])([A-HJ-NPR-Za-hj-npr-z0-9]{17})(?:[/-]|$)";

// Literal SQL (sem placeholder): a identidade tem de sair BYTE-a-BYTE igual em
// cada interpolação, senão um `distinct on (id) … order by id` deixa de casar
// ("DISTINCT ON expressions must match initial ORDER BY expressions"). Constante
// do código, sem plicas — sem risco de injeção.
const VIN_PATTERN = sql.raw(`'${VIN_URL_PATTERN}'`);

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
