import { CarImage } from "@/components/car-image";
import { CountryFlag } from "@/components/country-flag";
import { KmTrustBadge } from "@/components/km-trust-badge";
import { SavingsBadge } from "@/components/savings-badge";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/verdict-badge";
import { COUNTRY_LIST } from "@/lib/countries";
import {
  ArrowRight,
  Bell,
  Calculator,
  GitCompareArrows,
  Lock,
  ShieldCheck,
  Workflow,
} from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "AutoImport — importa com contas",
  description:
    "Para stands automóveis: descobre que carros compensa importar da Europa, com o custo final em Portugal já com ISV, IUC, transporte e legalização.",
  openGraph: {
    title: "AutoImport — importa com contas",
    description:
      "Que carros compensa importar da Europa, com o custo final real já com impostos — para o teu stand.",
    locale: "pt_PT",
    type: "website",
  },
};

const STEPS = [
  {
    title: "A engine vigia a Europa",
    body: "Todos os dias analisamos anúncios nos principais mercados — Alemanha, França, Bélgica, Holanda e Espanha.",
  },
  {
    title: "Fazemos as contas todas",
    body: "Preço na origem + transporte + ISV + IUC + legalização = custo final em Portugal, comparado com o mercado nacional.",
  },
  {
    title: "Só vês o que compensa",
    body: "Recebes alertas das oportunidades, negocias pela plataforma e acompanhas a compra até à matrícula.",
  },
];

const FEATURES = [
  {
    icon: Calculator,
    title: "Custo final real",
    body: "ISV e IUC calculados por viatura — sem surpresas na legalização.",
  },
  {
    icon: GitCompareArrows,
    title: "Comparação PT vs. Europa",
    body: "O mesmo carro nos dois mercados, lado a lado, com a poupança à vista.",
  },
  {
    icon: Bell,
    title: "Alertas de oportunidade",
    body: "Define os critérios e recebe só os negócios que batem certo.",
  },
  {
    icon: Lock,
    title: "Negociação privada",
    body: "Fala com fornecedores por email mascarado, sem expor contactos.",
  },
  {
    icon: Workflow,
    title: "Pipeline até à matrícula",
    body: "Da proposta ao registo português, com checklist de documentos.",
  },
  {
    icon: ShieldCheck,
    title: "Km com confiança",
    body: "Sinalizamos o histórico e a verificação de quilometragem.",
  },
];

const FAQ = [
  {
    q: "Compensa mesmo importar?",
    a: "Depende do carro: cilindrada, CO₂ e idade mandam no ISV. É exatamente isso que a plataforma calcula por ti, anúncio a anúncio — e só te mostra o que compensa.",
  },
  {
    q: "De onde vêm os anúncios?",
    a: "Dos principais mercados europeus (Alemanha, França, Bélgica, Holanda e Espanha). Estamos a ligar as fontes por fases — durante o acesso antecipado verás dados de demonstração.",
  },
  {
    q: "Tratam da importação por mim?",
    a: "Não vendemos nem transportamos carros — damos-te a decisão. Ficas com o controlo do negócio e usas os teus parceiros de transporte e legalização.",
  },
  {
    q: "Como funciona o trial?",
    a: "1.º mês grátis, sem cartão de crédito. No fim decides se o AutoImport fica na equipa.",
  },
];

