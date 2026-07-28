"use client";

import { country } from "@/lib/countries";
import { formatEuro, formatKm } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useState } from "react";

/**
 * A peça central da landing: a conta do ISV sobre um anúncio REAL.
 *
 * ── A HISTÓRIA QUE ISTO CONTA (a versão anterior não a contava) ──────
 * São duas perguntas seguidas, e a coluna de cada uma responde a uma:
 *
 *   1. O QUE PAGAS   — o preço do anúncio NÃO é o preço final. Há mais uma
 *                      fatia por cima, e esse número (a diferença) é o que o
 *                      stand quer mesmo saber.
 *   2. O QUE VALE     — comparado com o que o mesmo carro custa cá.
 *
 * Três defeitos da versão anterior, corrigidos aqui:
 *
 *   ☠️ O IUC e a legalização estavam DENTRO do dobrável do ISV. Não são ISV —
 *      são custos irmãos. Quem abrisse ficava a achar que o ISV incluía o IUC.
 *   ☠️ As três linhas do ISV (cilindrada, CO₂, anos de uso) não têm valores em
 *      euros e apareciam como itens de uma soma — pareciam parcelas vazias.
 *      São ENTRADAS do cálculo, não parcelas; agora estão rotuladas como tal.
 *   ☠️ O custo final aparecia duas vezes (no fim da soma e outra vez como
 *      barra na comparação). Agora só a comparação o repete, e de propósito:
 *      é o termo do confronto.
 *
 * A barra empilhada é o que torna isto imediato — vê-se de relance o peso de
 * cada parcela sem ler um número. Os quadradinhos de cor nas linhas ligam a
 * lista à barra.
 *
 * ⚠️ Cores fixas em vez dos tokens do tema: a landing é escura SEMPRE, não
 * segue o tema do utilizador. Um `bg-surface` aqui dava texto escuro sobre
 * fundo escuro a quem tem o tema claro.
 */

/** Uma parcela do custo. `cor` liga a linha ao segmento da barra empilhada. */
interface Parcela {
  chave: string;
  rotulo: string;
  valor: number;
  cor: string;
  destaque?: boolean;
}

