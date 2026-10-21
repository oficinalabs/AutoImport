"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { computeCostBreakdown } from "@/lib/cost-engine";
import type { TaxTables } from "@/lib/cost-engine/types";
import { COUNTRY_LIST } from "@/lib/countries";
import { formatEuro } from "@/lib/format";
import type { CountryCode, FuelType } from "@/lib/types";
import { Calculator } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

/**
 * Calculadora de ISV pública (sem conta). A conta corre toda no browser: as
 * tabelas fiscais chegam por prop, da página (cacheadas), e o motor é puro. Assim
 * nenhum clique vai à base de dados (o plano Free tem 5 GB/mês de egress) e não
 * há action pública para proteger com rate limiting.
 *
 * Mostra só o custo de pôr o carro cá. A margem (preço PT, IVA da revenda) é o
 * que a subscrição dá; a calculadora de dentro da app faz essa conta.
 */

const FUELS: { value: FuelType; label: string }[] = [
  { value: "gasolina", label: "Gasolina" },
  { value: "diesel", label: "Gasóleo" },
  { value: "híbrido", label: "Híbrido" },
  { value: "phev", label: "Híbrido plug-in" },
  { value: "elétrico", label: "Elétrico" },
];

interface Fields {
  country: CountryCode;
  fuel: FuelType;
  price: string;
  displacementCc: string;
  co2: string;
  firstRegistration: string;
}

type Errors = Partial<Record<keyof Fields, string>>;

const EMPTY: Fields = {
  country: "DE",
  fuel: "gasolina",
  price: "",
  displacementCc: "",
  co2: "",
  firstRegistration: "",
};

/** "12 500", "12.500" ou "12500" → 12500. */
function inteiro(raw: string): number | null {
  const n = Number(raw.replace(/[\s.]/g, "").replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

function validar(f: Fields, now: Date) {
  const errors: Errors = {};
  const price = inteiro(f.price);
  if (price == null || price < 500 || price > 2_000_000)
    errors.price = "Indica o preço do anúncio em euros.";
  const ev = f.fuel === "elétrico";
  const cc = ev ? undefined : inteiro(f.displacementCc);
  const co2 = ev ? undefined : inteiro(f.co2);
  if (!ev && (cc == null || cc < 500 || cc > 8000))
    errors.displacementCc = "Indica a cilindrada (ex.: 1998).";
  if (!ev && (co2 == null || co2 > 600)) errors.co2 = "Indica o CO₂ em g/km (ex.: 142).";
  const reg = f.firstRegistration ? new Date(f.firstRegistration) : null;
  if (!reg || Number.isNaN(reg.getTime()) || reg > now || reg.getFullYear() < 1950)
    errors.firstRegistration = "Indica a data da 1.ª matrícula.";
  if (Object.keys(errors).length > 0) return { ok: false as const, errors };
  return {
    ok: true as const,
    input: {
      originPrice: price as number,
      fuel: f.fuel,
      displacementCc: cc ?? undefined,
      co2: co2 ?? undefined,
      firstRegistration: reg as Date,
      country: f.country,
      referenceDate: now,
    },
  };
}

export function PublicIsvCalculator({ tables }: { tables: TaxTables }) {
  const [fields, setFields] = useState<Fields>(EMPTY);
  const [errors, setErrors] = useState<Errors>({});
  const [result, setResult] = useState<ReturnType<typeof computeCostBreakdown> | null>(null);

  const set =
    (key: keyof Fields) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      setFields((f) => ({ ...f, [key]: e.target.value }));
      setErrors((er) => ({ ...er, [key]: undefined }));
    };

  function calcular(e: React.FormEvent) {
    e.preventDefault();
    const v = validar(fields, new Date());
    if (!v.ok) {
      setErrors(v.errors);
      setResult(null);
      return;
    }
    setErrors({});
    setResult(computeCostBreakdown(v.input, tables));
  }

  const ev = fields.fuel === "elétrico";

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <form
        onSubmit={calcular}
        noValidate
        className="flex flex-col gap-4 rounded-[10px] border border-line bg-surface p-4 sm:p-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="country" label="País de origem">
            <Select id="country" value={fields.country} onChange={set("country")}>
              {COUNTRY_LIST.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="price" label="Preço do anúncio (€)" error={errors.price}>
            <Input id="price" inputMode="numeric" value={fields.price} onChange={set("price")} />
          </Field>
          <Field id="fuel" label="Combustível">
            <Select id="fuel" value={fields.fuel} onChange={set("fuel")}>
              {FUELS.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </Select>
          </Field>
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
              <Field
                id="co2"
                label="CO₂ (g/km)"
                hint="Está no certificado de conformidade ou no anúncio."
                error={errors.co2}
              >
                <Input id="co2" inputMode="numeric" value={fields.co2} onChange={set("co2")} />
              </Field>
            </>
          )}
        </div>
        <Button type="submit" variant="accent" className="self-start">
          <Calculator />
          Calcular
        </Button>
      </form>

      <div className="flex flex-col gap-4">
        {result ? (
          <Resultado result={result} year={tables.year} />
        ) : (
          <p className="rounded-[10px] border border-dashed border-line p-5 text-sm text-ink-soft">
            Preenche os dados do anúncio para veres o ISV e o custo de pôr o carro em Portugal.
          </p>
        )}
        <div className="rounded-[10px] border border-line bg-surface p-5 text-sm">
          <p className="font-semibold">Tens um stand?</p>
          <p className="mt-1 text-ink-soft">
            O AutoImport faz esta conta a milhares de anúncios da Europa, compara com o preço em
            Portugal e mostra a margem que te fica depois do IVA.
          </p>
          <Link
            href="/registar"
            className="mt-3 inline-block font-medium text-petrol-ink hover:underline"
          >
            Experimentar 30 dias grátis
          </Link>
        </div>
      </div>
    </div>
  );
}

function Resultado({
  result,
  year,
}: { result: ReturnType<typeof computeCostBreakdown>; year: number }) {
  const { breakdown: b, isvDetail } = result;
  const linhas = [
    { label: "Preço do anúncio", value: b.originPrice },
    { label: "Transporte (média do país)", value: b.transport },
    { label: "ISV", value: b.isv },
    { label: "IUC (1.º ano)", value: b.iuc },
    { label: "Legalização e despachante", value: b.legalization },
  ];
  return (
    <div className="rounded-[10px] border border-line bg-surface p-5" aria-live="polite">
      <p className="text-sm text-ink-soft">ISV estimado</p>
      <p className="tnum text-3xl font-bold">{formatEuro(b.isv)}</p>
      <dl className="mt-4 flex flex-col text-sm">
        {linhas.map((l) => (
          <div key={l.label} className="flex justify-between gap-3 border-b border-line py-2">
            <dt className="text-ink-soft">{l.label}</dt>
            <dd className="tnum font-medium">{formatEuro(l.value)}</dd>
          </div>
        ))}
        <div className="flex justify-between gap-3 pt-3">
          <dt className="font-semibold">Custo estimado em Portugal</dt>
          <dd className="tnum font-bold">{formatEuro(b.totalPt)}</dd>
        </div>
      </dl>
      {isvDetail.assumptions.length > 0 && (
        <ul className="mt-4 list-disc pl-5 text-xs text-ink-soft">
          {isvDetail.assumptions.map((a) => (
            <li key={a}>{a}</li>
          ))}
        </ul>
      )}
      <p className="mt-4 text-xs text-ink-soft">
        Estimativa com as tabelas de {year}. Quem fixa o ISV é a Alfândega. Não inclui IVA: a conta
        assume um carro usado em regime da margem ou de particular.
      </p>
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
