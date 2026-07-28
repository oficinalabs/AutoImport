"use client";

import { Button } from "@/components/ui/button";
import { COUNTRY_LIST } from "@/lib/countries";
import { createAlert, toggleFavorite } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import type { CountryCode, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BellPlus, Check, ExternalLink, Heart, MessagesSquare, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Bloco de "Ações" do anúncio: favoritar + criar alerta (variante disponível),
 * ou o par próprio da variante indisponível (inalterado — ver docs/08); em
 * ambas, o link para o anúncio na fonte.
 * Client component porque favoritar e criar alerta precisam de estado local
 * (otimista) e interação; a página em si continua Server Component.
 */
export function ListingActions({ listing }: { listing: Listing }) {
  const indisponivel = Boolean(listing.unavailableSince);
  const [fav, setFav] = useState(listing.isFavorite);
  const [showAlertForm, setShowAlertForm] = useState(false);

  // Otimista, mesmo padrão do components/car-card.tsx.
  async function onToggleFavorite() {
    setFav((v) => !v);
    await toggleFavorite(listing.id);
  }

  return (
    <div className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface p-4">
      {/* Não convidamos ninguém a negociar um carro que já não está à
          venda — o alerta é que faz sentido, para apanhar outro igual. */}
      {indisponivel ? (
        <>
          <Button asChild variant="accent" size="lg">
            <Link href="/alertas">
              <BellPlus className="size-4" /> Avisar-me se aparecer outro igual
            </Link>
          </Button>
          <Button variant="outline">
            <Heart className="size-4" /> Tirar dos favoritos
          </Button>
        </>
      ) : (
        <>
          <Button asChild variant="accent" size="lg">
            <Link href="/negociacoes">
              <MessagesSquare className="size-4" /> Iniciar negociação
            </Link>
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={onToggleFavorite}
              aria-pressed={fav}
              aria-label={fav ? "Remover dos favoritos" : "Guardar nos favoritos"}
            >
              <Heart className={cn("size-4", fav && "fill-bad text-bad")} />
              {fav ? "Nos favoritos" : "Favoritar"}
            </Button>
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowAlertForm((v) => !v)}
              aria-expanded={showAlertForm}
            >
              {showAlertForm ? <X className="size-4" /> : <BellPlus className="size-4" />}
              {showAlertForm ? "Fechar" : "Criar alerta"}
            </Button>
          </div>
          {showAlertForm && <AlertForm listing={listing} onClose={() => setShowAlertForm(false)} />}
        </>
      )}

      {/* O anúncio na fonte, para confirmar fotos e detalhes que não guardamos.
          Ação secundária de propósito: a negociação pela plataforma é que mantém
          o email do vendedor privado (docs/06). */}
      {listing.sourceUrl && (
        <Button asChild variant="outline">
          <a href={listing.sourceUrl} target="_blank" rel="noopener noreferrer nofollow">
            <ExternalLink className="size-4" /> Ver anúncio em {listing.source}
          </a>
        </Button>
      )}
    </div>
  );
}

// Limites do slider de custo final; ao máximo, o alerta fica "sem limite".
const PRICE_MIN = 10_000;
const PRICE_MAX = 120_000;
const PRICE_STEP = 1_000;

function clampPrice(v: number): number {
  return Math.min(PRICE_MAX, Math.max(PRICE_MIN, Math.round(v / PRICE_STEP) * PRICE_STEP));
}

/**
 * Formulário de alerta a partir de um anúncio. A marca e o modelo NÃO se editam
 * — o alerta é sempre sobre este carro (ou outro com as mesmas características).
 * O que o utilizador escolhe é o seu limite de custo (slider) e de que mercados
 * quer ser avisado.
 */
