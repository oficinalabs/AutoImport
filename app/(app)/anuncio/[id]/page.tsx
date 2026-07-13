import { CarImage } from "@/components/car-image";
import { CostBreakdown } from "@/components/cost-breakdown";
import { CountryFlag } from "@/components/country-flag";
import { KmTrustBadge } from "@/components/km-trust-badge";
import { PriceChart } from "@/components/price-chart";
import { SavingsBadge } from "@/components/savings-badge";
import { Button } from "@/components/ui/button";
import { VerdictBadge } from "@/components/verdict-badge";
import { getListing } from "@/lib/data";
import { formatCc, formatEuro, formatKm, formatNumber } from "@/lib/format";
import type { Listing } from "@/lib/types";
import { ArrowLeft, BellPlus, Heart, MessagesSquare } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function specs(l: Listing): { label: string; value: string }[] {
  const m = l.model;
  const out: { label: string; value: string }[] = [
    { label: "Ano", value: String(l.year) },
    { label: "Quilómetros", value: formatKm(l.km) },
    { label: "Combustível", value: cap(m.fuel) },
    { label: "Caixa", value: cap(m.transmission) },
  ];
  if (m.displacementCc) out.push({ label: "Cilindrada", value: formatCc(m.displacementCc) });
  if (m.powerHp) out.push({ label: "Potência", value: `${m.powerHp} cv` });
  if (m.co2 !== undefined) out.push({ label: "CO₂", value: `${m.co2} g/km` });
  if (l.color) out.push({ label: "Cor", value: l.color });
  return out;
}

export default async function AnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const listing = await getListing(id);
  if (!listing) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/pesquisar"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Voltar à pesquisa
      </Link>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Coluna esquerda: fotos + ficha */}
        <div className="flex flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                <VerdictBadge verdict={listing.verdict} />
                <span className="text-xs text-ink-soft">
                  <CountryFlag code={listing.country} /> · {listing.source}
                </span>
              </div>
              <h1 className="text-2xl font-bold">{listing.title}</h1>
            </div>
          </div>

          {/* Galeria */}
          <div className="grid grid-cols-4 gap-2">
            <CarImage label={listing.title} className="col-span-4 aspect-[16/9] w-full" />
            {listing.images.slice(1, 5).map((img) => (
              <CarImage key={img} className="aspect-square w-full" />
            ))}
          </div>

          {/* Ficha técnica */}
          <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
            <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Ficha técnica
            </h2>
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {specs(listing).map((s) => (
                <div key={s.label}>
                  <dt className="text-xs text-ink-soft">{s.label}</dt>
                  <dd className="mt-0.5 font-medium">{s.value}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Histórico de preço PT */}
          <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
            <div className="mb-1 flex items-center justify-between">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
                Preço de mercado em Portugal
              </h2>
              <span className="text-xs text-ink-soft">
                amostra de {formatNumber(listing.ptMarket.sampleSize)} anúncios
              </span>
            </div>
            <PriceChart data={listing.ptMarket.history} />
          </div>
        </div>

        {/* Coluna direita: dinheiro + ações */}
        <div className="flex flex-col gap-4">
          {/* Poupança em destaque */}
          <div className="rounded-[10px] border border-line bg-surface p-5">
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-soft">
                  Custo final em PT
                </div>
                <div className="tnum font-display text-2xl font-bold">
                  {formatEuro(listing.cost.totalPt)}
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  vs <span className="tnum">{formatEuro(listing.ptMarket.estimatedPrice)}</span> em
                  Portugal
                </div>
              </div>
              <SavingsBadge
                savings={listing.savings}
                savingsPct={listing.savingsPct}
                verdict={listing.verdict}
                size="lg"
              />
            </div>
          </div>

          <CostBreakdown cost={listing.cost} />

          {/* Confiança */}
          <div className="rounded-[10px] border border-line bg-surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Confiança
            </h3>
            <KmTrustBadge trust={listing.kmTrust} />
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              Confirma sempre o histórico de quilometragem antes de fechar — o risco de fraude é
              maior em importados.
            </p>
          </div>

          {/* Ações */}
          <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-4">
            <Button asChild variant="accent" size="lg">
              <Link href="/negociacoes">
                <MessagesSquare className="size-4" /> Iniciar negociação
              </Link>
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button variant="outline">
                <Heart className="size-4" /> Favoritar
              </Button>
              <Button variant="outline">
                <BellPlus className="size-4" /> Criar alerta
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