export function LandingCostBreakdown({ car }: { car: Listing }) {
  const [aberto, setAberto] = useState(false);
  const c = country(car.country);
  const { cost, ptMarket } = car;

  const extras = cost.totalPt - cost.originPrice;
  const parcelas: Parcela[] = [
    {
      chave: "origem",
      rotulo: `Preço no anúncio · ${c.name}`,
      valor: cost.originPrice,
      cor: "bg-white/30",
    },
    {
      chave: "transporte",
      rotulo: "Transporte até PT",
      valor: cost.transport,
      cor: "bg-sky-400/60",
    },
    { chave: "isv", rotulo: "ISV", valor: cost.isv, cor: "bg-amber-400", destaque: true },
    { chave: "iuc", rotulo: "IUC (1.º ano)", valor: cost.iuc, cor: "bg-violet-400/60" },
    {
      chave: "legalizacao",
      rotulo: "Legalização",
      valor: cost.legalization,
      cor: "bg-rose-400/50",
    },
  ];

  // Comparação: o mercado é a referência e leva a barra cheia; o nosso custo
  // fica visivelmente mais curto. Ao contrário lia-se pior.
  const referencia = Math.max(cost.totalPt, ptMarket.estimatedPrice) || 1;

  return (
    <div className="overflow-hidden rounded-[18px] border border-white/10 bg-[linear-gradient(160deg,rgba(255,255,255,.07),rgba(255,255,255,.02))]">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 border-b border-white/10 px-5 py-4 sm:px-7">
        <span aria-hidden className="text-lg">
          {c.flag}
        </span>
        <h3 className="font-display text-lg font-bold tracking-tight text-white sm:text-xl">
          {car.title}
        </h3>
        <p className="tnum text-xs uppercase tracking-[0.1em] text-white/45">
          {car.year} · {formatKm(car.km)}
          {car.model.powerHp ? ` · ${car.model.powerHp} cv` : ""}
        </p>
        <p className="ml-auto text-[10px] uppercase tracking-[0.18em] text-white/35">
          Anúncio em {c.name}
        </p>
      </div>

      <div className="grid lg:grid-cols-[1.15fr_1fr]">
        {/* ── 1. O QUE PAGAS ───────────────────────────────────── */}
        <div className="p-5 sm:p-7 lg:border-r lg:border-white/10">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
            1 · O que pagas
          </p>

          {/* Barra empilhada: o peso de cada parcela, sem ler um número. */}
          <div
            className="flex h-2.5 w-full overflow-hidden rounded-full bg-white/10"
            role="img"
            aria-label={`Composição do custo: ${parcelas
              .map((p) => `${p.rotulo}, ${formatEuro(p.valor)}`)
              .join("; ")}`}
          >
            {parcelas.map((p) => (
              <span
                key={p.chave}
                className={p.cor}
                style={{ width: `${(p.valor / cost.totalPt) * 100}%` }}
              />
            ))}
          </div>

          <dl className="mt-5">
            {parcelas.map((p) =>
              p.destaque ? (
                <div key={p.chave}>
                  <button
                    type="button"
                    onClick={() => setAberto((a) => !a)}
                    aria-expanded={aberto}
                    className="flex w-full items-center gap-3 border-b border-white/[0.08] py-3 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span className={cn("size-2.5 shrink-0 rounded-[3px]", p.cor)} aria-hidden />
                    <span className="flex items-center gap-1.5 text-sm font-semibold text-amber-300">
                      {p.rotulo}
                      <ChevronDown
                        className={cn("size-3.5 transition-transform", aberto && "rotate-180")}
                        aria-hidden
                      />
                    </span>
                    <span className="ml-auto tnum text-[15px] font-bold text-amber-300">
                      {formatEuro(p.valor)}
                    </span>
                  </button>

                  {aberto && (
                    <div className="border-b border-white/[0.08] bg-black/25 px-3 py-3">
                      {/* ⚠️ "O que entra no cálculo", não uma soma. Estes três
                          não têm valor em euros — são as ENTRADAS da fórmula.
                          Antes apareciam como linhas de uma lista de custos e
                          liam-se como parcelas a zero. */}
                      <p className="mb-2 text-[10px] uppercase tracking-[0.18em] text-white/35">
                        O que entra no cálculo
                      </p>
                      <ul className="flex flex-wrap gap-1.5">
                        {car.model.displacementCc && (
                          <Entrada>Cilindrada {car.model.displacementCc} cm³</Entrada>
                        )}
                        {car.model.co2 !== undefined && <Entrada>CO₂ {car.model.co2} g/km</Entrada>}
                        <Entrada>{idade(car.year)} de uso</Entrada>
                      </ul>
                      <p className="mt-3 text-[11px] leading-relaxed text-white/40">
                        Tabela de {new Date().getFullYear()}: componente de cilindrada + componente
                        ambiental, com redução pelos anos de uso. Estimativa — quem fixa o valor é a
                        Alfândega.
                      </p>
                    </div>
                  )}
                </div>
              ) : (
                <div
                  key={p.chave}
                  className="flex items-center gap-3 border-b border-white/[0.08] py-3"
                >
                  <span className={cn("size-2.5 shrink-0 rounded-[3px]", p.cor)} aria-hidden />
                  <dt className="text-sm text-white/55">{p.rotulo}</dt>
                  <dd className="ml-auto tnum text-[15px] font-medium text-white">
                    {formatEuro(p.valor)}
                  </dd>
                </div>
              ),
            )}
          </dl>

          {/* O número que o stand quer mesmo: quanto é que o anúncio esconde. */}
          <div className="mt-5 rounded-[14px] border border-amber-400/25 bg-amber-400/[0.09] px-4 py-3.5">
            <p className="tnum font-display text-xl font-bold text-amber-300">
              + {formatEuro(extras)}
            </p>
            <p className="mt-0.5 text-[12px] text-white/50">
              é o que não está no preço do anúncio —{" "}
              <span className="tnum">{Math.round((extras / cost.originPrice) * 100)}%</span> por
              cima
            </p>
          </div>

          <div className="mt-5 flex items-baseline justify-between gap-4 border-t border-white/20 pt-5">
            <span className="text-sm font-semibold text-white">Custo final em Portugal</span>
            <span className="tnum font-display text-3xl font-bold tracking-[-0.03em] text-white">
              {formatEuro(cost.totalPt)}
            </span>
          </div>
        </div>

        {/* ── 2. O QUE VALE AQUI ───────────────────────────────── */}
        <div className="flex flex-col gap-6 p-5 sm:p-7">
          <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/35">
            2 · O que vale aqui
          </p>

          <Barra
            rotulo="À venda em Portugal"
            valor={formatEuro(ptMarket.estimatedPrice)}
            pct={(ptMarket.estimatedPrice / referencia) * 100}
          />
          <Barra
            rotulo="A ti fica em"
            valor={formatEuro(cost.totalPt)}
            pct={(cost.totalPt / referencia) * 100}
            forte
          />

          <div className="mt-auto rounded-[14px] border border-emerald-400/25 bg-emerald-400/[0.09] p-5">
            <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
              Poupança estimada
            </p>
            <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
              <span className="tnum font-display text-4xl font-bold leading-none tracking-[-0.035em] text-emerald-300">
                {formatEuro(car.savings)}
              </span>
              {/* Arredondado: o `savingsPct` vem da base com decimal (−16.8%) e
                  uma casa decimal ao lado de 3567 € e 21 240 € lê-se como
                  precisão a fingir — a estimativa não é precisa a 0,1%. */}
              <span className="tnum text-sm font-semibold text-emerald-300/70">
                −{Math.round(car.savingsPct)}%
              </span>
            </p>
            <p className="mt-2.5 text-[13px] leading-relaxed text-white/50">
              contra a mediana de <span className="tnum">{ptMarket.sampleSize}</span> anúncios
              portugueses do mesmo modelo e ano.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Entrada da fórmula do ISV — um facto do carro, não uma parcela em euros. */
function Entrada({ children }: { children: React.ReactNode }) {
  return (
    <li className="tnum rounded-full bg-white/[0.07] px-2.5 py-1 text-[11px] text-white/60">
      {children}
    </li>
  );
}

function idade(year: number): string {
  const anos = new Date().getFullYear() - year;
  return anos <= 0 ? "Novo" : anos === 1 ? "1 ano" : `${anos} anos`;
}

/** `forte` marca o nosso valor; o outro é a referência do mercado. */
function Barra({
  rotulo,
  valor,
  pct,
  forte,
}: {
  rotulo: string;
  valor: string;
  pct: number;
  forte?: boolean;
}) {
  return (
    <div>
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <span className="text-[13px] text-white/55">{rotulo}</span>
        <span
          className={cn(
            "tnum font-semibold",
            forte ? "text-lg text-white" : "text-[15px] text-white/60",
          )}
        >
          {valor}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/10">
        <div
          className={cn(
            "h-full rounded-full",
            forte ? "bg-[linear-gradient(90deg,#34d399,#10b981)]" : "bg-white/25",
          )}
          style={{ width: `${Math.max(4, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}
