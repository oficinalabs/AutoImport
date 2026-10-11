"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { VerdictBadge } from "@/components/verdict-badge";
import type {
  CalculatorFields,
  CalculatorResponse,
  CalculatorResult,
  FieldErrors,
  LookupResponse,
} from "@/lib/calculator";
import { COUNTRY_LIST } from "@/lib/countries";
import { formatEuro } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Calculator, Info, Link2 } from "lucide-react";
import Link from "next/link";
import { useState, useTransition } from "react";

// Só tipos de lib/calculator: os valores de lá puxariam a base de dados para o
// bundle do browser. Os valores iniciais chegam por prop, da página.

const FUELS: { value: string; label: string }[] = [
  { value: "gasolina", label: "Gasolina" },
  { value: "diesel", label: "Gasóleo" },
  { value: "híbrido", label: "Híbrido" },
  { value: "phev", label: "Híbrido plug-in" },
  { value: "elétrico", label: "Elétrico" },
];

const VAT_REGIMES: { value: string; label: string }[] = [
  { value: "margem", label: "Regime da margem / não diz" },
  { value: "dedutivel", label: "IVA dedutível" },
  { value: "particular", label: "Particular" },
];

type LinkState =
  | { kind: "idle" }
  | { kind: "found"; title: string; id: string; hasEstimate: boolean; unavailable: boolean }
  | { kind: "message"; text: string };