function AlertForm({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const make = listing.model.make;
  const model = listing.model.model;
  const nome = [make, model].filter(Boolean).join(" ") || "este carro";

  const [maxPrice, setMaxPrice] = useState(clampPrice(listing.cost.totalPt));
  const [countries, setCountries] = useState<CountryCode[]>([listing.country]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const noLimit = maxPrice >= PRICE_MAX;

  function toggleCountry(code: CountryCode) {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (countries.length === 0) {
      setError("Escolhe pelo menos um país de origem.");
      return;
    }
    const summary = noLimit ? nome : `${nome} · até ${formatEuro(maxPrice)}`;
    setSaving(true);
    setError(null);
    try {
      await createAlert({
        name: nome,
        criteria: summary,
        countries,
        maxPrice: noLimit ? undefined : maxPrice,
        make: make || undefined,
        model: model || undefined,
      });
      setSuccess(true);
    } catch (err) {
      // Nunca mostrar error.message cru ao cliente — ver CLAUDE.md.
      console.error("[alerta] falha ao criar:", err);
      setError("Não foi possível criar o alerta. Tenta outra vez.");
    } finally {
      setSaving(false);
    }
  }

  if (success) {
    return (
      <div className="flex flex-col items-start gap-3 rounded-[10px] border border-line bg-surface-2 p-4">
        <p className="flex items-center gap-2 text-sm font-medium text-good">
          <Check className="size-4 shrink-0" />
          Alerta criado — avisamos-te por email e no sino quando aparecer um igual.
        </p>
        <Button type="button" variant="outline" size="sm" onClick={onClose}>
          Fechar
        </Button>
      </div>
    );
  }

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-3 rounded-[10px] border border-line bg-surface-2 p-4"
    >
      <h3 className="text-sm font-semibold uppercase tracking-wide text-ink-soft">Novo alerta</h3>

      {/* O que vais vigiar — fixo, não editável (é este carro ou um igual) */}
      <div className="rounded-[8px] border border-line bg-surface p-3">
        <p className="text-xs text-ink-soft">Vais ser avisado sobre</p>
        <p className="font-display font-semibold">{nome}</p>
        <p className="mt-0.5 text-xs text-ink-soft">ou outro com as mesmas características.</p>
      </div>

      {/* Limite de custo final — slider, não caixa de número */}
      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between">
          <label htmlFor="alert-max-price" className="text-sm font-medium">
            Avisar-me até um custo final de
          </label>
          <span className={cn("tnum text-sm font-semibold", noLimit && "text-ink-soft")}>
            {noLimit ? "Sem limite" : formatEuro(maxPrice)}
          </span>
        </div>
        <input
          id="alert-max-price"
          type="range"
          min={PRICE_MIN}
          max={PRICE_MAX}
          step={PRICE_STEP}
          value={maxPrice}
          onChange={(e) => setMaxPrice(Number(e.target.value))}
          className="w-full cursor-pointer accent-amber"
        />
        <div className="tnum flex justify-between text-xs text-ink-soft">
          <span>{formatEuro(PRICE_MIN)}</span>
          <span>{formatEuro(PRICE_MAX)}+</span>
        </div>
      </div>

      {/* De que mercados de origem quer ser avisado */}
      <div>
        <span className="text-sm font-medium">De que países?</span>
        <p className="text-xs text-ink-soft">Só te avisamos de carros à venda nestes mercados.</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {COUNTRY_LIST.map((c) => {
            const active = countries.includes(c.code);
            return (
              <button
                key={c.code}
                type="button"
                onClick={() => toggleCountry(c.code)}
                aria-pressed={active}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
                  active
                    ? "border-petrol bg-petrol text-white"
                    : "border-line-strong text-ink-soft hover:text-ink",
                )}
              >
                <span aria-hidden>{c.flag}</span>
                {c.name}
              </button>
            );
          })}
        </div>
      </div>

      {error && (
        <p role="alert" className="rounded-[6px] bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
        <Button type="button" variant="ghost" size="sm" onClick={onClose} disabled={saving}>
          Cancelar
        </Button>
        <Button
          type="submit"
          variant="accent"
          size="sm"
          loading={saving}
          disabled={countries.length === 0}
        >
          Criar alerta
        </Button>
      </div>
    </form>
  );
}
