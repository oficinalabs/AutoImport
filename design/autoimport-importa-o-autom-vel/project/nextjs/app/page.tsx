import Link from "next/link";
import { CostBreakdown } from "@/components/landing/cost-breakdown";
import { OpportunityCard } from "@/components/landing/opportunity-card";
import { OPPORTUNITIES, STATS, STEPS, LIMITS } from "@/components/landing/data";

export default function LandingPage() {
  return (
    <main className="bg-surface text-ink">
      {/* Hero */}
      <section className="mx-auto max-w-6xl px-4 pt-10 pb-8 sm:px-8 sm:pt-16 lg:pt-20">
        <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-soft">
          <span className="size-1.5 rounded-full bg-good ring-4 ring-good-soft" />
          Atualizado hoje às 07:40 · <span className="tnum">27 000</span> anúncios lidos
        </p>

        <h1 className="text-balance font-archivo text-[2.15rem] leading-[1.03] font-bold tracking-[-0.03em] sm:text-5xl lg:text-6xl">
          <span className="tnum text-amber">174 carros</span> compensam importar hoje.
        </h1>

        <p className="mt-4 max-w-[52ch] text-pretty text-base text-ink-soft sm:text-lg">
          Comparamos anúncios da Alemanha, França, Bélgica, Holanda e Espanha com o preço de
          mercado em Portugal — já com ISV, transporte e legalização na conta. Poupança mediana{" "}
          <strong className="tnum font-semibold text-ink">2 850 €</strong> por carro; a melhor de
          hoje são <strong className="tnum font-semibold text-ink">11 745 €</strong>.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Link
            href="/registo"
            className="inline-flex h-12 items-center rounded-md bg-petrol px-6 font-archivo text-base font-semibold text-white transition hover:brightness-110"
          >
            Começar — 1.º mês grátis
          </Link>
          <span className="text-sm text-steel">Sem cartão. Sem fidelização.</span>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-4 lg:mt-11">
          {STATS.map((s) => (
            <div key={s.label} className="bg-paper px-4 py-4">
              <dt className="sr-only">{s.label}</dt>
              <dd className="tnum font-archivo text-2xl font-bold tracking-tight">{s.value}</dd>
              <p className="mt-0.5 text-xs text-ink-soft">{s.label}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* A conta do ISV — peça central */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-11">
        <h2 className="font-archivo text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
          A conta que ninguém quer fazer
        </h2>
        <p className="mt-1.5 mb-5 max-w-[60ch] text-ink-soft">
          Este é um carro que está à venda agora. Abre o ISV para veres de onde vem o valor.
        </p>
        <CostBreakdown />
      </section>

      {/* Oportunidades reais */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-11">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
          <h2 className="font-archivo text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
            Quatro dos <span className="tnum">174</span> de hoje
          </h2>
          <p className="text-sm text-steel">
            Preços verificados às 07:40 · podem já ter sido vendidos
          </p>
        </div>
        <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
          {OPPORTUNITIES.map((car) => (
            <li key={car.id}>
              <OpportunityCard car={car} />
            </li>
          ))}
        </ul>
      </section>

      {/* Como funciona */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-11">
        <h2 className="mb-5 font-archivo text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
          Como funciona
        </h2>
        <ol className="grid gap-3.5 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-md border border-line bg-paper p-5">
              <span className="tnum font-mono text-sm font-semibold text-amber">{step.n}</span>
              <h3 className="mt-2 mb-1.5 font-archivo text-[1.05rem] font-semibold">{step.title}</h3>
              <p className="text-[0.95rem] leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Honestidade */}
      <section className="mx-auto max-w-6xl px-4 py-8 sm:px-8 sm:py-11">
        <div className="rounded-md border border-line-strong bg-paper p-5 sm:p-8">
          <h2 className="font-archivo text-xl font-bold tracking-[-0.02em] sm:text-[1.6rem]">
            O que isto <span className="text-amber">não</span> faz
          </h2>
          <p className="mt-1.5 mb-5 max-w-[60ch] text-ink-soft">
            Preferimos dizer-te já do que no dia em que fores levantar o carro.
          </p>
          <ul className="grid gap-px overflow-hidden rounded-md border border-line bg-line sm:grid-cols-3">
            {LIMITS.map((l) => (
              <li key={l.title} className="bg-paper p-4.5">
                <h3 className="mb-1.5 font-archivo text-[0.95rem] font-semibold">{l.title}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">{l.body}</p>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {/* Preço + CTA final */}
      <section id="comecar" className="mx-auto max-w-6xl px-4 py-8 pb-14 sm:px-8 sm:py-11 sm:pb-24">
        <div className="grid items-center gap-6 rounded-md bg-petrol p-6 text-white sm:grid-cols-2 sm:gap-8 sm:p-10">
          <div>
            <h2 className="text-balance font-archivo text-2xl font-bold tracking-[-0.02em] sm:text-[2.1rem]">
              <span className="tnum">100 €</span> por mês. O primeiro é grátis.
            </h2>
            <p className="mt-2.5 max-w-[44ch] text-white/75">
              Sem cartão para experimentar, sem fidelização, cancelas quando quiseres. Se num mês
              não encontrares um carro que compense, não pagas o seguinte.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Link
              href="/registo"
              className="inline-flex h-[3.25rem] items-center justify-center rounded-md bg-amber px-6 font-archivo text-base font-bold text-[#1A1305] transition hover:brightness-105"
            >
              Começar — 1.º mês grátis
            </Link>
            <span className="text-center text-sm text-white/65">
              Um preço só. Utilizadores ilimitados no stand.
            </span>
          </div>
        </div>
      </section>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3 px-4 py-6 sm:px-8">
          <span className="font-archivo font-bold">AutoImport</span>
          <p className="max-w-[60ch] text-xs text-steel">
            Todos os valores são estimativas com base em anúncios públicos e na tabela do ISV de
            2026. Não substituem a avaliação da Alfândega.
          </p>
        </div>
      </footer>
    </main>
  );
}
