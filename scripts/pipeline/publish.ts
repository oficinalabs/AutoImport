/**
 * publish — leva a MONTRA do warehouse (corpus local) para a base que serve a app.
 *
 * O corpus (centenas de milhares de anúncios) vive numa Postgres LOCAL; a base da
 * app tem 500 MB e só precisa do que o site mostra. Este script é a ponte: abre as
 * DUAS ligações — `dbUrl()` (origem, corpus) e `appDbUrl()` (destino) — e só o
 * destino passa por `assertWritable` (ver lib/db-url.ts).
 *
 * CONJUNTO PUBLICADO — a montra inteira: `deleted_at is null` +
 * `match_confidence = 'exato'` + `pt_confidence = 'normal'`. Os dois valores vêm
 * de `lib/queries.ts` (MONTRA_MATCH_CONFIDENCE/MONTRA_PT_CONFIDENCE), a mesma
 * fonte que a constante `COM_CATALOGO` da montra usa — mudar a regra lá muda-a
 * aqui, e as duas não podem divergir. Publicar só as oportunidades seria mais
 * barato mas mudava o produto (a pesquisa e os agregados por país vivem da
 * montra toda).
 *
 * ⚠️ IDENTIDADE — o risco silencioso. `listings.id` é um uuid gerado em CADA base,
 * e no destino há favoritos, alertas e oportunidades a apontar-lhe. Por isso **o
 * destino é a autoridade do id**: tudo entra por upsert na CHAVE NATURAL
 * (`source_site`,`external_id`) e o id remoto é LIDO DE VOLTA para remapear as
 * tabelas filhas. O mesmo para `vehicle_models` (`norm_key`) e `sources` (`slug`),
 * que também têm uuid gerado em cada base. Nunca se força um uuid local; nunca se
 * apaga um listing — o que morre leva `deleted_at`, e a `favoritesQuery` mostra os
 * mortos de propósito (docs/08).
 *
 * O QUE NÃO ATRAVESSA: `listings.raw`, `listings.match_evidence` e
 * `import_cost_estimates.inputs` — auditoria do pipeline, lida só no warehouse.
 * (A `us_versions.specs` deixou de existir: era ~100 MB dos 116 do catálogo, sem
 * leitores, e passou a viver no NDJSON — ver db/schema.ts.)
 *
 * DRY-RUN por omissão: corre o ciclo INTEIRO dentro de uma transação e faz ROLLBACK
 * no fim, portanto os números impressos são reais (e o ensaio prova que as FKs
 * aguentam). `--apply` faz commit. Também no modo real é tudo uma transação: ou
 * entra tudo, ou não entra nada — nunca há uma janela com verde sobre carro morto.
 *
 *   DB_TARGET=prod pnpm exec tsx scripts/pipeline/publish.ts           # dry-run
 *   DB_TARGET=prod pnpm exec tsx scripts/pipeline/publish.ts --apply   # a sério
 */
import postgres from "postgres";
import { appDbUrl, assertWritable, dbUrl } from "../../lib/db-url";
import { MONTRA_MATCH_CONFIDENCE, MONTRA_PT_CONFIDENCE } from "../../lib/queries";

/** A ligação dentro da transação do destino — é lá que tudo se escreve. */
type Tx = postgres.TransactionSql;
type Row = Record<string, unknown>;

// ── Colunas que atravessam ────────────────────────────────────────
// Primeiro a chave natural (alvo do `on conflict`), depois os dados. O `id` nunca
// vai: é do destino. Ver o cabeçalho para o que fica de fora e porquê.

const LISTING_KEY = ["source_site", "external_id"];
const LISTING_DATA = (
  "source_id model_id make_raw model_raw variant year km fuel_raw fuel gearbox engine_raw " +
  "displacement_cc color doors category price currency country region postal_code detail_url " +
  "image_url co2 power_hp first_registration seller_name seller_type price_evaluation " +
  "is_damaged vin us_version_id match_confidence designation_facts first_seen_at last_seen_at " +
  "deleted_at created_at updated_at"
).split(" ");

