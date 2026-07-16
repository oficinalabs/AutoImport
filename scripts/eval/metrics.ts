/**
 * Métricas de saúde do pipeline — módulo puro: dado o `db` devolve um snapshot
 * determinístico do estado da BD (sem mutar nada). O snapshot serve de baseline
 * para comparar fases do "matching perfeito": chaves ordenadas e percentagens
 * arredondadas a 1 casa para que os diffs entre baselines sejam limpos.
 *
 * A classificação de estimativas (calculadas/semDados/semAmostra) espelha a
 * elegibilidade do scripts/pipeline/compute-costs.ts — assume que o
 * compute-costs correu até ao fim (todo o elegível com dados+amostra tem
 * estimativa), pelo que reconstrói as categorias a partir do estado da BD.
 */
import { sql } from "drizzle-orm";
import type { db as Db } from "../../db";

// Países de origem considerados importáveis (igual a compute-costs.ts).
const FOREIGN = ["DE", "FR", "BE", "NL", "ES"];
// Janela da amostra PT (igual a lib/engine/pt-market.ts) — observações fora
// dela não entram na estimativa, logo não contam para a saúde da amostra.
const WINDOW_DAYS = 60;

export interface SourceMetrics {
  ativos: number;
  pctModelId: number;
  pctPowerHp: number;
  pctDisplacementCc: number;
  pctCo2: number;
  pctVariant: number;
  /** matching de versão (Fase 3): % de ativos com versão confirmada / provável */
  pctVersaoConfirmado: number;
  pctVersaoProvavel: number;
}

export interface Snapshot {
  porFonte: Record<string, SourceMetrics>;
  global: {
    taxaMatch: number;
    vehicleModels: number;
    /** matching de versão (Fase 3): ativos por tier do resolver estrito */
    versao: { confirmado: number; provavel: number; semMatch: number };
    estimativas: { total: number; calculadas: number; semDados: number; semAmostra: number };
    vereditos: Record<string, number>;
    oportunidadesAtivas: number;
    amostraPt: { observacoes: number; comPotencia: number; semPotencia: number };
  };
  naoMapeados: { make: string | null; model: string | null; fuel: string | null; n: number }[];
}

/** Percentagem arredondada a 1 casa; 0 quando não há denominador. */
function pct(n: number, d: number): number {
  return d > 0 ? Math.round((n / d) * 1000) / 10 : 0;
}

