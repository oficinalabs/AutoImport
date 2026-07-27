import { LandingCostBreakdown } from "@/components/landing/cost-breakdown";
import { OpportunityCard } from "@/components/landing/opportunity-card";
import { Button } from "@/components/ui/button";
import { getLandingData } from "@/lib/data";
import { formatEuro, formatNumber } from "@/lib/format";
import { CONDICOES } from "@/lib/legal";
import Link from "next/link";

/**
 * Landing pública. Os números são REAIS (vêm da base) — é o argumento todo: em
 * vez de prometer, mostra o que está a compensar agora.
 *
 * Cacheada 1 hora: é a primeira coisa que um stand vê, tem de abrir depressa, e
 * o pipeline só corre uma vez por dia — uma hora de desfasamento é invisível.
 */
export const revalidate = 3600;

const STEPS = [
  {
    n: "01",
    title: "Dizes o que procuras",
    body: "Marca, modelo, orçamento, quilómetros. Ou deixas em aberto e vês tudo o que compensa hoje.",
  },
  {
    n: "02",
    title: "Nós fazemos a conta",
    body: "Todos os dias recalculamos ISV, IUC, transporte e legalização de cada anúncio, e comparamos com o preço praticado em Portugal.",
  },
  {
    n: "03",
    title: "Contactas o vendedor",
    body: "Falas com o stand estrangeiro a partir da plataforma e acompanhas a compra até à matrícula portuguesa.",
  },
];

const LIMITS = [
  {
    title: "São estimativas, não orçamentos",
    body: "Usamos a tabela do ISV em vigor e valores de referência de transporte. O valor real pode variar algumas centenas de euros.",
  },
  {
    title: "Não substituímos a Alfândega",
    body: "Quem fixa o ISV é a Autoridade Tributária, na inspeção do veículo. A nossa conta serve para decidires se vale a pena avançar.",
  },
  {
    title: "Um anúncio pode já estar vendido",
    body: "Lemos os anúncios uma vez por dia. Marcamos a data da última verificação para saberes o que estás a ver.",
  },
];

