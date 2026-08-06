/**
 * Identidade de carro físico — o VIN extraído do `detail_url`.
 *
 * Porquê testar a regex em JS quando quem a corre é o Postgres: o padrão só usa
 * construções com a MESMA semântica em POSIX ARE e em `RegExp` — grupo sem
 * captura `(?:…)`, classe de caracteres, repetição fixa `{17}` e as âncoras
 * `^`/`$`. As duas alternâncias são mutuamente exclusivas em qualquer posição
 * (um `/` ou `-` nunca é um char do alfabeto VIN; ou há delimitador ou há fim de
 * string), por isso a diferença clássica POSIX-mais-longo vs. JS-primeira-
 * alternativa não se aplica aqui. `matchVin` abaixo replica o
 * `substring(detail_url from '…')` do SQL, que devolve o GRUPO DE CAPTURA —
 * confirmado contra o armazém, não assumido.
 *
 * Os URLs são reais, tirados do corpus (598 947 anúncios).
 */
import assert from "node:assert/strict";
import { test } from "node:test";
import { sql } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { VIN_URL_PATTERN, carIdentitySql } from "../../lib/engine/car-identity";

/** O que o `substring(x from VIN_URL_PATTERN)` do Postgres devolve: o grupo. */
function matchVin(url: string): string | null {
  return new RegExp(VIN_URL_PATTERN).exec(url)?.[1] ?? null;
}

test("ids de portal não são VINs — o token tem de ser delimitado", () => {
  // ObjectId de 24 chars: disparava em 24 056 de 24 056 anúncios do auto.sapo.
  assert.equal(
    matchVin(
      "https://auto.sapo.pt/carro-usado/654538bad8115b79765fe675/bmw-serie-4-gran-coupe-420-d",
    ),
    null,
  );
  // SHA1 de 40 chars: 9 838 de 9 838 no meinauto.de — a origem do Porsche 911
  // que aparecia 2× na montra (clone do autoboerse.de com "VIN" próprio).
  assert.equal(
    matchVin("https://www.meinauto.de/fahrzeugsuche/detail/00095e39235c64b119fd5b97fabc2e0abe1088d1"),
    null,
  );
  // quoka.de (55 201 disparos), ooyyo.com (9 510), trovit (5 766), autoline (2 062).
  assert.equal(
    matchVin("https://www.quoka.de/anzeigen/auto-motorrad/anzeige/abarth-500/1e04654d0h7g7he7d934i7efhh353d6d.html"),
    null,
  );
  assert.equal(
    matchVin("https://www.ooyyo.com/belgium/c=CDA31D7114D2854F111BE36FBA003544C0821E5016/-3196282969325034426.html/"),
    null,
  );
  assert.equal(
    matchVin(
      "https://rd.clk.thribee.com/id._111m1Qe1J12q/origin.1/country.es/vertical.cars/iuid.3778270trovit-web-6c89fbbb69-fr56c6a60ecb606fd7/page.76/ab.1739381826/",
    ),
    null,
  );
  assert.equal(
    matchVin(
      "https://autoline.pt/-/aluguer/carros/Volkswagen/Caddy-KastenKombi-Maxi-Kombi-EcoProfi--26061913515909392600",
    ),
    null,
  );
  // Um char a mais e já não é chassis — é o caso genérico dos ids acima.
  assert.equal(matchVin("https://x.pt/a/1c4bu0000jph762550/"), null);
});

test("chassis no slug do caetano/carplus — os positivos verdadeiros", () => {
  assert.equal(
    matchVin("https://caetano.pt/pesquisa/jeep-renegade-limited-16-multijet-ii-120cv-4x2-1c4bu0000jph76255/"),
    "1c4bu0000jph76255",
  );
  // O MESMO Abarth cross-listado nos dois sites do grupo: mesma identidade,
  // um carro só. É exatamente para isto que o ponto 2 da identidade existe.
  const abarth = "zfabf13h9rjj40013";
  assert.equal(
    matchVin("https://caetano.pt/pesquisa/abarth-500-695-14-16v-t-jet-180cv-mta-zfabf13h9rjj40013/"),
    abarth,
  );
  assert.equal(
    matchVin("https://www.carplus.pt/veiculo/abarth-500-695-14-16v-t-jet-180cv-mta-zfabf13h9rjj40013/"),
    abarth,
  );
  // Âncoras: chassis no fim do URL (sem `/` final) e em maiúsculas.
  assert.equal(matchVin("https://caetano.pt/pesquisa/byd-atto-2-boost-lgxce4cb3t2078822"), "lgxce4cb3t2078822");
  assert.equal(matchVin("WBA1C4BU0000JPH76"), "WBA1C4BU0000JPH76");
});

test("a identidade sai byte-a-byte igual — `distinct on` tem de casar com o `order by`", () => {
  // Trocar o literal por um placeholder daria `$1` no select e `$2` no order by:
  // "DISTINCT ON expressions must match initial ORDER BY expressions". Zero
  // parâmetros é a garantia de que o texto é o mesmo nas duas interpolações.
  const query = new PgDialect().sqlToQuery(
    sql`select distinct on (${carIdentitySql("l")}) l.id from listings l order by ${carIdentitySql("l")}`,
  );
  assert.deepEqual(query.params, []);
  const [head, orderBy] = query.sql.split(" from listings l order by ");
  assert.equal(head, `select distinct on (${orderBy}) l.id`);
});
