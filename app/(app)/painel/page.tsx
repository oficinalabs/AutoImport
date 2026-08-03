import { CarCard } from "@/components/car-card";
import { CountryInsights } from "@/components/country-insights";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getCountryInsights,
  getDashboardStats,
  getSessionUser,
  getTopOpportunities,
} from "@/lib/data";
import { formatEuro } from "@/lib/format";
import { Award, BellRing, PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

/**
 * Só o primeiro nome — "Bom dia, Rui Costa" não é como se cumprimenta alguém.
 * Sem sessão não inventamos um nome: a saudação fica sem vocativo (o `getSessionUser`
 * devolve null quando a sessão é inválida, e a rota já é protegida).
 */
function saudacao(name: string | undefined): string {
  const first = name?.trim().split(/\s+/)[0];
  return first ? `Bom dia, ${first} 👋` : "Bom dia 👋";
}

export default async function PainelPage() {
  const [stats, opportunities, insights, utilizador] = await Promise.all([
    getDashboardStats(),
    getTopOpportunities(3),
    getCountryInsights(),
    getSessionUser(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{saudacao(utilizador?.name)}</h1>
          <p className="mt-1 text-sm text-ink-soft">Aqui está o que compensa importar hoje.</p>
        </div>
        <Button asChild variant="accent">
          <Link href="/pesquisar">
            <Sparkles className="size-4" /> Ver oportunidades
          </Link>
        </Button>
      </div>

      {/* KPIs — cada um leva à listagem já filtrada que explica o número */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="A compensar agora"
          value={String(stats.activeOpportunities)}
          icon={Sparkles}
          href="/pesquisar?oportunidades=1"
        />
        <StatCard
          label="Novas esta semana"
          value={String(stats.newThisWeek)}
          icon={TrendingUp}
          href="/pesquisar?oportunidades=1&ordenar=recent"
        />
        <StatCard
          label="Poupança típica"
          value={formatEuro(stats.medianSavings)}
          icon={PiggyBank}
          accent
          href="/pesquisar?oportunidades=1&ordenar=savings"
        />
        <StatCard
          label="Melhor agora"
          value={formatEuro(stats.bestSavings)}
          icon={Award}
          href="/pesquisar?oportunidades=1&ordenar=savings"
        />
      </div>

      {/* Oportunidades */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold">Novas oportunidades</h2>
          <Link href="/pesquisar" className="text-sm font-medium text-petrol-ink hover:underline">
            Ver todas
          </Link>
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {opportunities.map((l) => (
            <CarCard key={l.id} listing={l} />
          ))}
        </div>
      </section>

      {/* Países. Ficou sozinho quando o cartão "As tuas compras" saiu (mostrava
          sempre o vazio, porque /compras não tem backend) — daí não haver aqui
          grelha nenhuma: a largura toda é do gráfico, e as barras agradecem. */}
      <Card>
        <CardHeader className="flex-row items-center justify-between">
          <CardTitle>Melhores países agora</CardTitle>
          <BellRing className="size-4 text-ink-soft" />
        </CardHeader>
        <CardContent>
          <CountryInsights insights={insights} />
        </CardContent>
      </Card>
    </div>
  );
}