export default function LandingPage() {
  return (
    <>
      {/* Hero */}
      <section className="mx-auto grid w-full max-w-[1120px] items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:pt-20">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-amber-ink">
            Para stands automóveis
          </p>
          <h1 className="text-4xl font-bold leading-[1.08] sm:text-5xl">Importa com contas.</h1>
          <p className="mt-4 max-w-[52ch] text-lg text-ink-soft">
            O AutoImport mostra ao teu stand que carros compensa trazer da Europa — com o custo
            final em Portugal <strong className="font-semibold text-ink">já com ISV</strong>, IUC,
            transporte e legalização, comparado com o preço de mercado nacional.
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            <Button asChild variant="accent" size="lg">
              <Link href="/registar">Começar — 1.º mês grátis</Link>
            </Button>
            <Button asChild variant="outline" size="lg">
              <Link href="/painel">
                Ver demonstração <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
          <p className="mt-3 text-xs text-ink-soft">
            Sem cartão de crédito. Cancela quando quiseres.
          </p>
        </div>

        {/* Cartão de negócio (exemplo real da app) */}
        <div className="rounded-[12px] border border-line-strong bg-surface shadow-[0_12px_32px_-16px_rgba(14,59,74,.3)]">
          <div className="flex items-start justify-between gap-3 border-b border-line p-4">
            <div className="flex items-center gap-3">
              <CarImage className="size-14 shrink-0" label="VW Golf" />
              <div>
                <div className="font-display font-semibold">VW Golf 1.5 TSI Style</div>
                <div className="mt-0.5 text-xs text-ink-soft">
                  2022 · 45 000 km · <CountryFlag code="DE" /> · AutoScout24
                </div>
              </div>
            </div>
            <VerdictBadge verdict="compensa" />
          </div>
          <div className="grid grid-cols-2 gap-4 p-4 text-sm">
            <div className="flex flex-col gap-1.5">
              <Row label="Preço na origem" value="22 500 €" />
              <Row label="Transporte" value="700 €" />
              <Row label="ISV + IUC" value="3 320 €" />
              <Row label="Legalização" value="350 €" />
              <div className="mt-1 flex items-center justify-between border-t border-line pt-2 font-semibold">
                <span>Total em PT</span>
                <span className="tnum font-mono">26 870 €</span>
              </div>
            </div>
            <div className="flex flex-col items-end justify-between">
              <div className="text-right text-xs text-ink-soft">
                Preço equivalente em Portugal
                <div className="tnum font-mono text-base font-semibold text-ink">29 900 €</div>
              </div>
              <SavingsBadge savings={3030} savingsPct={10.1} verdict="compensa" size="lg" />
            </div>
          </div>
          <div className="border-t border-line px-4 py-2.5">
            <KmTrustBadge trust={{ level: "verificado", source: "carVertical" }} />
          </div>
        </div>
      </section>

      {/* Países */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-center gap-x-8 gap-y-2 px-4 py-5 text-sm text-ink-soft sm:px-6">
          <span className="text-xs font-semibold uppercase tracking-wide">
            A vigiar 5 mercados europeus
          </span>
          {COUNTRY_LIST.map((c) => (
            <CountryFlag key={c.code} code={c.code} />
          ))}
        </div>
      </section>

      {/* Como funciona */}
      <section id="como-funciona" className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-bold">Como funciona</h2>
        <div className="mt-8 grid gap-6 sm:grid-cols-3">
          {STEPS.map((s, i) => (
            <div key={s.title} className="rounded-[10px] border border-line bg-surface p-5">
              <span className="tnum font-mono text-sm font-semibold text-amber-ink">
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="mt-2 font-display text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm text-ink-soft">{s.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="border-y border-line bg-surface">
        <div className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-bold">Tudo o que o stand precisa para importar</h2>
          <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <div key={title} className="flex gap-3">
                <span className="flex size-9 shrink-0 items-center justify-center rounded-[8px] bg-petrol text-white">
                  <Icon className="size-4" />
                </span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-1 text-sm text-ink-soft">{body}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Preço */}
      <section id="preco" className="mx-auto w-full max-w-[1120px] px-4 py-16 sm:px-6">
        <div className="mx-auto max-w-md rounded-[12px] border border-line-strong bg-surface p-6 text-center">
          <h2 className="text-xl font-bold">Um plano, sem letras pequenas</h2>
          <div className="mt-4">
            <span className="tnum font-display text-5xl font-bold">100 €</span>
            <span className="text-ink-soft">/mês por stand</span>
          </div>
          <ul className="mx-auto mt-5 flex w-fit flex-col gap-2 text-left text-sm text-ink-soft">
            <li>✓ Pesquisas e alertas ilimitados</li>
            <li>✓ Toda a equipa do stand incluída</li>
            <li>✓ Negociações e pipeline de compra</li>
            <li>✓ Cancela quando quiseres</li>
          </ul>
          <Button asChild variant="accent" size="lg" className="mt-6 w-full">
            <Link href="/registar">Começar — 1.º mês grátis</Link>
          </Button>
          <p className="mt-2 text-xs text-ink-soft">Sem cartão de crédito no trial.</p>
        </div>
      </section>

      {/* FAQ */}
      <section className="mx-auto w-full max-w-[720px] px-4 pb-16 sm:px-6">
        <h2 className="text-2xl font-bold">Perguntas frequentes</h2>
        <div className="mt-6 flex flex-col gap-2">
          {FAQ.map((f) => (
            <details
              key={f.q}
              className="group rounded-[8px] border border-line bg-surface px-4 py-3"
            >
              <summary className="flex items-center justify-between font-medium [&::-webkit-details-marker]:hidden">
                {f.q}
                <span className="text-ink-soft transition-transform group-open:rotate-45">+</span>
              </summary>
              <p className="mt-2 text-sm text-ink-soft">{f.a}</p>
            </details>
          ))}
        </div>
      </section>

      {/* CTA final */}
      <section className="bg-petrol">
        <div className="mx-auto flex w-full max-w-[1120px] flex-wrap items-center justify-between gap-4 px-4 py-12 sm:px-6">
          <div>
            <h2 className="text-2xl font-bold text-white">Pronto para importar com contas?</h2>
            <p className="mt-1 text-sm text-white/70">
              Junta o teu stand no acesso antecipado — 1.º mês grátis.
            </p>
          </div>
          <Button asChild variant="accent" size="lg">
            <Link href="/registar">Criar conta do stand</Link>
          </Button>
        </div>
      </section>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-ink-soft">{label}</span>
      <span className="tnum font-mono">{value}</span>
    </div>
  );
}
