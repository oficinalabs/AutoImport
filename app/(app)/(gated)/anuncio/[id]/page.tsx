import { CarImage } from "@/components/car-image";
import { CostBreakdown } from "@/components/cost-breakdown";
import { CountryFlag } from "@/components/country-flag";
import { ImportChecklist } from "@/components/import-checklist";
import { IsvDetail } from "@/components/isv-detail";
import { KmTrustAdvice, KmTrustBadge } from "@/components/km-trust-badge";
import { ListingActions } from "@/components/listing-actions";
import { PriceChart } from "@/components/price-chart";
import { PtComparables } from "@/components/pt-comparables";
import { SavingsBadge } from "@/components/savings-badge";
import { SellerMessage } from "@/components/seller-message";
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  CarouselNext,
  CarouselPrevious,
} from "@/components/ui/carousel";
import { VatRegimeNote } from "@/components/vat-regime-note";
import { VerdictBadge } from "@/components/verdict-badge";
import { COUNTRY_GUIDES } from "@/lib/country-guides";
import { getListing } from "@/lib/data";
import {
  formatCc,
  formatEuro,
  formatKm,
  formatNumber,
  formatPercent,
  relativeDay,
} from "@/lib/format";
import type { Listing, Verdict } from "@/lib/types";
import { cn, isUuid } from "@/lib/utils";
import { ArrowLeft, PackageX } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";

function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/**
 * Um anúncio que deixou de aparecer nas fontes. Chega-se aqui pelos favoritos.
 * Dizemos "já não aparece", não "vendido": a engine só sabe que o anúncio
 * desapareceu — pode ter sido vendido, retirado, ou o coletor pode ter falhado.
 */
function AvisoIndisponivel({ seenAt }: { seenAt: string }) {
  return (
    <div className="flex gap-3 rounded-[10px] border border-line-strong bg-surface-2 p-4">
      <PackageX className="mt-0.5 size-4 shrink-0 text-ink-soft" aria-hidden />
      <div className="text-sm">
        <p className="font-semibold">Este anúncio já não aparece na fonte</p>
        <p className="mt-1 text-ink-soft">
          Visto pela última vez {relativeDay(seenAt)}. Pode ter sido vendido, retirado pelo
          vendedor, ou apenas ter deixado de ser publicado. Os números abaixo são os da última vez
          que o vimos — servem de referência, não são uma oferta.
        </p>
      </div>
    </div>
  );
}

const MARGIN_TONE: Record<Verdict, string> = {
  compensa: "text-good",
  marginal: "text-steel",
  nao_compensa: "text-bad",
};

/** Fotos do anúncio (até 8). Com uma só, a imagem de sempre; com várias, um
 *  carrossel com setas e contador. */
function Galeria({ listing }: { listing: Listing }) {
  const fotos = listing.images.slice(0, 8);
  if (fotos.length <= 1)
    return (
      <CarImage
        photo={fotos[0]}
        catalog={listing.catalogImage}
        label={listing.title}
        className="aspect-[16/9] w-full"
      />
    );
  return (
    <Carousel aria-label={`Fotos de ${listing.title}`}>
      <CarouselContent>
        {fotos.map((foto, i) => (
          <CarouselItem key={foto}>
            <CarImage
              photo={foto}
              label={`${listing.title} (${i + 1} de ${fotos.length})`}
              className="aspect-[16/9] w-full"
            />
          </CarouselItem>
        ))}
      </CarouselContent>
      <CarouselPrevious className="left-2" />
      <CarouselNext className="right-2" />
      <span className="pointer-events-none absolute right-2 bottom-2 rounded-full bg-[#08090b]/70 px-2 py-0.5 text-[11px] text-white">
        {fotos.length} fotos
      </span>
    </Carousel>
  );
}

function specs(l: Listing): { label: string; value: string }[] {
  const m = l.model;
  const out: { label: string; value: string }[] = [
    { label: "Ano", value: String(l.year) },
    { label: "Quilómetros", value: formatKm(l.km) },
    { label: "Combustível", value: cap(m.fuel) },
    // Sem caixa classificada (a fonte não a diz, ou diz "semi-automática", que é
    // ambígua) a ficha diz que não sabe. Escrever "Manual" por omissão — o que
    // acontecia a 291 anúncios da montra — é inventar um facto sobre o carro.
    { label: "Caixa", value: m.transmission ? cap(m.transmission) : "Não indicada" },
  ];
  if (m.displacementCc) out.push({ label: "Cilindrada", value: formatCc(m.displacementCc) });
  if (m.powerHp) out.push({ label: "Potência", value: `${m.powerHp} cv` });
  if (m.co2 !== undefined) out.push({ label: "CO₂", value: `${m.co2} g/km` });
  if (l.color) out.push({ label: "Cor", value: l.color });
  return out;
}