const ESTIMATE_KEY = ["listing_id"];
const ESTIMATE_DATA = (
  "origin_price transport isv iuc legalization total_pt pt_estimated_price pt_sample_size " +
  "pt_confidence savings savings_pct verdict isv_table_year computed_at"
).split(" ");

// `stand_id` não vai: o publicador só trata das oportunidades GLOBAIS. As por stand,
// se existirem um dia, são dados de utilizador e vivem só no destino.
const OPPORTUNITY_KEY = ["listing_id"];
const OPPORTUNITY_DATA = "savings savings_pct flagged_at deleted_at".split(" ");

const MODEL_KEY = ["norm_key"];
const MODEL_DATA =
  "make model fuel displacement_cc co2 power_hp transmission created_at updated_at".split(" ");

const SOURCE_KEY = ["slug"];
const SOURCE_DATA = "name country kind active created_at updated_at".split(" ");

const US_MODEL_KEY = ["mid"];
const US_MODEL_DATA =
  "make model slug model_year url image_urls collected_at created_at updated_at".split(" ");

const US_VERSION_KEY = ["version_id"];
const US_VERSION_DATA = (
  "mid name url fuel_section year power_hp power_kw displacement_cc generation body doors seats " +
  "fuel engine_code cylinders torque_nm drivetrain gearbox co2_wltp co2_nedc emission_standard " +
  "curb_weight_kg image_url collected_at created_at updated_at"
).split(" ");

const OBSERVATION_COLS = "id model_id listing_id year km_band price source_site observed_at".split(
  " ",
);

/**
 * A montra, tal como o site a define (COM_CATALOGO + não apagado). Os left joins
 * trazem as dimensões que o mesmo conjunto arrasta; nenhum multiplica linhas (são
 * todos por chave primária). O `us_models` resolve-se como em lib/queries.ts —
 * pela versão exata OU pelo `mid` dos factos de designação: um anúncio cuja versão
 * tenha sido apagada do catálogo (`us_version_id` é `on delete set null`) continua
 * a precisar do modelo para ter nome e imagem.
 */
const MONTRA_FROM = `
  from listings l
  join import_cost_estimates e on e.listing_id = l.id
  join vehicle_models vm on vm.id = l.model_id
  left join sources s on s.id = l.source_id
  left join us_versions uv on uv.version_id = l.us_version_id
  left join us_models um on um.mid = coalesce(uv.mid, l.designation_facts->>'mid')
  where l.deleted_at is null
    and l.match_confidence = '${MONTRA_MATCH_CONFIDENCE}'
    and e.pt_confidence = '${MONTRA_PT_CONFIDENCE}'
`;

/** A mesma condição, para ler a montra do DESTINO (sem as dimensões). */
const MONTRA_WHERE = `
  from listings l
  join import_cost_estimates e on e.listing_id = l.id
  where l.deleted_at is null
    and l.match_confidence = '${MONTRA_MATCH_CONFIDENCE}'
    and e.pt_confidence = '${MONTRA_PT_CONFIDENCE}'
`;

const prefixed = (alias: string, cols: string[]) => cols.map((c) => `${alias}.${c}`).join(", ");
/** Chave natural de um anúncio como string, para casar origem com destino. O
 *  separador é NUL: nenhum dos dois campos o pode conter, portanto não há
 *  colisões (um espaço colidiria se um external_id trouxesse espaços). */
const natural = (site: unknown, ext: unknown) => `${String(site)}\u0000${String(ext)}`;