export async function computeSnapshot(db: typeof Db): Promise<Snapshot> {
  const perSource = (await db.execute(sql`
    select source_site,
      count(*) filter (where deleted_at is null) as ativos,
      count(*) filter (where deleted_at is null and model_id is not null) as com_model,
      count(*) filter (where deleted_at is null and power_hp is not null) as com_power,
      count(*) filter (where deleted_at is null and displacement_cc is not null) as com_cc,
      count(*) filter (where deleted_at is null and co2 is not null) as com_co2,
      count(*) filter (where deleted_at is null and variant is not null) as com_variant,
      count(*) filter (where deleted_at is null and match_confidence = 'confirmado') as com_confirmado,
      count(*) filter (where deleted_at is null and match_confidence = 'provavel') as com_provavel
    from listings
    group by source_site
    having count(*) filter (where deleted_at is null) > 0
    order by source_site
  `)) as unknown as {
    source_site: string;
    ativos: number;
    com_model: number;
    com_power: number;
    com_cc: number;
    com_co2: number;
    com_variant: number;
    com_confirmado: number;
    com_provavel: number;
  }[];

  const porFonte: Record<string, SourceMetrics> = {};
  for (const r of perSource) {
    porFonte[r.source_site] = {
      ativos: Number(r.ativos),
      pctModelId: pct(Number(r.com_model), Number(r.ativos)),
      pctPowerHp: pct(Number(r.com_power), Number(r.ativos)),
      pctDisplacementCc: pct(Number(r.com_cc), Number(r.ativos)),
      pctCo2: pct(Number(r.com_co2), Number(r.ativos)),
      pctVariant: pct(Number(r.com_variant), Number(r.ativos)),
      pctVersaoConfirmado: pct(Number(r.com_confirmado), Number(r.ativos)),
      pctVersaoProvavel: pct(Number(r.com_provavel), Number(r.ativos)),
    };
  }

  const [tot] = (await db.execute(sql`
    select
      count(*) filter (where deleted_at is null) as ativos,
      count(*) filter (where deleted_at is null and model_id is not null) as com_model
    from listings
  `)) as unknown as { ativos: number; com_model: number }[];

  const [vm] = (await db.execute(sql`
    select count(*) as n from vehicle_models
  `)) as unknown as { n: number }[];

  // Matching de versão: ativos por tier do resolver estrito (Fase 3).
  const [ver] = (await db.execute(sql`
    select
      count(*) filter (where match_confidence = 'confirmado') as confirmado,
      count(*) filter (where match_confidence = 'provavel') as provavel,
      count(*) filter (where match_confidence is null) as sem_match
    from listings where deleted_at is null
  `)) as unknown as { confirmado: number; provavel: number; sem_match: number }[];

  // Estimativas: espelha a elegibilidade de compute-costs.ts.
  const [est] = (await db.execute(sql`
    with eligible as (
      select l.fuel, l.displacement_cc as cc, l.co2, l.power_hp,
             (e.id is not null) as tem_estimativa
      from listings l
      join vehicle_models m on m.id = l.model_id
      left join import_cost_estimates e on e.listing_id = l.id
      where l.country = any(${`{${FOREIGN.join(",")}}`}::text[])
        and l.deleted_at is null
        and l.is_damaged is not true
        and l.detail_url not like '%/leilao/%'
        and l.price is not null and l.year is not null
        and l.km is not null and l.fuel is not null
    )
    select
      count(*) as total,
      count(*) filter (where tem_estimativa) as calculadas,
      count(*) filter (where not tem_estimativa
        and ((fuel <> 'elétrico' and (cc is null or co2 is null)) or power_hp is null)) as sem_dados,
      count(*) filter (where not tem_estimativa
        and not ((fuel <> 'elétrico' and (cc is null or co2 is null)) or power_hp is null)) as sem_amostra
    from eligible
  `)) as unknown as {
    total: number;
    calculadas: number;
    sem_dados: number;
    sem_amostra: number;
  }[];

  const verdictRows = (await db.execute(sql`
    select verdict, count(*) as n from import_cost_estimates group by verdict order by verdict
  `)) as unknown as { verdict: string; n: number }[];
  const vereditos: Record<string, number> = {};
  for (const v of verdictRows) vereditos[v.verdict] = Number(v.n);

  const [opps] = (await db.execute(sql`
    select count(*) as n from opportunities where deleted_at is null
  `)) as unknown as { n: number }[];

  // Amostra PT: observações na janela usada pela estimativa, partidas pela
  // presença de potência no anúncio (matching estrito exclui as sem potência).
  const [amostra] = (await db.execute(sql`
    select
      count(*) as total,
      count(*) filter (where l.power_hp is not null) as com_power,
      count(*) filter (where l.power_hp is null) as sem_power
    from pt_price_observations o
    join listings l on l.id = o.listing_id
    where o.observed_at > now() - make_interval(days => ${WINDOW_DAYS})
  `)) as unknown as { total: number; com_power: number; sem_power: number }[];

  const naoMapeados = (await db.execute(sql`
    select make_raw as make, model_raw as model, fuel_raw as fuel, count(*) as n
    from listings
    where deleted_at is null and model_id is null
    group by make_raw, model_raw, fuel_raw
    order by n desc, make_raw, model_raw, fuel_raw
    limit 20
  `)) as unknown as { make: string | null; model: string | null; fuel: string | null; n: number }[];

  return {
    porFonte,
    global: {
      taxaMatch: pct(Number(tot.com_model), Number(tot.ativos)),
      vehicleModels: Number(vm.n),
      versao: {
        confirmado: Number(ver.confirmado),
        provavel: Number(ver.provavel),
        semMatch: Number(ver.sem_match),
      },
      estimativas: {
        total: Number(est.total),
        calculadas: Number(est.calculadas),
        semDados: Number(est.sem_dados),
        semAmostra: Number(est.sem_amostra),
      },
      vereditos,
      oportunidadesAtivas: Number(opps.n),
      amostraPt: {
        observacoes: Number(amostra.total),
        comPotencia: Number(amostra.com_power),
        semPotencia: Number(amostra.sem_power),
      },
    },
    naoMapeados: naoMapeados.map((r) => ({
      make: r.make,
      model: r.model,
      fuel: r.fuel,
      n: Number(r.n),
    })),
  };
}
