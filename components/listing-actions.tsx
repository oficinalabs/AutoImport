"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { COUNTRY_LIST } from "@/lib/countries";
import { createAlert, toggleFavorite } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import type { CountryCode, Listing } from "@/lib/types";
import { cn } from "@/lib/utils";
import { BellPlus, Check, Heart, MessagesSquare, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Bloco de "Ações" do anúncio: favoritar + criar alerta (variante disponível),
 * ou o par próprio da variante indisponível (inalterado — ver docs/08).
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
    </div>
  );
}

/** Tem de bater certo com o `step` do input de preço (linha abaixo): o
 * preço final raramente é múltiplo de 500, e o input type="number" com
 * step bloqueia o submit em silêncio (sem disparar onSubmit) se o valor
 * não alinhar — arredondar para cima dá uma sugestão válida à primeira. */
const PRICE_STEP = 500;

function suggestedMaxPrice(totalPt: number): number {
  return Math.ceil(totalPt / PRICE_STEP) * PRICE_STEP;
}

function AlertForm({ listing, onClose }: { listing: Listing; onClose: () => void }) {
  const [make, setMake] = useState(listing.model.make);
  const [model, setModel] = useState(listing.model.model);
  const [maxPrice, setMaxPrice] = useState(String(suggestedMaxPrice(listing.cost.totalPt)));
  const [countries, setCountries] = useState<CountryCode[]>([listing.country]);
  const [saving, setSaving] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const nome = [make.trim(), model.trim()].filter(Boolean).join(" ");

  function toggleCountry(code: CountryCode) {
    setCountries((prev) =>
      prev.includes(code) ? prev.filter((c) => c !== code) : [...prev, code],
    );
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nome) return;
    const summary = [nome, maxPrice && `< ${formatEuro(Number(maxPrice))}`]
      .filter(Boolean)
      .join(" · ");
    setSaving(true);
    setError(null);
    try {
      await createAlert({
        name: nome,
        criteria: summary,
        countries,
        maxPrice: maxPrice ? Number(maxPrice) : undefined,
        make: make.trim() || undefined,
        model: model.trim() || undefined,
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
          Alerta criado — avisamos-te quando aparecer um igual.
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

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-make" className="text-sm font-medium">
            Marca
          </label>
          <Input
            id="alert-make"
            value={make}
            onChange={(e) => setMake(e.target.value)}
            placeholder="Ex.: BMW"
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="alert-model" className="text-sm font-medium">
            Modelo
          </label>
          <Input
            id="alert-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Ex.: Série 3"
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="alert-max-price" className="text-sm font-medium">
          Preço final máximo (€)
        </label>
        <Input
          id="alert-max-price"
          type="number"
          min="0"
          step="500"
          value={maxPrice}
          onChange={(e) => setMaxPrice(e.target.value)}
          placeholder="Ex.: 35000"
        />
      </div>

      <div>
        <span className="text-sm font-medium">Países</span>
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
        <Button type="submit" variant="accent" size="sm" loading={saving} disabled={!nome}>
          Criar alerta
        </Button>
      </div>
    </form>
  );
}