export default async function LandingPage() {
  const {
    totalListings,
    activeOpportunities,
    medianSavings,
    bestSavings,
    lastSeenAt,
    featured,
    isvExample,
  } = await getLandingData();

  const atualizado = lastSeenAt
    ? new Date(lastSeenAt).toLocaleDateString("pt-PT", { day: "numeric", month: "long" })
    : null;

  const STATS = [
    { value: formatNumber(totalListings), label: "anúncios analisados" },
    { value: formatNumber(activeOpportunities), label: "compensam agora" },
    { value: formatEuro(medianSavings), label: "poupança mediana" },
    { value: "5", label: "países de origem" },
  ];

  return (
    <>
      {/* Hero — o número à frente */}
      <section className="mx-auto max-w-[1120px] px-4 pb-8 pt-10 sm:px-6 sm:pt-16">
        {atualizado && (
          <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-line bg-paper px-3 py-1 text-xs text-ink-soft">
            <span className="size-1.5 rounded-full bg-good ring-4 ring-good-soft" aria-hidden />
            Atualizado a {atualizado} · <span className="tnum">{formatNumber(totalListings)}</span>{" "}
            anúncios lidos
          </p>
        )}

        <h1 className="text-balance font-display text-[2.15rem] font-bold leading-[1.03] tracking-[-0.03em] sm:text-5xl lg:text-6xl">
          <span className="tnum text-amber">{formatNumber(activeOpportunities)} carros</span>{" "}
          compensam importar hoje.
        </h1>

        <p className="mt-4 max-w-[52ch] text-pretty text-base text-ink-soft sm:text-lg">
          Comparamos anúncios da Alemanha, França, Bélgica, Holanda e Espanha com o preço de mercado
          em Portugal — já com ISV, IUC, transporte e legalização na conta. Poupança mediana{" "}
          <strong className="tnum font-semibold text-ink">{formatEuro(medianSavings)}</strong> por
          carro; a melhor de hoje são{" "}
          <strong className="tnum font-semibold text-ink">{formatEuro(bestSavings)}</strong>.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-4">
          <Button asChild variant="primary" size="lg">
            <Link href="/registar">Começar — 1.º mês grátis</Link>
          </Button>
          <span className="text-sm text-steel">Sem cartão. Sem fidelização.</span>
        </div>

        <dl className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-line bg-line sm:grid-cols-4">
          {STATS.map((s) => (
            <div key={s.label} className="bg-paper px-4 py-4">
              <dt className="sr-only">{s.label}</dt>
              <dd className="tnum font-display text-2xl font-bold tracking-tight">{s.value}</dd>
              <p className="mt-0.5 text-xs text-ink-soft">{s.label}</p>
            </div>
          ))}
        </dl>
      </section>

      {/* A conta do ISV — a peça central */}
      {isvExample && (
        <section id="como-funciona" className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-11">
          <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
            A conta que ninguém quer fazer
          </h2>
          <p className="mb-5 mt-1.5 max-w-[60ch] text-ink-soft">
            Este é um carro que está à venda agora. Abre o ISV para veres de onde vem o valor.
          </p>
          <LandingCostBreakdown car={isvExample} />
        </section>
      )}

      {/* Oportunidades reais */}
      {featured.length > 0 && (
        <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-11">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-3">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
              Alguns dos <span className="tnum">{formatNumber(activeOpportunities)}</span> de hoje
            </h2>
            <p className="text-sm text-steel">
              Verificados na última leitura · podem já ter sido vendidos
            </p>
          </div>
          <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
            {featured.map((car) => (
              <li key={car.id}>
                <OpportunityCard car={car} />
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Como funciona */}
      <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-11">
        <h2 className="mb-5 font-display text-2xl font-bold tracking-[-0.02em] sm:text-3xl">
          Como funciona
        </h2>
        <ol className="grid gap-3.5 sm:grid-cols-3">
          {STEPS.map((step) => (
            <li key={step.n} className="rounded-[10px] border border-line bg-paper p-5">
              <span className="tnum text-sm font-semibold text-amber">{step.n}</span>
              <h3 className="mb-1.5 mt-2 font-display text-[1.05rem] font-semibold">
                {step.title}
              </h3>
              <p className="text-[0.95rem] leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* O que isto não faz — de propósito ANTES do preço: quem lê os limites e
          mesmo assim chega ao botão, chega convencido. */}
      <section className="mx-auto max-w-[1120px] px-4 py-8 sm:px-6 sm:py-11">
        <div className="rounded-[10px] border border-line-strong bg-paper p-5 sm:p-8">
          <h2 className="font-display text-xl font-bold tracking-[-0.02em] sm:text-[1.6rem]">
            O que isto <span className="text-amber">não</span> faz
          </h2>
          <p className="mb-5 mt-1.5 max-w-[60ch] text-ink-soft">
            Preferimos dizer-te já do que no dia em que fores levantar o carro.
          </p>
          <ul className="grid gap-px overflow-hidden rounded-[8px] border border-line bg-line sm:grid-cols-3">
            {LIMITS.map((l) => (
              <li key={l.title} className="bg-paper p-4">
                <h3 className="mb-1.5 font-display text-[0.95rem] font-semibold">{l.title}</h3>
                <p className="text-sm leading-relaxed text-ink-soft">{l.body}</p>
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-ink-soft">
            Mais dúvidas?{" "}
            <Link href="/ajuda" className="text-amber underline underline-offset-2">
              As perguntas que os stands fazem mesmo
            </Link>
            .
          </p>
        </div>
      </section>

      {/* Preço + CTA final */}
      <section id="preco" className="mx-auto max-w-[1120px] px-4 py-8 pb-14 sm:px-6 sm:py-11">
        <div className="grid items-center gap-6 rounded-[10px] bg-petrol p-6 text-white sm:grid-cols-2 sm:gap-8 sm:p-10">
          <div>
            <h2 className="text-balance font-display text-2xl font-bold tracking-[-0.02em] sm:text-[2.1rem]">
              <span className="tnum">{CONDICOES.precoMensalEuros} €</span> por mês. O primeiro é
              grátis.
            </h2>
            <p className="mt-2.5 max-w-[44ch] text-white/75">
              Sem cartão para experimentar, sem fidelização, cancelas quando quiseres.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/registar">Começar — 1.º mês grátis</Link>
            </Button>
            <span className="text-center text-sm text-white/65">
              Um preço só. Toda a equipa do stand incluída.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
