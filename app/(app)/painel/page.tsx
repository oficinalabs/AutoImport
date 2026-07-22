import { CarCard } from "@/components/car-card";
import { CountryFlag } from "@/components/country-flag";
import { CountryInsights } from "@/components/country-insights";
import { DealProgress } from "@/components/deal-stepper";
import { StatCard } from "@/components/stat-card";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getCountryInsights, getDashboardStats, getDeals, getTopOpportunities } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import { Award, BellRing, PiggyBank, Sparkles, TrendingUp } from "lucide-react";
import Link from "next/link";

export default async function PainelPage() {
  const [stats, opportunities, insights, deals] = await Promise.all([
    getDashboardStats(),
    getTopOpportunities(3),
    getCountryInsights(),
    getDeals(),
  ]);

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Bom dia, Rui 👋</h1>
          <p className="mt-1 text-sm text-ink-soft">Aqui está o que compensa importar hoje.</p>
        </div>
        <Button asChild variant="accent">
          <Link href="/pesquisar">
            <Sparkles className="size-4" /> Ver oportunidades
          </Link>
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="A compensar agora"
          value={String(stats.activeOpportunities)}
          icon={Sparkles}
        />
        <StatCard label="Novas esta semana" value={String(stats.newThisWeek)} icon={TrendingUp} />
        <StatCard
          label="Poupança típica"
          value={formatEuro(stats.medianSavings)}
          icon={PiggyBank}
          accent
        />
        <StatCard label="Melhor agora" value={formatEuro(stats.bestSavings)} icon={Award} />
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

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        {/* Pipeline */}
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <CardTitle>As tuas compras</CardTitle>
            <Link href="/compras" className="text-sm font-medium text-petrol-ink hover:underline">
              Ver pipeline
            </Link>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {deals.slice(0, 4).map((d) => (
              <Link
                key={d.id}
                href="/compras"
                className="flex items-center gap-3 rounded-[8px] p-1 hover:bg-surface-2"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">{d.title}</span>
                    <CountryFlag code={d.country} showName={false} />
                  </div>
                  <div className="mt-2">
                    <DealProgress stage={d.stage} />
                  </div>
                </div>
              </Link>
            ))}
          </CardContent>
        </Card>

        {/* Países */}
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
    </div>
  );
}
