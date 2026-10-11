"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  DESPACHANTE_DEFAULT_EUR,
  PREPARATION_DEFAULT_EUR,
  TRANSPORT_COST_EUR,
  estimateLegalization,
} from "@/lib/cost-engine";
import { COUNTRY_LIST } from "@/lib/countries";
import { updateStandCosts } from "@/lib/data";
import { formatEuro } from "@/lib/format";
import { EMPTY_STAND_COSTS, type StandCostSettings } from "@/lib/stand-costs";
import type { CountryCode } from "@/lib/types";
import { DEFAULT_MARGIN_THRESHOLDS } from "@/lib/verdict";
import { Check, Pencil, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";

/**
 * "Os teus custos" (P09): o que o stand paga de facto, para a conta de cada
 * anúncio ser a dele e não a média. Campo vazio = usa a média (mostrada ao
 * lado). Só o dono edita — o servidor volta a verificar (lib/data.ts).
 */
export function StandCostsForm({
  settings,
  canEdit,
}: {
  settings: StandCostSettings | null;
  canEdit: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const s = settings ?? EMPTY_STAND_COSTS;

  if (editing) return <EditForm settings={s} onDone={() => setEditing(false)} />;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-bold">Os teus custos</h2>
          <p className="mt-1 text-sm text-ink-soft">
            A conta de cada anúncio usa estes valores. O que deixares em branco fica na média.
          </p>
        </div>
        {canEdit && (
          <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
            <Pencil className="size-3.5" />
            Editar
          </Button>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Transporte até Portugal
        </h3>
        <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COUNTRY_LIST.map((c) => (
            <ReadValue
              key={c.code}
              label={`${c.flag} ${c.name}`}
              value={s.transport[c.code]}
              media={TRANSPORT_COST_EUR[c.code]}
              mediaLabel="média, varia por região"
            />
          ))}
        </dl>
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <ReadValue
          label="Legalização (taxas)"
          value={s.legalization}
          media={estimateLegalization()}
        />
        <ReadValue label="Despachante" value={s.despachante} media={DESPACHANTE_DEFAULT_EUR} />
        <ReadValue
          label="Preparação e garantia"
          value={s.preparation}
          media={PREPARATION_DEFAULT_EUR}
        />
        <ReadValue
          label="Compensa a partir de"
          value={s.minMarginEur}
          media={DEFAULT_MARGIN_THRESHOLDS.compensaEur}
          mediaLabel="por omissão"
        />
        <div>
          <dt className="text-xs text-ink-soft">… e de</dt>
          <dd className="tnum mt-0.5 font-medium">
            {s.minMarginPct ?? DEFAULT_MARGIN_THRESHOLDS.compensaPct}% do preço PT
            {s.minMarginPct == null && (
              <span className="block text-xs font-normal text-ink-soft">por omissão</span>
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-ink-soft">N.º de IVA no VIES</dt>
          <dd className="mt-0.5 font-medium">{s.vatRegistered ? "Sim" : "Não"}</dd>
        </div>
      </dl>
      {!s.vatRegistered && (
        <p className="text-xs text-ink-soft">
          Sem n.º de IVA no VIES, nenhum carro é comprado com IVA dedutível: a conta usa o preço
          anunciado e o regime da margem.
        </p>
      )}
    </div>
  );
}

function ReadValue({
  label,
  value,
  media,
  mediaLabel = "média",
}: {
  label: string;
  value: number | null | undefined;
  media: number;
  mediaLabel?: string;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className="tnum mt-0.5 font-medium">
        {formatEuro(value ?? media)}
        {value == null && (
          <span className="block text-xs font-normal text-ink-soft">{mediaLabel}</span>
        )}
      </dd>
    </div>
  );
}

// ── Edição ──────────────────────────────────────────────────────

type Draft = {
  transport: Record<CountryCode, string>;
  legalization: string;
  despachante: string;
  preparation: string;
  minMarginEur: string;
  minMarginPct: string;
  vatRegistered: boolean;
};

const txt = (n: number | null | undefined) => (n == null ? "" : String(n));

/** "" → null (usa a média); o resto vai como número e o servidor valida. */
const num = (v: string): number | null => {
  const t = v.trim().replace(/\s/g, "").replace(",", ".");
  return t === "" ? null : Number(t);
};

function EditForm({ settings, onDone }: { settings: StandCostSettings; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft>({
    transport: Object.fromEntries(
      COUNTRY_LIST.map((c) => [c.code, txt(settings.transport[c.code])]),
    ) as Record<CountryCode, string>,
    legalization: txt(settings.legalization),
    despachante: txt(settings.despachante),
    preparation: txt(settings.preparation),
    minMarginEur: txt(settings.minMarginEur),
    minMarginPct: txt(settings.minMarginPct),
    vatRegistered: settings.vatRegistered,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set =
    (key: Exclude<keyof Draft, "transport" | "vatRegistered">) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setDraft((d) => ({ ...d, [key]: e.target.value }));
      setError(null);
    };
  const setTransport = (code: CountryCode) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setDraft((d) => ({ ...d, transport: { ...d.transport, [code]: e.target.value } }));
    setError(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const transport: Partial<Record<CountryCode, number>> = {};
    for (const c of COUNTRY_LIST) {
      const v = num(draft.transport[c.code]);
      if (v != null) transport[c.code] = v;
    }
    setSaving(true);
    setError(null);
    const result = await updateStandCosts({
      transport,
      legalization: num(draft.legalization),
      despachante: num(draft.despachante),
      preparation: num(draft.preparation),
      minMarginEur: num(draft.minMarginEur),
      minMarginPct: num(draft.minMarginPct),
      vatRegistered: draft.vatRegistered,
    });
    setSaving(false);

    if (result.ok) {
      onDone();
      router.refresh();
    } else setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Os teus custos</h2>
        <div className="flex gap-1.5">
          <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={saving}>
            <X className="size-3.5" />
            Cancelar
          </Button>
          <Button type="submit" variant="primary" size="sm" loading={saving}>
            <Check className="size-3.5" />
            Guardar
          </Button>
        </div>
      </div>
      <p className="text-sm text-ink-soft">
        Valores em euros por carro. Deixa em branco para usar a média.
      </p>

      <fieldset>
        <legend className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-soft">
          Transporte até Portugal
        </legend>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {COUNTRY_LIST.map((c) => (
            <EuroField
              key={c.code}
              id={`transport-${c.code}`}
              label={`${c.flag} ${c.name}`}
              value={draft.transport[c.code]}
              onChange={setTransport(c.code)}
              placeholder={TRANSPORT_COST_EUR[c.code]}
            />
          ))}
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <EuroField
          id="legalization"
          label="Legalização (taxas)"
          value={draft.legalization}
          onChange={set("legalization")}
          placeholder={estimateLegalization()}
        />
        <EuroField
          id="despachante"
          label="Despachante"
          value={draft.despachante}
          onChange={set("despachante")}
          placeholder={DESPACHANTE_DEFAULT_EUR}
        />
        <EuroField
          id="preparation"
          label="Preparação e garantia"
          value={draft.preparation}
          onChange={set("preparation")}
          placeholder={PREPARATION_DEFAULT_EUR}
        />
        <EuroField
          id="minMarginEur"
          label="Compensa a partir de (€)"
          value={draft.minMarginEur}
          onChange={set("minMarginEur")}
          placeholder={DEFAULT_MARGIN_THRESHOLDS.compensaEur}
        />
        <EuroField
          id="minMarginPct"
          label="… e de (% do preço PT)"
          value={draft.minMarginPct}
          onChange={set("minMarginPct")}
          placeholder={DEFAULT_MARGIN_THRESHOLDS.compensaPct}
          decimal
        />
      </div>

      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={draft.vatRegistered}
          onChange={(e) => setDraft((d) => ({ ...d, vatRegistered: e.target.checked }))}
          className="mt-0.5 size-4 accent-amber"
        />
        <span>
          O stand tem n.º de IVA válido no VIES
          <span className="block text-xs text-ink-soft">
            Sem ele, não se compra com IVA dedutível: a conta usa o preço anunciado.
          </span>
        </span>
      </label>

      {error && (
        <p role="alert" className="rounded-[6px] bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

function EuroField({
  id,
  label,
  value,
  onChange,
  placeholder,
  decimal,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  placeholder: number;
  decimal?: boolean;
}) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-xs text-ink-soft">
        {label}
      </label>
      <Input
        id={id}
        value={value}
        onChange={onChange}
        inputMode={decimal ? "decimal" : "numeric"}
        placeholder={String(placeholder)}
        className="tnum"
      />
    </div>
  );
}