export function CalculatorForm({
  initial,
  calcular,
  procurar,
}: {
  initial: CalculatorFields;
  calcular: (fields: CalculatorFields) => Promise<CalculatorResponse>;
  procurar: (url: string) => Promise<LookupResponse>;
}) {
  const [fields, setFields] = useState<CalculatorFields>(initial);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<CalculatorResult | null>(null);
  const [url, setUrl] = useState("");
  const [link, setLink] = useState<LinkState>({ kind: "idle" });
  const [calculating, startCalc] = useTransition();
  const [searching, startSearch] = useTransition();

  const set =
    (key: keyof CalculatorFields) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFields((f) => ({ ...f, [key]: e.target.value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) return;
    startSearch(async () => {
      const r = await procurar(url);
      if (r.status === "found") {
        setFields(r.fields);
        setErrors({});
        setResult(null);
        setLink({ kind: "found", ...r.listing });
      } else if (r.status === "not_found") {
        setLink({
          kind: "message",
          text: "Ainda não temos este anúncio. Preenche os dados à mão a partir da página dele.",
        });
      } else if (r.status === "invalid") {
        setLink({ kind: "message", text: "Isto não parece um link de um anúncio." });
      } else {
        setLink({ kind: "message", text: "Não conseguimos procurar agora. Tenta mais tarde." });
      }
    });
  }

  function handleCalculate(e: React.FormEvent) {
    e.preventDefault();
    setMessage(null);
    startCalc(async () => {
      const r = await calcular(fields);
      if (r.ok) {
        setErrors({});
        setResult(r.result);
      } else {
        setErrors(r.errors ?? {});
        setMessage(r.message ?? null);
        setResult(null);
      }
    });
  }

  const ev = fields.fuel === "elétrico";

  return (
    <div className="flex flex-col gap-5">
      {/* Por link: só anúncios que já temos na base (nunca vamos à fonte). */}
      <form onSubmit={handleLookup} className="flex max-w-2xl flex-col gap-2">
        <label htmlFor="calc-url" className="text-sm font-medium">
          Link do anúncio
        </label>
        <div className="flex gap-2">
          <Input
            id="calc-url"
            type="url"
            inputMode="url"
            placeholder="https://…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
          />
          <Button type="submit" variant="outline" loading={searching}>
            <Link2 />
            Procurar
          </Button>
        </div>
        {link.kind === "found" && (
          <p className="text-sm text-ink-soft">
            Encontrámos <span className="font-medium text-ink">{link.title}</span>
            {link.unavailable && " (já não aparece na fonte)"}. Preenchemos o formulário com os
            dados que temos.{" "}
            {link.hasEstimate && (
              <Link
                href={`/anuncio/${link.id}`}
                className="font-medium text-petrol-ink hover:underline"
              >
                Ver a ficha
              </Link>
            )}
          </p>
        )}
        {link.kind === "message" && <p className="text-sm text-ink-soft">{link.text}</p>}
      </form>

      <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
        <form
          onSubmit={handleCalculate}
          noValidate
          className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="country" label="País de origem" error={errors.country}>
              <Select id="country" value={fields.country} onChange={set("country")}>
                {COUNTRY_LIST.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </Field>
            <Field
              id="postalCode"
              label="Código postal do vendedor"
              hint="Opcional. Afina o transporte."
              error={errors.postalCode}
            >
              <Input id="postalCode" value={fields.postalCode} onChange={set("postalCode")} />
            </Field>
            <Field id="price" label="Preço do anúncio (€)" error={errors.price}>
              <Input id="price" inputMode="numeric" value={fields.price} onChange={set("price")} />
            </Field>
            <Field id="vatRegime" label="IVA no anúncio" error={errors.vatRegime}>
              <Select id="vatRegime" value={fields.vatRegime} onChange={set("vatRegime")}>
                {VAT_REGIMES.map((v) => (
                  <option key={v.value} value={v.value}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>
            {fields.vatRegime === "dedutivel" && (
              <Field
                id="priceNet"
                label="Preço sem IVA (€)"
                hint="Opcional. Se o anúncio o mostrar (Netto, HTVA, excl. BTW)."
                error={errors.priceNet}
              >
                <Input
                  id="priceNet"
                  inputMode="numeric"
                  value={fields.priceNet}
                  onChange={set("priceNet")}
                />
              </Field>
            )}
            <Field id="fuel" label="Combustível" error={errors.fuel}>
              <Select id="fuel" value={fields.fuel} onChange={set("fuel")}>
                {FUELS.map((f) => (
                  <option key={f.value} value={f.value}>
                    {f.label}
                  </option>
                ))}
              </Select>
            </Field>
            {!ev && (
              <>
                <Field id="displacementCc" label="Cilindrada (cm³)" error={errors.displacementCc}>
                  <Input
                    id="displacementCc"
                    inputMode="numeric"
                    value={fields.displacementCc}
                    onChange={set("displacementCc")}
                  />
                </Field>
                <Field id="co2" label="CO₂ (g/km)" error={errors.co2}>
                  <Input id="co2" inputMode="numeric" value={fields.co2} onChange={set("co2")} />
                </Field>
              </>
            )}
            <Field
              id="firstRegistration"
              label="Data da 1.ª matrícula"
              error={errors.firstRegistration}
            >
              <Input
                id="firstRegistration"
                type="date"
                value={fields.firstRegistration}
                onChange={set("firstRegistration")}
              />
            </Field>
            <Field id="km" label="Quilómetros" error={errors.km}>
              <Input id="km" inputMode="numeric" value={fields.km} onChange={set("km")} />
            </Field>
            <Field
              id="ptPrice"
              label="Preço de venda em Portugal (€)"
              hint="O preço a que contas vender, com IVA."
              error={errors.ptPrice}
            >
              <Input
                id="ptPrice"
                inputMode="numeric"
                value={fields.ptPrice}
                onChange={set("ptPrice")}
              />
            </Field>
          </div>
          {message && (
            <p role="alert" className="text-sm text-bad">
              {message}
            </p>
          )}
          <Button type="submit" variant="accent" loading={calculating} className="self-start">
            <Calculator />
            Calcular
          </Button>
        </form>

        {result ? (
          <ResultPanel result={result} />
        ) : (
          <div className="flex flex-col items-center justify-center gap-2 rounded-[10px] border border-dashed border-line-strong p-8 text-center">
            <Calculator className="size-8 text-ink-soft" />
            <p className="text-sm text-ink-soft">
              Preenche os dados do carro e carrega em Calcular.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Field({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      {children}
      {error ? (
        <p className="text-xs text-bad">{error}</p>
      ) : (
        hint && <p className="text-xs text-ink-soft">{hint}</p>
      )}
    </div>
  );
}

function Select(props: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      {...props}
      className="h-10 w-full rounded-[6px] border border-line-strong bg-surface px-3 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
    />
  );
}

function ResultPanel({ result }: { result: CalculatorResult }) {
  const { deal } = result;
  const dedutivel = deal.vatRegime === "dedutivel";
  const lines: { label: string; value: number }[] = [
    { label: dedutivel ? "Preço sem IVA" : "Preço na origem", value: deal.originPriceNet },
    { label: "Transporte", value: deal.transport },
    { label: "ISV", value: deal.isv },
    { label: "IUC (1.º ano)", value: deal.iuc },
    { label: "Legalização", value: deal.legalization },
    { label: "Despachante", value: deal.despachante },
    { label: "Preparação e garantia", value: deal.preparation },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-[10px] border border-line bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs uppercase tracking-wide text-ink-soft">Margem bruta</div>
            <div
              className={cn(
                "tnum font-display text-2xl font-bold",
                deal.grossMargin < 0 && "text-bad",
              )}
            >
              {formatEuro(deal.grossMargin)}
            </div>
            <div className="mt-1 text-xs text-ink-soft">
              {deal.grossMarginPct.toFixed(1).replace(".", ",")}% do preço de venda
            </div>
          </div>
          <VerdictBadge verdict={result.verdict} />
        </div>
      </div>

      <div className="rounded-[10px] border border-line bg-surface p-4 sm:p-5">
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-soft">
          A conta
        </h3>
        <dl className="flex flex-col text-sm">
          {lines.map((l) => (
            <Row key={l.label} label={l.label} value={l.value} />
          ))}
          <Row label="Custo total em Portugal" value={deal.totalPt} strong />
          <Row label="Preço de venda" value={result.ptPrice} />
          <Row
            label={dedutivel ? "IVA a liquidar (23%)" : "IVA sobre a margem"}
            value={-deal.outputVat}
          />
          <Row label="Custo total" value={-deal.totalPt} />
          <Row label="Margem bruta" value={deal.grossMargin} strong />
        </dl>
        <p className="mt-3 text-xs text-ink-soft">
          {dedutivel
            ? "Compra sem IVA com o teu número de IVA; revenda em regime normal."
            : "Compra com o IVA da origem incluído; revenda em regime da margem."}{" "}
          Tabelas de impostos de {result.taxYear}
          {result.provisional && " (provisórias, até o Orçamento sair em Diário da República)"}.
          Confirma o ISV na Autoridade Tributária antes de fechar negócio.
        </p>
      </div>

      {result.notes.length > 0 && (
        <ul className="flex flex-col gap-2 rounded-[10px] border border-line bg-surface-2 p-4 text-xs text-ink-soft">
          {result.notes.map((n) => (
            <li key={n} className="flex gap-2">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {n}
            </li>
          ))}
        </ul>
      )}
      {result.deal.vatDeposit > 0 && (
        <p className="text-xs text-ink-soft">
          Caução de IVA estimada: <span className="tnum">{formatEuro(deal.vatDeposit)}</span>
        </p>
      )}
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: number; strong?: boolean }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between border-b border-line py-2 last:border-0",
        strong && "font-semibold",
      )}
    >
      <dt className={strong ? "" : "text-ink-soft"}>{label}</dt>
      <dd className="tnum font-mono">{formatEuro(value)}</dd>
    </div>
  );
}
