import { LandingCostBreakdown } from "@/components/landing/cost-breakdown";
import { OpportunityCard } from "@/components/landing/opportunity-card";
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
 *
 * ── A PÁGINA É ESCURA SEMPRE ────────────────────────────────────────
 * Não segue o tema claro/escuro do utilizador: é uma peça de marca, como uma
 * capa. Por isso as cores aqui são LITERAIS (`text-white/55`, `bg-white/[0.04]`)
 * e não tokens (`text-ink-soft`, `bg-surface`) — um token daria texto escuro
 * sobre fundo escuro a quem tem o tema claro. É a exceção; o resto da app usa
 * tokens e deve continuar a usar.
 *
 * ── COMPOSIÇÃO (não mexer sem perceber isto) ────────────────────────
 * Uma página toda escura corre o risco de ficar plana — foi exatamente o defeito
 * da 1.ª versão desta landing (5 de 6 secções com o mesmo padding, um só fundo,
 * um só tamanho de h2). Aqui a variação é deliberada e mede-se:
 *
 *   respiro   100svh · 96 · 64 · 56 · 80 px      (nunca dois iguais)
 *   fundo     #08090b · #0d0f13 · #08090b · #0b0d11 · ÂMBAR
 *   h1/h2     ~138 · 44 · 32 · 22 · 40 px
 *   largura   1120, exceto a fila de oportunidades, que sangra
 *
 * A banda do preço é âmbar de propósito: num ecrã escuro do princípio ao fim,
 * o único momento claro tem de ser onde se pede a decisão. É a inversão que
 * faz o fim da página soar diferente do resto sem mudar de linguagem.
 */
export const revalidate = 3600;

