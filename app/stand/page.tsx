import { Building2, Mail, MapPin, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getStand } from "@/lib/data";
import { formatDate, formatEuroCents } from "@/lib/format";

const SUB_LABEL = {
  trial: { label: "Trial (1.º mês grátis)", className: "bg-good-soft text-good" },
  ativa: { label: "Ativa", className: "bg-good-soft text-good" },
  expirada: { label: "Expirada", className: "bg-bad-soft text-bad" },
};

export default async function StandPage() {
  const stand = await getStand();
  const sub = SUB_LABEL[stand.subscription.status];

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Stand / Perfil</h1>

      <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
        <div className="flex flex-col gap-6">
          {/* Dados do stand */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Dados do stand</CardTitle>
              <Button variant="outline" size="sm">
                Editar
              </Button>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2">
              <Field icon={Building2} label="Nome">
                {stand.name}
              </Field>
              <Field icon={MapPin} label="NIF">
                <span className="tnum">{stand.nif}</span>
              </Field>
              <Field icon={MapPin} label="Morada">
                {stand.address}
              </Field>
              <Field icon={Phone} label="Telefone">
                <span className="tnum">{stand.phone}</span>
              </Field>
            </CardContent>
          </Card>

          {/* Equipa */}
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle>Equipa</CardTitle>
              <Button variant="outline" size="sm">
                Convidar
              </Button>
            </CardHeader>
            <CardContent className="flex flex-col gap-2">
              {stand.members.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-[8px] border border-line p-3"
                >
                  <span className="flex size-9 items-center justify-center rounded-full bg-steel/20 text-sm font-semibold text-steel">
                    {m.name
                      .split(" ")
                      .map((n) => n[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium">{m.name}</div>
                    <div className="flex items-center gap-1 text-xs text-ink-soft">
                      <Mail className="size-3" />
                      {m.email}
                    </div>
                  </div>
                  <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-medium capitalize text-ink-soft">
                    {m.role === "owner" ? "Dono" : "Colaborador"}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Subscrição */}
        <Card className="h-fit">
          <CardHeader>
            <CardTitle>Subscrição</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            <span
              className={`inline-flex w-fit rounded-full px-2.5 py-1 text-xs font-semibold ${sub.className}`}
            >
              {sub.label}
            </span>
            <div>
              <div className="tnum font-display text-3xl font-bold">
                {formatEuroCents(stand.subscription.pricePerMonth)}
                <span className="text-base font-medium text-ink-soft">/mês</span>
              </div>
              <p className="mt-1 text-sm text-ink-soft">
                {stand.subscription.status === "trial" ? "Trial termina" : "Renova"} a{" "}
                {formatDate(stand.subscription.renewsAt)}.
              </p>
            </div>
            <Button variant="primary">Gerir subscrição</Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Field({
  icon: Icon,
  label,
  children,
}: {
  icon: typeof Building2;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-ink-soft">
        <Icon className="size-3.5" />
        {label}
      </div>
      <div className="mt-0.5 font-medium">{children}</div>
    </div>
  );
}