export default async function AnuncioPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Um id que nem sequer tem forma de uuid é um URL inventado, não um anúncio
  // que sumiu — 404 antes de chegar à base de dados. Ver lib/utils.ts.
  if (!isUuid(id)) notFound();

  const listing = await getListing(id);
  if (!listing) notFound();

  const indisponivel = Boolean(listing.unavailableSince);

  return (
    <div className="flex flex-col gap-5">
      <Link
        href="/pesquisar"
        className="inline-flex items-center gap-1.5 text-sm text-ink-soft hover:text-ink"
      >
        <ArrowLeft className="size-4" /> Voltar à pesquisa
      </Link>

      {indisponivel && <AvisoIndisponivel seenAt={listing.seenAt} />}

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        {/* Coluna esquerda: fotos + ficha */}
        <div className="flex min-w-0 flex-col gap-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="mb-2 flex items-center gap-2">
                {/* Sem veredito num anúncio que já saiu do mercado: dizer
                    "compensa" sobre um carro que já não se compra é enganador. */}
                {!indisponivel && <VerdictBadge verdict={listing.verdict} />}
                <span className="text-xs text-ink-soft">
                  <CountryFlag code={listing.country} /> · {listing.source}
                </span>
              </div>
              <h1 className="text-2xl font-bold">{listing.title}</h1>
            </div>
          </div>

          <Galeria listing={listing} />

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
            <div className="mb-1 flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">
                Preço de mercado em Portugal
              </h2>
              <div className="flex items-center gap-2">
                {/* Transparência: itens guardados/favoritos abrem mesmo com
                    estimativa alargada (banda de km esticada) — a montra não os
                    mostra, mas quem cá chega merece saber que a amostra é menos
                    fechada. Nota discreta, não alarme. */}
                {listing.ptMarket.confidence === "alargada" && (
                  <span
                    className="rounded-full border border-line px-2 py-0.5 text-[11px] text-ink-soft"
                    title="Amostra com a banda de quilómetros alargada — menos anúncios comparáveis, estimativa menos fechada."
                  >
                    estimativa alargada
                  </span>
                )}
                <span className="text-xs text-ink-soft">
                  amostra de {formatNumber(listing.ptMarket.sampleSize)} anúncios
                </span>
              </div>
            </div>
            <PriceChart data={listing.ptMarket.history} />
          </div>

          <PtComparables sample={listing.ptSample} sampleSize={listing.ptMarket.sampleSize} />
        </div>

        {/* Coluna direita: dinheiro + ações */}
        <div className="flex min-w-0 flex-col gap-4">
          {/* Margem (ou, nas estimativas antigas, poupança) em destaque. Num anúncio que já saiu do mercado isto é
              referência histórica, não uma oferta — daí o rótulo diferente e o
              destaque atenuado. Um "−9070 € POUPANÇA" verde e garrido sobre um
              carro que já não se compra contradiz o aviso lá em cima. */}
          <div
            className={cn(
              "rounded-[10px] border border-line bg-surface p-5",
              indisponivel && "opacity-70",
            )}
          >
            <div className="flex items-end justify-between">
              <div>
                <div className="text-xs uppercase tracking-wide text-ink-soft">
                  {indisponivel ? "Custo final estimado" : "Custo final em PT"}
                </div>
                <div className="tnum font-display text-2xl font-bold">
                  {formatEuro(listing.cost.totalPt)}
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  vs <span className="tnum">{formatEuro(listing.ptMarket.estimatedPrice)}</span> em
                  Portugal
                </div>
              </div>
              {/* Com o motor novo o número que decide é a margem bruta (plano §5,
                  DEFAULT): "poupança" só nas estimativas antigas, sem margem. */}
              {listing.cost.grossMargin !== undefined ? (
                <div
                  className={cn(
                    "tnum text-right font-display leading-none",
                    MARGIN_TONE[listing.verdict],
                  )}
                >
                  <div className="text-3xl font-bold">{formatEuro(listing.cost.grossMargin)}</div>
                  <div className="mt-1 font-sans text-xs font-medium uppercase tracking-wide text-ink-soft">
                    margem bruta
                    {listing.cost.grossMarginPct !== undefined &&
                      ` · ${formatPercent(listing.cost.grossMarginPct, false)}`}
                  </div>
                </div>
              ) : (
                <SavingsBadge
                  savings={listing.savings}
                  savingsPct={listing.savingsPct}
                  verdict={listing.verdict}
                  size="lg"
                />
              )}
            </div>
          </div>

          <VatRegimeNote
            source={listing.sourceVatRegime}
            cost={listing.cost}
            country={listing.country}
          />

          <CostBreakdown cost={listing.cost} ptPrice={listing.ptMarket.estimatedPrice} />

          <IsvDetail listing={listing} />

          {/* Confiança */}
          <div className="rounded-[10px] border border-line bg-surface p-4">
            <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-ink-soft">
              Confiança
            </h3>
            <KmTrustBadge trust={listing.kmTrust} />
            {/* Sem `kmCheck`: o Listing ainda não o expõe (ver o PR do P07). */}
            <KmTrustAdvice country={listing.country} year={listing.year} />
          </div>

          {/* Ações */}
          <ListingActions listing={listing} />
        </div>
      </div>

      {/* O que fazer a seguir: abaixo das duas colunas, para no telemóvel não
          empurrar a conta para o fundo da página. */}
      <div className="grid gap-6 lg:grid-cols-2">
        <ImportChecklist country={listing.country} />
        <div className="min-w-0">
          <SellerMessage
            messages={COUNTRY_GUIDES[listing.country].messages}
            car={listing.title}
            price={formatEuro(listing.cost.originPrice)}
            link={listing.sourceUrl}
          />
        </div>
      </div>
    </div>
  );
}
