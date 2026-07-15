"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { updateStand } from "@/lib/data";
import { MAX_ADDRESS, MAX_NAME, checkStandFields } from "@/lib/stand-fields";
import type { Stand } from "@/lib/types";
import { Check, Pencil, X } from "lucide-react";
import { useState } from "react";

/**
 * Dados do stand: mostra em leitura, edita in-place. Só o dono edita —
 * o servidor volta a verificar (lib/data.ts), isto é só conveniência.
 */
export function StandForm({ stand, canEdit }: { stand: Stand; canEdit: boolean }) {
  const [editing, setEditing] = useState(false);

  if (!editing) {
    return (
      <div className="flex flex-col gap-4">
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-lg font-bold">Dados do stand</h2>
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing(true)}>
              <Pencil className="size-3.5" />
              Editar
            </Button>
          )}
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          <ReadField label="Nome" value={stand.name} />
          <ReadField label="NIF" value={stand.nif} numeric />
          <ReadField label="Morada" value={stand.address} />
          <ReadField label="Telefone" value={stand.phone} numeric />
        </dl>
      </div>
    );
  }

  return <EditForm stand={stand} onDone={() => setEditing(false)} />;
}

function ReadField({
  label,
  value,
  numeric,
}: {
  label: string;
  value: string;
  numeric?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-ink-soft">{label}</dt>
      <dd className={value ? `mt-0.5 font-medium ${numeric ? "tnum" : ""}` : "mt-0.5"}>
        {value || <span className="text-sm italic text-ink-soft">Por preencher</span>}
      </dd>
    </div>
  );
}

function EditForm({ stand, onDone }: { stand: Stand; onDone: () => void }) {
  const [values, setValues] = useState({
    name: stand.name,
    nif: stand.nif,
    address: stand.address,
    phone: stand.phone,
  });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = (key: keyof typeof values) => (e: React.ChangeEvent<HTMLInputElement>) => {
    setValues((v) => ({ ...v, [key]: e.target.value }));
    setError(null);
  };

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const local = checkStandFields(values);
    if (local) {
      setError(local);
      return;
    }

    setSaving(true);
    setError(null);
    const result = await updateStand(values);
    setSaving(false);

    if (result.ok) onDone();
    else setError(result.error);
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="font-display text-lg font-bold">Dados do stand</h2>
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

      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="name" label="Nome" required>
          <Input
            id="name"
            value={values.name}
            onChange={set("name")}
            maxLength={MAX_NAME}
            required
            autoFocus
          />
        </Field>
        <Field id="nif" label="NIF" hint="9 dígitos">
          <Input
            id="nif"
            value={values.nif}
            onChange={set("nif")}
            inputMode="numeric"
            placeholder="500 100 144"
            className="tnum"
          />
        </Field>
        <Field id="address" label="Morada" className="sm:col-span-2">
          <Input
            id="address"
            value={values.address}
            onChange={set("address")}
            maxLength={MAX_ADDRESS}
            placeholder="Rua, número, código postal, localidade"
          />
        </Field>
        <Field id="phone" label="Telefone">
          <Input
            id="phone"
            value={values.phone}
            onChange={set("phone")}
            inputMode="tel"
            placeholder="253 000 000"
            className="tnum"
          />
        </Field>
      </div>

      {error && (
        <p role="alert" className="rounded-[6px] bg-bad-soft px-3 py-2 text-sm text-bad">
          {error}
        </p>
      )}
    </form>
  );
}

function Field({
  id,
  label,
  hint,
  required,
  className,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div className={className}>
      <label htmlFor={id} className="mb-1 flex items-baseline gap-1.5 text-xs text-ink-soft">
        {label}
        {required && <span aria-hidden>*</span>}
        {hint && <span className="text-ink-soft/70">· {hint}</span>}
      </label>
      {children}
    </div>
  );
}
