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
 *
 * ── Sobre a COMPOSIÇÃO (não mexer sem perceber isto) ────────────────
 * A 1.ª versão desta página tinha 5 de 6 secções com exatamente o mesmo padding
 * (44px), uma só largura, um só fundo e um só tamanho de h2. Cada secção estava
 * certa isolada; o conjunto lia-se como gerado, porque em 3 200 px de altura
 * nada mudava nunca.
 *
 * O que segura a página agora é a VARIAÇÃO, e é deliberada:
 *   respiro   96 · 96 · 64 · 56 · 80 px   (a densidade diz o que importa)
 *   fundo     paper · surface · paper · surface · petróleo
 *   h2        —  · 44 · 32 · 22 · 40 px
 *   largura   1120 em tudo, EXCETO a fila de oportunidades, que sangra
 *
 * A conta do ISV é a peça mais convincente que temos: leva a banda maior e o
 * maior título. Como funciona / o que não faz são material de apoio — tipo
 * pequeno, colunas assimétricas, sem cartões.
 */
export const revalidate = 3600;

const STEPS = [
  {
    title: "Dizes o que procuras",
    body: "Marca, modelo, orçamento, quilómetros. Ou deixas em aberto e vês tudo o que compensa hoje.",
  },
  {
    title: "Nós fazemos a conta",
    body: "Todos os dias recalculamos ISV, IUC, transporte e legalização de cada anúncio, e comparamos com o preço praticado em Portugal.",
  },
  {
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
    <>
      {/* ── Hero cinematográfico ─────────────────────────────────
          `data-hero="escuro"` não é decoração: o cabeçalho do site é claro e
          fica por cima disto. O globals.css apanha-o com `body:has(...)` e
          escurece-o SÓ nesta página. Tirar o atributo devolve um cabeçalho
          branco em cima de um vídeo escuro. */}
      <section
        data-hero="escuro"
        className="relative -mt-14 flex min-h-[100svh] flex-col overflow-hidden bg-[#08090b] px-4 pt-14 text-white sm:px-6"
      >
        {/* `-mt-14`+`pt-14`: o hero desliza para debaixo do cabeçalho sticky
            (h-14) e o conteúdo desce outra vez — o vídeo passa a começar no
            topo do ecrã em vez de abaixo de uma barra clara. */}
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
        {/* Véu: o vídeo é claro à direita e o texto branco não leria sem isto. */}
        <div
          aria-hidden
          className="absolute inset-0 bg-[linear-gradient(102deg,rgba(8,9,11,.93)_0%,rgba(8,9,11,.78)_38%,rgba(8,9,11,.4)_70%,rgba(8,9,11,.74)_100%)]"
        />

        <div className="relative z-10 mx-auto flex w-full max-w-[1120px] flex-1 flex-col justify-center py-14 sm:py-20">
          {atualizado && (
            /* Sem `flex`: com `tracking` largo e duas linhas em mobile, o flex
               abria um buraco no meio da frase. Ponto inline + `align-middle`
               deixa o texto quebrar como texto normal. O tracking também
               aperta em ecrãs pequenos, senão a frase ocupa três linhas. */
            <p className="animar-entrada mb-7 text-[10px] uppercase leading-[2] tracking-[0.16em] text-white/60 sm:text-[11px] sm:leading-normal sm:tracking-[0.28em]">
              <span
                className="mr-2.5 inline-block size-1.5 rounded-full bg-good align-middle ring-4 ring-good/20 motion-safe:animate-pulsar"
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
            <Button asChild variant="accent" size="lg">
              <Link href="/registar">Começar — 1.º mês grátis</Link>
            </Button>
            <span className="text-xs uppercase tracking-[0.14em] text-white/55">
              Sem cartão · sem fidelização
            </span>
          </div>
        </div>

        {/* Números sobre o vídeo, separados só por um fio. */}
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

      {/* ── A conta do ISV — a peça central, em banda própria ────── */}
      {isvExample && (
        <section id="como-funciona" className="border-y border-line bg-surface">
          <div className="revelar mx-auto max-w-[1120px] px-4 py-16 sm:px-6 sm:py-24">
            <h2 className="max-w-[18ch] text-balance font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.75rem] sm:leading-[1.05]">
              A conta que ninguém quer fazer
            </h2>
            <p className="mb-10 mt-4 max-w-[58ch] text-ink-soft sm:text-lg">
              Este é um carro que está à venda agora, com os números de hoje. Abre o ISV para veres
              de onde vem o valor.
            </p>
            <LandingCostBreakdown car={isvExample} />
          </div>
        </section>
      )}

      {/* ── Oportunidades — o único momento que sangra ───────────── */}
      {featured.length > 0 && (
        <section className="py-12 sm:py-16">
          <div className="revelar mx-auto flex max-w-[1120px] flex-wrap items-baseline justify-between gap-x-6 gap-y-2 px-4 sm:px-6">
            <h2 className="font-display text-2xl font-bold tracking-[-0.02em] sm:text-[2rem]">
              Alguns dos <span className="tnum">{formatNumber(activeOpportunities)}</span> de hoje
            </h2>
            <Link
              href="/registar"
              className="text-sm text-amber underline-offset-4 hover:underline"
            >
              Ver todos →
            </Link>
          </div>

          <div className="revelar mt-6 overflow-x-auto pb-3 [scrollbar-width:thin]">
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
          <p className="mx-auto max-w-[1120px] px-4 text-sm text-steel sm:px-6">
            Imagens ilustrativas do modelo · verificados na última leitura, podem já ter sido
            vendidos
          </p>
        </section>
      )}

      {/* ── Apoio: como funciona + limites. Banda calma, tipo pequeno,
             colunas assimétricas (3fr/2fr) para a página não ser só grelhas
             de partes iguais. Os limites ficam de propósito ANTES do preço:
             quem os lê e mesmo assim carrega no botão, chega convencido. ── */}
      <section className="border-y border-line bg-surface">
        <div className="revelar mx-auto grid max-w-[1120px] gap-x-14 gap-y-10 px-4 py-12 sm:px-6 sm:py-14 lg:grid-cols-[3fr_2fr]">
          <div>
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] sm:text-[1.375rem]">
              Como funciona
            </h2>
            <ol className="mt-5">
              {STEPS.map((step) => (
                <li key={step.title} className="border-t border-line py-4">
                  <h3 className="font-display text-[0.95rem] font-semibold">{step.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h2 className="font-display text-xl font-bold tracking-[-0.02em] sm:text-[1.375rem]">
              O que isto <span className="text-amber">não</span> faz
            </h2>
            <ul className="mt-5">
              {LIMITS.map((l) => (
                <li key={l.title} className="border-t border-line py-4">
                  <h3 className="font-display text-[0.95rem] font-semibold">{l.title}</h3>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{l.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/ajuda" className="text-amber underline underline-offset-2">
                As perguntas que os stands fazem mesmo
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Preço — banda cheia, alto e curto ────────────────────── */}
      <section id="preco" className="bg-petrol text-white">
        <div className="revelar mx-auto grid max-w-[1120px] items-center gap-8 px-4 py-14 sm:px-6 sm:py-20 lg:grid-cols-[1.4fr_1fr]">
          <div>
            <h2 className="text-balance font-display text-3xl font-bold tracking-[-0.03em] sm:text-[2.5rem] sm:leading-[1.05]">
              <span className="tnum">{CONDICOES.precoMensalEuros} €</span> por mês. O primeiro é
              grátis.
            </h2>
            <p className="mt-3 max-w-[46ch] text-white/70">
              Sem cartão para experimentar, sem fidelização, cancelas quando quiseres. Um preço só,
              toda a equipa do stand incluída.
            </p>
          </div>
          <div className="flex flex-col gap-3 lg:items-end">
            <Button asChild variant="accent" size="lg">
              <Link href="/registar">Começar — 1.º mês grátis</Link>
            </Button>
            <span className="text-sm text-white/60">
              Um carro dos de hoje paga{" "}
              <span className="tnum">
                {Math.floor(medianSavings / CONDICOES.precoMensalEuros)} meses
              </span>{" "}
              de subscrição.
            </span>
          </div>
        </div>
      </section>
    </>
  );
}