const STEPS = [
  {
    n: "Dizes o que procuras",
    body: "Marca, modelo, orçamento, quilómetros. Ou deixas em aberto e vês tudo o que compensa hoje.",
  },
  {
    n: "Nós fazemos a conta",
    body: "Todos os dias recalculamos ISV, IUC, transporte e legalização de cada anúncio, e comparamos com o preço praticado em Portugal.",
  },
  {
    n: "Contactas o vendedor",
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

/** Alinha o 1.º cartão da fila com a coluna de 1120 e deixa os outros correr até
 *  ao bordo do ecrã. É o único sítio onde a página sangra — de propósito: a
 *  fila cortada diz "há mais" melhor do que qualquer legenda. */
const BLEED_PAD = "px-[max(1rem,calc((100vw-1120px)/2))]";

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
    { value: formatEuro(bestSavings), label: "a melhor de hoje" },
  ];

  return (
    <div className="bg-[#08090b] text-white">
      {/* ══ 1. HERO ══ vídeo, 100svh, o número a ocupar o ecrã ══════ */}
      <section
        data-hero="escuro"
        className="relative -mt-14 flex min-h-[100svh] flex-col overflow-hidden px-4 pt-14 sm:px-6"
      >
        {/* `-mt-14`+`pt-14`: o hero desliza para debaixo do cabeçalho sticky
            (h-14) e o conteúdo desce outra vez — o vídeo começa no topo do ecrã
            em vez de abaixo de uma barra. */}
        <video
          className="absolute inset-0 size-full object-cover"
          autoPlay
          muted
          loop
          playsInline
          preload="metadata"
          poster="/video/hero-camiao-poster.jpg"
          aria-hidden
        >
          <source src="/video/hero-camiao.mp4" type="video/mp4" />
        </video>
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(102deg,rgba(8,9,11,.93)_0%,rgba(8,9,11,.78)_38%,rgba(8,9,11,.4)_70%,rgba(8,9,11,.74)_100%)]"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center py-14 sm:py-20">
          {atualizado && (
            /* Sem `flex`: com `tracking` largo e duas linhas em mobile, o flex
               abria um buraco no meio da frase. Ponto inline + `align-middle`
               deixa o texto quebrar como texto normal. */
            <p className="animar-entrada mb-7 text-[10px] uppercase leading-[2] tracking-[0.16em] text-white/60 sm:text-[11px] sm:leading-normal sm:tracking-[0.28em]">
              <span
                className="mr-2.5 inline-block size-1.5 rounded-full bg-emerald-400 align-middle ring-4 ring-emerald-400/20 motion-safe:animate-pulsar"
                aria-hidden
              />
              Atualizado a {atualizado} ·{" "}
              <span className="tnum">{formatNumber(totalListings)}</span> anúncios lidos
            </p>
          )}

          <h1 className="font-display text-[clamp(2.9rem,11vw,8.6rem)] font-black uppercase leading-[0.86] tracking-[-0.05em]">
            <span className="animar-entrada atraso-1 tnum block bg-[linear-gradient(94deg,#fbbf24,#fde9b8_46%,#e8930c)] bg-clip-text text-transparent">
              {formatNumber(activeOpportunities)}
            </span>
            <span className="animar-entrada atraso-2 block">carros</span>
            <span className="animar-entrada atraso-3 block">compensam.</span>
          </h1>

          <p className="animar-entrada atraso-4 mt-7 max-w-[34rem] text-pretty text-[15px] leading-relaxed text-white/65 sm:text-base">
            Cinco mercados europeus. Custo final já com ISV, IUC, transporte e legalização —{" "}
            <strong className="font-medium text-white">
              comparado com o preço a que se vende em Portugal.
            </strong>
          </p>

          <div className="animar-entrada atraso-5 mt-9 flex flex-wrap items-center gap-x-6 gap-y-4">
            <Link
              href="/registar"
              className="rounded-full bg-white px-7 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[#08090b] transition-colors hover:bg-white/85"
            >
              Começar — 1.º mês grátis ↗
            </Link>
            <span className="text-[11px] uppercase tracking-[0.14em] text-white/50">
              Sem cartão · sem fidelização
            </span>
          </div>
        </div>

        <dl className="animar-entrada atraso-6 relative z-10 mx-auto grid w-full max-w-[1120px] grid-cols-2 gap-x-6 border-t border-white/15 pb-12 pt-6 sm:grid-cols-4 sm:pb-16">
          {STATS.map((s) => (
            <div key={s.label} className="py-2">
              <dd className="tnum font-display text-[1.6rem] font-bold leading-none tracking-tight sm:text-[2rem]">
                {s.value}
              </dd>
              <dt className="mt-2 text-[10px] uppercase tracking-[0.2em] text-white/45">
                {s.label}
              </dt>
            </div>
          ))}
        </dl>
      </section>

      {/* ══ 2. A CONTA DO ISV ══ banda mais clara, o maior título ═══ */}
      {isvExample && (
        <section id="como-funciona" className="border-y border-white/[0.07] bg-[#0d0f13]">
          <div className="revelar mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
            <p className="mb-5 text-[10px] uppercase tracking-[0.24em] text-amber-400/70">
              A conta
            </p>
            <h2 className="max-w-[15ch] font-display text-3xl font-black uppercase leading-[0.94] tracking-[-0.04em] sm:text-[2.75rem]">
              A conta que ninguém quer fazer
            </h2>
            <p className="mb-10 mt-5 max-w-[52ch] text-[15px] leading-relaxed text-white/55 sm:text-base">
              Este é um carro que está à venda agora, com os números de hoje. Abre o ISV para veres
              de onde vem o valor.
            </p>
            <LandingCostBreakdown car={isvExample} />
          </div>
        </section>
      )}

      {/* ══ 3. MERCADO ══ o único momento que sangra ════════════════ */}
      {featured.length > 0 && (
        <section id="mercado" className="py-14 sm:py-16">
          <div className="revelar mx-auto flex max-w-[1120px] flex-wrap items-end justify-between gap-x-6 gap-y-3 px-4 sm:px-6">
            <div>
              <p className="mb-4 text-[10px] uppercase tracking-[0.24em] text-amber-400/70">
                Mercado
              </p>
              <h2 className="font-display text-2xl font-black uppercase tracking-[-0.035em] sm:text-[2rem]">
                Alguns dos <span className="tnum">{formatNumber(activeOpportunities)}</span> de hoje
              </h2>
            </div>
            <Link
              href="/registar"
              className="text-[11px] uppercase tracking-[0.14em] text-amber-400 transition-colors hover:text-amber-300"
            >
              Ver todos ↗
            </Link>
          </div>

          <div className="revelar mt-7 overflow-x-auto pb-3 [scrollbar-width:thin]">
            <ul className={`flex w-max gap-3.5 ${BLEED_PAD}`}>
              {featured.map((car) => (
                <li key={car.id} className="w-[272px] shrink-0">
                  <OpportunityCard car={car} />
                </li>
              ))}
            </ul>
          </div>

          {/* A menção às imagens não é rodapé legal por precaução: os cartões
              usam o render de catálogo do MODELO, não a foto daquele carro (ver
              `prefer="catalog"` em opportunity-card.tsx). Numa página cujo
              argumento inteiro é rigor nos números, deixar passar uma foto de
              estúdio como sendo o carro à venda custava mais do que ganhava. */}
          <p className="mx-auto max-w-[1120px] px-4 text-[11px] uppercase tracking-[0.1em] text-white/30 sm:px-6">
            Imagens ilustrativas do modelo · verificados na última leitura, podem já ter sido
            vendidos
          </p>
        </section>
      )}

      {/* ══ 4. APOIO ══ banda calma, tipo pequeno, colunas 3fr/2fr ══
             Assimétrico de propósito, para a página não ser só grelhas de
             partes iguais. Os limites ficam ANTES do preço: quem os lê e mesmo
             assim carrega no botão, chega convencido. ══════════════ */}
      <section className="border-y border-white/[0.07] bg-[#0b0d11]">
        <div className="revelar mx-auto grid max-w-[1120px] gap-x-16 gap-y-12 px-4 py-14 sm:px-6 lg:grid-cols-[3fr_2fr]">
          <div>
            <p className="mb-4 text-[10px] uppercase tracking-[0.24em] text-white/35">
              Como funciona
            </p>
            <ol>
              {STEPS.map((step) => (
                <li key={step.n} className="border-t border-white/[0.09] py-4">
                  <h3 className="font-display text-[1.05rem] font-bold tracking-tight text-white">
                    {step.n}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <p className="mb-4 text-[10px] uppercase tracking-[0.24em] text-amber-400/70">
              O que isto não faz
            </p>
            <ul>
              {LIMITS.map((l) => (
                <li key={l.title} className="border-t border-white/[0.09] py-4">
                  <h3 className="font-display text-[1.05rem] font-bold tracking-tight text-white">
                    {l.title}
                  </h3>
                  <p className="mt-1.5 text-[13px] leading-relaxed text-white/45">{l.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-4">
              <Link
                href="/ajuda"
                className="text-[11px] uppercase tracking-[0.14em] text-amber-400 transition-colors hover:text-amber-300"
              >
                As perguntas que os stands fazem mesmo ↗
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ══ 5. PREÇO ══ a inversão: o único momento claro da página ══ */}
      <section id="preco" className="bg-amber text-[#1a1204]">
        <div className="revelar mx-auto grid max-w-[1120px] items-center gap-10 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1.35fr_1fr]">
          <div>
            <p className="mb-5 text-[10px] uppercase tracking-[0.24em] text-[#1a1204]/55">Preço</p>
            <h2 className="font-display text-3xl font-black uppercase leading-[0.92] tracking-[-0.04em] sm:text-[2.5rem]">
              <span className="tnum">{CONDICOES.precoMensalEuros} €</span> por mês.
              <br />O primeiro é grátis.
            </h2>
            <p className="mt-4 max-w-[42ch] text-[15px] leading-relaxed text-[#1a1204]/70">
              Sem cartão para experimentar, sem fidelização, cancelas quando quiseres. Um preço só,
              toda a equipa do stand incluída.
            </p>
          </div>
          <div className="flex flex-col items-start gap-4 lg:items-end">
            <Link
              href="/registar"
              className="rounded-full bg-[#08090b] px-8 py-4 text-[11px] font-bold uppercase tracking-[0.14em] text-white transition-colors hover:bg-[#08090b]/85"
            >
              Começar — 1.º mês grátis ↗
            </Link>
            <span className="text-[11px] uppercase tracking-[0.12em] text-[#1a1204]/60 lg:text-right">
              Um carro dos de hoje paga{" "}
              <span className="tnum">
                {Math.floor(medianSavings / CONDICOES.precoMensalEuros)} meses
              </span>{" "}
              de subscrição
            </span>
          </div>
        </div>
      </section>
    </div>
  );
}