function chunks<T>(rows: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Upsert pela chave natural. O `where … is distinct from …` faz o UPDATE não
 * disparar quando a linha já está igual, portanto o `returning` conta exatamente
 * as linhas NOVAS OU ALTERADAS — correr duas vezes seguidas dá 0 à segunda. É
 * também o que torna a publicação diferencial sem guardar estado nenhum.
 */
async function upsert(
  sql: Tx,
  table: string,
  keyCols: string[],
  dataCols: string[],
  rows: Row[],
): Promise<number> {
  if (!rows.length) return 0;
  const all = [...keyCols, ...dataCols];
  const set = sql.unsafe(dataCols.map((c) => `${c} = excluded.${c}`).join(", "));
  const changed = sql.unsafe(
    `(${prefixed(table, dataCols)}) is distinct from (${prefixed("excluded", dataCols)})`,
  );
  const conflict = sql.unsafe(keyCols.join(", "));
  let n = 0;
  for (const batch of chunks(rows, 500)) {
    const done = await sql`
      insert into ${sql(table)} ${sql(batch, ...all)}
      on conflict (${conflict}) do update set ${set} where ${changed}
      returning 1
    `;
    n += done.length;
  }
  return n;
}

export interface PublishReport {
  /** anúncios do conjunto publicado (lido na origem) */
  montra: number;
  /** montra que o destino mostrava ANTES do ciclo */
  montraNoDestino: number;
  /** mortos NA ORIGEM (deleted_at verificado) → `deleted_at` no destino */
  softDeleted: number;
  /** vivos, mas fora da montra (perderam o `exato` ou a confiança `normal`) */
  demoted: number;
  /** no destino mas AUSENTES do corpus — o warehouse não sabe nada deles, logo
   *  não se lhes toca. Ver o comentário em `strays`. */
  unknownToSource: number;
  opportunitiesDeactivated: number;
  /** por tabela: linhas novas ou alteradas */
  written: Record<string, number>;
  applied: boolean;
}

export interface PublishOptions {
  /** origem (corpus). Omitido: `dbUrl()` — o warehouse. */
  sourceUrl?: string;
  /** destino (base da app). Omitido: `appDbUrl()`. */
  targetUrl?: string;
  /** false (default) = ensaio, com rollback no fim. */
  apply?: boolean;
  quiet?: boolean;
}

export async function publish(opts: PublishOptions = {}): Promise<PublishReport> {
  const sourceUrl = opts.sourceUrl ?? dbUrl();
  const targetUrl = opts.targetUrl ?? appDbUrl();
  const apply = opts.apply ?? false;
  const log = opts.quiet ? () => {} : (msg: string) => console.log(msg);

  if (!sourceUrl) throw new Error("Sem origem: define WAREHOUSE_URL (ver .env.example).");
  // O ensaio também abre transação de escrita — passa pela mesma guarda.
  assertWritable(targetUrl);
  if (sourceUrl === targetUrl) {
    throw new Error(
      "Origem e destino são a MESMA base de dados — não há nada para publicar. O corpus vive " +
        "no warehouse (WAREHOUSE_URL) e a montra na base da app (DATABASE_URL); ver .env.example.",
    );
  }

  const src = postgres(sourceUrl, { prepare: false });
  const tgt = postgres(targetUrl, { prepare: false });
  try {
    log(`publish: modo=${apply ? "APLICAR" : "DRY-RUN (rollback no fim)"}`);

    // ── Leitura (origem): o conjunto publicado e as dimensões que arrasta ──
    const listingRows = await src`
      select l.id as src_id, ${src.unsafe(prefixed("l", [...LISTING_KEY, ...LISTING_DATA]))}
      ${src.unsafe(MONTRA_FROM)}
    `;
    const estimateRows = await src`
      select l.id as src_listing_id, ${src.unsafe(prefixed("e", ESTIMATE_DATA))}
      ${src.unsafe(MONTRA_FROM)}
    `;
    const opportunityRows = await src`
      select o.listing_id as src_listing_id, ${src.unsafe(prefixed("o", OPPORTUNITY_DATA))}
      from opportunities o
      where o.deleted_at is null and o.stand_id is null
        and o.listing_id in (select l.id ${src.unsafe(MONTRA_FROM)})
    `;
    const modelRows = await src`
      select distinct vm.id as src_id, ${src.unsafe(prefixed("vm", [...MODEL_KEY, ...MODEL_DATA]))}
      ${src.unsafe(MONTRA_FROM)}
    `;
    // O `and` encadeia no `where` do MONTRA_FROM: as dimensões vêm por left join,
    // e uma linha sem fonte/versão/modelo de catálogo não tem nada para publicar.
    const sourceRows = await src`
      select distinct s.id as src_id, ${src.unsafe(prefixed("s", [...SOURCE_KEY, ...SOURCE_DATA]))}
      ${src.unsafe(MONTRA_FROM)} and s.id is not null
    `;
    const usModelRows = await src`
      select distinct ${src.unsafe(prefixed("um", [...US_MODEL_KEY, ...US_MODEL_DATA]))}
      ${src.unsafe(MONTRA_FROM)} and um.mid is not null
    `;
    const usVersionRows = await src`
      select distinct ${src.unsafe(prefixed("uv", [...US_VERSION_KEY, ...US_VERSION_DATA]))}
      ${src.unsafe(MONTRA_FROM)} and uv.version_id is not null
    `;

    // ── Leitura (destino): o que o site mostra HOJE, para reconciliar ──
    const targetMontra = await tgt`
      select l.id, l.source_site, l.external_id ${tgt.unsafe(MONTRA_WHERE)}
    `;
    const targetOpps = await tgt`
      select o.id, l.source_site, l.external_id
      from opportunities o
      join listings l on l.id = o.listing_id
      where o.deleted_at is null and o.stand_id is null
    `;

    // Quem está na montra do destino e já não está no conjunto a publicar. Só
    // estes é que o publicador reconcilia — o resto do destino (anúncios antigos
    // que ninguém mostra, favoritos de clientes) não é da sua conta.
    const publishedKeys = new Set(listingRows.map((r) => natural(r.source_site, r.external_id)));
    const strays = targetMontra.filter(
      (r) => !publishedKeys.has(natural(r.source_site, r.external_id)),
    );
    // Porque é que cada um saiu: morto, desaparecido, ou só despromovido.
    const strayState = strays.length
      ? await src`
          select l.source_site, l.external_id, l.match_confidence, e.pt_confidence,
                 (e.listing_id is not null) as has_estimate,
                 -- ::text dos dois lados: converter para Date e voltar a texto
                 -- misturava fuso local com UTC e deslocava a hora do óbito.
                 l.deleted_at::text as deleted_at
          from listings l
          left join import_cost_estimates e on e.listing_id = l.id
          where (l.source_site, l.external_id) in (
            select * from unnest(
              ${strays.map((r) => r.source_site as string)}::text[],
              ${strays.map((r) => r.external_id as string)}::text[]
            )
          )
        `
      : [];
    const stateByKey = new Map(strayState.map((r) => [natural(r.source_site, r.external_id), r]));

    const toSoftDelete: { id: string; deadAt: string | null }[] = [];
    const toDemote: { id: string; matchConfidence: string | null; ptConfidence: string | null }[] =
      [];
    const toDropEstimate: string[] = [];
    const unknownToSource: { id: string; source_site: string }[] = [];
    for (const s of strays) {
      const state = stateByKey.get(natural(s.source_site, s.external_id));
      if (!state) {
        // AUSENTE do corpus — e ausência NÃO é prova de morte. O warehouse é
        // carregado dos NDJSON que existirem, e pode nunca ter recolhido esta
        // fonte: em 27/07 tinha 2 anúncios do autoscout24.de contra 295 na
        // montra de produção (o `--full` desse site é o tier "mega", à parte).
        // Dá-los como mortos marcaria 295 carros vivos, vistos nesse mesmo dia,
        // como indisponíveis. A política do projeto já é esta: sumir do feed é
        // CANDIDATO a vendido, e quem confirma é o check ao URL
        // (check-gone/prune-stale), que grava `deleted_at` na origem — o ramo
        // seguinte. Aqui não se toca.
        unknownToSource.push({ id: s.id as string, source_site: s.source_site as string });
      } else if (state.deleted_at) {
        // Morto na origem: o check ao URL confirmou 404/410.
        toSoftDelete.push({ id: s.id as string, deadAt: state.deleted_at as string });
      } else {
        // Vivo, mas já não é montra: espelhar a razão em vez de o dar como morto —
        // marcar "indisponível" um carro que ainda está à venda seria mentira.
        toDemote.push({
          id: s.id as string,
          matchConfidence: (state.match_confidence as string | null) ?? null,
          ptConfidence: (state.pt_confidence as string | null) ?? null,
        });
        if (!state.has_estimate) toDropEstimate.push(s.id as string);
      }
    }

    // Oportunidades ativas no destino que já não são oportunidade ativa na origem
    // — mas SÓ as de anúncios que a origem conhece. Pelo mesmo motivo do
    // `unknownToSource`: se o corpus nunca recolheu aquela fonte, desativar
    // apagaria da montra oportunidades vivas (no caso real, 166 de 174).
    const keyBySrcId = new Map(
      listingRows.map((r) => [r.src_id, natural(r.source_site, r.external_id)]),
    );
    const activeOppKeys = new Set(opportunityRows.map((o) => keyBySrcId.get(o.src_listing_id)));
    const oppKnown = targetOpps.length
      ? await src`
          select l.source_site, l.external_id from listings l
          where (l.source_site, l.external_id) in (
            select * from unnest(
              ${targetOpps.map((o) => o.source_site as string)}::text[],
              ${targetOpps.map((o) => o.external_id as string)}::text[]
            )
          )
        `
      : [];
    const oppKnownKeys = new Set(oppKnown.map((r) => natural(r.source_site, r.external_id)));
    const oppsToDeactivate = targetOpps
      .filter((o) => oppKnownKeys.has(natural(o.source_site, o.external_id)))
      .filter((o) => !activeOppKeys.has(natural(o.source_site, o.external_id)))
      .map((o) => o.id as string);
    const oppsUnknown = targetOpps.length - oppKnownKeys.size;

    log(
      `publish: montra na origem ${listingRows.length} · montra no destino ` +
        `${targetMontra.length} (${strays.length} já não pertencem ao conjunto)`,
    );

    const written: Record<string, number> = {};
    const report: PublishReport = {
      montra: listingRows.length,
      montraNoDestino: targetMontra.length,
      softDeleted: 0,
      demoted: 0,
      unknownToSource: unknownToSource.length,
      opportunitiesDeactivated: 0,
      written,
      applied: apply,
    };

    // ── Escrita (destino), tudo numa transação ──
    const ROLLBACK = new Error("dry-run");
    try {
      await tgt.begin(async (tx) => {
        // 1. Primeiro o que SAI — nunca fica verde sobre carro morto.
        if (toSoftDelete.length) {
          const done = await tx`
            update listings l
            set deleted_at = coalesce(u.dead_at::timestamp, now()), updated_at = now()
            from unnest(
              ${toSoftDelete.map((s) => s.id)}::uuid[],
              ${toSoftDelete.map((s) => s.deadAt)}::text[]
            ) as u(id, dead_at)
            where l.id = u.id and l.deleted_at is null
            returning l.id
          `;
          report.softDeleted = done.length;
        }
        if (toDemote.length) {
          const byMatch = await tx`
            update listings l set match_confidence = u.mc, updated_at = now()
            from unnest(
              ${toDemote.map((d) => d.id)}::uuid[],
              ${toDemote.map((d) => d.matchConfidence)}::text[]
            ) as u(id, mc)
            where l.id = u.id and l.match_confidence is distinct from u.mc
            returning l.id
          `;
          // A outra metade da montra é a confiança da estimativa (`normal` →
          // `alargada`): sem isto o anúncio continuava na montra do destino.
          const byConfidence = await tx`
            update import_cost_estimates e set pt_confidence = u.pc
            from unnest(
              ${toDemote.map((d) => d.id)}::uuid[],
              ${toDemote.map((d) => d.ptConfidence)}::text[]
            ) as u(listing_id, pc)
            where e.listing_id = u.listing_id and u.pc is not null
              and e.pt_confidence is distinct from u.pc
            returning e.listing_id as id
          `;
          report.demoted = new Set([...byMatch, ...byConfidence].map((r) => r.id)).size;
        }
        if (toDropEstimate.length) {
          // O compute-costs apaga a estimativa de quem deixou de ser elegível
          // ("não deixar veredito órfão") — o destino segue-o.
          await tx`
            delete from import_cost_estimates where listing_id = any(${toDropEstimate}::uuid[])
          `;
        }
        if (oppsToDeactivate.length) {
          const done = await tx`
            update opportunities set deleted_at = now()
            where id = any(${oppsToDeactivate}::uuid[]) and deleted_at is null
            returning id
          `;
          report.opportunitiesDeactivated = done.length;
        }

        // 2. Dimensões com uuid próprio: upsert pela chave natural e leitura de
        //    volta do id REMOTO — o do destino é que manda.
        written.vehicle_models = await upsert(
          tx,
          "vehicle_models",
          MODEL_KEY,
          MODEL_DATA,
          modelRows.map((r) => ({ ...r })),
        );
        written.sources = await upsert(
          tx,
          "sources",
          SOURCE_KEY,
          SOURCE_DATA,
          sourceRows.map((r) => ({ ...r })),
        );
        const remoteModels = modelRows.length
          ? await tx`
              select id, norm_key from vehicle_models
              where norm_key = any(${modelRows.map((r) => r.norm_key as string)}::text[])
            `
          : [];
        const remoteSources = sourceRows.length
          ? await tx`
              select id, slug from sources
              where slug = any(${sourceRows.map((r) => r.slug as string)}::text[])
            `
          : [];
        const modelIdByNormKey = new Map(remoteModels.map((r) => [r.norm_key, r.id]));
        const sourceIdBySlug = new Map(remoteSources.map((r) => [r.slug, r.id]));
        const remoteModelId = new Map(
          modelRows.map((r) => [r.src_id, modelIdByNormKey.get(r.norm_key)]),
        );
        const remoteSourceId = new Map(
          sourceRows.map((r) => [r.src_id, sourceIdBySlug.get(r.slug)]),
        );

        // 3. Catálogo (chaves naturais do ultimatespecs — sem problema de uuid).
        //    Modelos antes das versões: `us_versions.mid` referencia `us_models`.
        written.us_models = await upsert(
          tx,
          "us_models",
          US_MODEL_KEY,
          US_MODEL_DATA,
          usModelRows.map((r) => ({ ...r })),
        );
        written.us_versions = await upsert(
          tx,
          "us_versions",
          US_VERSION_KEY,
          US_VERSION_DATA,
          usVersionRows.map((r) => ({ ...r })),
        );

        // 4. Anúncios, com as FKs já traduzidas para os ids do destino.
        written.listings = await upsert(
          tx,
          "listings",
          LISTING_KEY,
          LISTING_DATA,
          listingRows.map((r) => ({
            ...r,
            model_id: remoteModelId.get(r.model_id) ?? null,
            source_id: r.source_id == null ? null : (remoteSourceId.get(r.source_id) ?? null),
          })),
        );
        const remoteListings = listingRows.length
          ? await tx`
              select id, source_site, external_id from listings
              where (source_site, external_id) in (
                select * from unnest(
                  ${listingRows.map((r) => r.source_site as string)}::text[],
                  ${listingRows.map((r) => r.external_id as string)}::text[]
                )
              )
            `
          : [];
        const remoteIdByKey = new Map(
          remoteListings.map((r) => [natural(r.source_site, r.external_id), r.id as string]),
        );
        const remoteListingId = new Map(
          listingRows.map((r) => [
            r.src_id,
            remoteIdByKey.get(natural(r.source_site, r.external_id)),
          ]),
        );

        // 5. Estimativas e 6. oportunidades, já com o listing_id remoto.
        written.import_cost_estimates = await upsert(
          tx,
          "import_cost_estimates",
          ESTIMATE_KEY,
          ESTIMATE_DATA,
          estimateRows.map((r) => ({ ...r, listing_id: remoteListingId.get(r.src_listing_id) })),
        );
        written.opportunities = await upsert(
          tx,
          "opportunities",
          OPPORTUNITY_KEY,
          OPPORTUNITY_DATA,
          opportunityRows.map((r) => ({ ...r, listing_id: remoteListingId.get(r.src_listing_id) })),
        );

        // 7. Observações de preço PT dos modelos publicados — é o que alimenta o
        //    gráfico de 6 meses do detalhe (`ptPriceHistory`). Só a janela que o
        //    gráfico lê e só destes modelos: a tabela inteira cresce 1 linha por
        //    anúncio PT por dia (docs/08) e não cabe no destino. Vem por cursor
        //    (pode ser muita linha) e é idempotente pelo id da origem — aqui o id
        //    da observação atravessa, ao contrário do resto: nada lhe aponta e é
        //    ele que evita duplicar a linha na corrida seguinte. O `listing_id` só
        //    se traduz quando o anúncio PT também foi publicado; senão fica null —
        //    o gráfico não faz join, e a FK é `on delete set null`.
        //    ⚠️ Cursor pela forma `for await`: o postgres.js NÃO espera por uma
        //    callback assíncrona passada a `.cursor(n, fn)` — o insert ficaria a
        //    correr fora de horas e a contagem saía sempre 0.
        let observations = 0;
        if (modelRows.length) {
          const batches = src`
            select o.id, o.model_id, o.year, o.km_band, o.price, o.source_site, o.observed_at,
                   pl.source_site as pl_site, pl.external_id as pl_ext
            from pt_price_observations o
            left join listings pl on pl.id = o.listing_id
            where o.model_id = any(${modelRows.map((r) => r.src_id as string)}::uuid[])
              and o.observed_at > now() - interval '6 months'
          `.cursor(1000);
          for await (const batch of batches) {
            const rows: Row[] = batch.map((o) => ({
              id: o.id,
              model_id: remoteModelId.get(o.model_id) ?? null,
              listing_id:
                o.pl_site == null
                  ? null
                  : (remoteIdByKey.get(natural(o.pl_site, o.pl_ext)) ?? null),
              year: o.year,
              km_band: o.km_band,
              price: o.price,
              source_site: o.source_site,
              observed_at: o.observed_at,
            }));
            const done = await tx`
              insert into pt_price_observations ${tx(rows, ...OBSERVATION_COLS)}
              on conflict (id) do nothing
              returning 1
            `;
            observations += done.length;
          }
        }
        written.pt_price_observations = observations;

        if (!apply) throw ROLLBACK;
      });
    } catch (err) {
      if (err !== ROLLBACK) throw err;
    }

    const saem = `${report.softDeleted} soft-delete (mortos confirmados na origem)`;
    const caem = `${report.demoted} despromovidos (vivos, fora da montra)`;
    const opps = `${report.opportunitiesDeactivated} oportunidades desativadas`;
    log(`publish: ${saem} · ${caem} · ${opps}`);
    // Nunca em silêncio: se o corpus não cobre uma fonte, o publicador não faz
    // ideia do que lá se passa — dizer quantos e de onde é o que deixa isso à vista.
    if (report.unknownToSource) {
      const contagem = new Map<string, number>();
      for (const u of unknownToSource) {
        contagem.set(u.source_site, (contagem.get(u.source_site) ?? 0) + 1);
      }
      const porFonte = [...contagem]
        .sort((a, b) => b[1] - a[1])
        .map(([site, n]) => `${site} ${n}`)
        .join(" · ");
      log(
        `publish: ${report.unknownToSource} no destino AUSENTES do corpus — intocados ` +
          `(ausência não é morte; quem confirma é o check ao URL): ${porFonte}`,
      );
    }
    if (oppsUnknown > 0) {
      log(
        `publish: ${oppsUnknown} oportunidades no destino de anúncios fora do corpus — intocadas`,
      );
    }
    for (const [table, n] of Object.entries(written)) {
      log(`publish:   ${table.padEnd(22)} ${n} linhas novas ou alteradas`);
    }
    if (!apply) log("publish: DRY-RUN — nada foi gravado (--apply para publicar a sério)");
    return report;
  } finally {
    await src.end({ timeout: 5 });
    await tgt.end({ timeout: 5 });
  }
}

if (process.argv[1]?.endsWith("publish.ts")) {
  // O destino é a base da app. Carregar o .env.production.local ANTES do
  // .env.local é o que põe a Supabase na DATABASE_URL (o loadEnvFile não sobrepõe
  // o que já está definido) — ver o JSDoc de `appDbUrl` em lib/db-url.ts. Só aqui,
  // no arranque como comando: importar este módulo (testes) não carrega
  // credenciais de produção nenhumas.
  for (const file of [".env.production.local", ".env.local"]) {
    try {
      process.loadEnvFile(file);
    } catch {
      /* ausente: as variáveis vêm do ambiente */
    }
  }
  publish({ apply: process.argv.includes("--apply") })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error(err);
      process.exit(1);
    });
}
