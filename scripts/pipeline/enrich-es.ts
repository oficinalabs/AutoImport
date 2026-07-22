/**
 * Enriquecimento ES: stands espanhóis anunciam o preço FINANCIADO na montra;
 * o "precio al contado" (compra direta — o que um importador paga) está na
 * descrição da página de detalhe. Para os anúncios ES do AutoScout24 que já
 * parecem negócio ao preço de montra (veredito compensa/marginal), busca a
 * página de detalhe e corrige o preço quando encontra o contado.
 *   pnpm exec tsx scripts/pipeline/enrich-es.ts
 * Cada anúncio é visitado UMA vez (marca precio_contado_checked no raw);
 * rate ~1,5 s/pedido. As fontes ES com contado estruturado (flexicar) são
 * corrigidas no ingest (db-sink), não aqui.
 */
try {
  process.loadEnvFile(".env.local");
} catch {
  /* CI: variáveis do ambiente */
}

const RATE_MS = 1500;
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export async function enrichEs(opts: { limit?: number } = {}) {
  const { db } = await import("../../db");
  const { sql } = await import("drizzle-orm");
  const { parsePrecioContado } = await import("../../lib/engine/precio-contado");

  // Elegibilidade: só os anúncios que JÁ parecem negócio ao preço de montra.
  // O contado é sempre ≥ ao anunciado (guarda do parser), logo corrigi-lo só
  // pode BAIXAR a poupança — quem não é oportunidade ao preço do cabeçalho
  // nunca passa a sê-lo ao contado. Visitar os outros ~2.400 ES ativos era
  // trabalho deitado fora (40 min de rede por corrida, contra ~4).
  // `marginal` entra porque a montra mostra a % desses carros e o utilizador
  // clica-lhes; `nao_compensa` fica de fora — nunca sobe.
  // Isto EXIGE que o enrich corra DEPOIS do compute-costs (ver run-daily): é a
  // 1.ª passagem que produz o veredito ao preço de montra, e a 2.ª corrige os
  // que forem alterados aqui, antes do flag-opportunities publicar seja o que
  // for. `savings_pct desc`: numa corrida com --limit, verifica primeiro as
  // afirmações mais fortes.
  const pending = (await db.execute(sql`
    select l.id, l.price, l.detail_url
    from listings l
    join import_cost_estimates e on e.listing_id = l.id
    where l.source_site = 'autoscout24.de'
      and l.country = 'ES'
      and l.deleted_at is null
      and l.detail_url is not null
      and e.verdict in ('compensa', 'marginal')
      and (l.raw->>'precio_contado_checked') is null
    order by e.savings_pct desc
    ${opts.limit != null ? sql`limit ${opts.limit}` : sql``}
  `)) as unknown as { id: string; price: number; detail_url: string }[];

  let corrigidos = 0;
  let semContado = 0;
  let falhas = 0;
  let mortos = 0;

  for (const l of pending) {
    let contado: number | null = null;
    let gone = false;
    try {
      const res = await fetch(l.detail_url, { headers: { "user-agent": UA } });
      if (res.ok) {
        const text = (await res.text()).replace(/<[^>]+>/g, " ");
        contado = parsePrecioContado(text, l.price);
      } else if (res.status === 404 || res.status === 410) {
        // Anúncio removido: soft-delete já (não esperar pelo sweep de 14 dias).
        // Não marcamos precio_contado_checked — é irrelevante num morto.
        await db.execute(sql`update listings set deleted_at = now() where id = ${l.id}`);
        gone = true;
        mortos++;
      } else {
        falhas++;
      }
    } catch {
      falhas++;
    }

    if (gone) {
      await sleep(RATE_MS);
      continue;
    }

    if (contado != null && contado !== l.price) {
      await db.execute(sql`
        update listings set
          price = ${contado},
          raw = raw::jsonb || jsonb_build_object('precio_contado', ${contado}::int, 'precio_contado_checked', true, 'precio_financiado', ${l.price}::int),
          updated_at = now()
        where id = ${l.id}
      `);
      await db.execute(sql`
        insert into listing_price_history (listing_id, price) values (${l.id}, ${contado})
      `);
      corrigidos++;
    } else {
      // marca como visto para não re-buscar todos os dias
      await db.execute(sql`
        update listings set raw = raw::jsonb || jsonb_build_object('precio_contado_checked', true)
        where id = ${l.id}
      `);
      semContado++;
    }
    await sleep(RATE_MS);
  }

  console.log(
    `enrich-es: ${pending.length} verificados · ${corrigidos} preços corrigidos para contado · ${semContado} sem contado na descrição · ${mortos} mortos (404/410) · ${falhas} falhas de fetch`,
  );
  return { checked: pending.length, corrigidos, semContado, mortos, falhas };
}

if (process.argv[1]?.endsWith("enrich-es.ts")) {
  // --limit N: corta a cauda (backfill do stock em fatias); ausente → sem limite.
  const i = process.argv.indexOf("--limit");
  const limit = i >= 0 ? Number(process.argv[i + 1]) : undefined;
  enrichEs(Number.isFinite(limit) ? { limit } : {})
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
