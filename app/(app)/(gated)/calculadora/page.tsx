import { CalculatorForm } from "@/components/calculator-form";
import {
  type CalculatorFields,
  type CalculatorResponse,
  EMPTY_FIELDS,
  type LookupResponse,
  findListingByUrl,
  runCalculator,
} from "@/lib/calculator";

// As duas Server Actions da calculadora. A lógica (sessão, validação, tabelas,
// procura) vive em lib/calculator.ts; aqui só se marca a fronteira.
async function calcular(fields: CalculatorFields): Promise<CalculatorResponse> {
  "use server";
  return runCalculator(fields);
}

async function procurar(url: string): Promise<LookupResponse> {
  "use server";
  return findListingByUrl(url);
}

export default function CalculadoraPage() {
  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold">Calculadora</h1>
        <p className="mt-1 text-sm text-ink-soft">
          Faz a conta de um carro que não está na montra: custo de o pôr cá, IVA a liquidar na
          revenda e margem que te fica.
        </p>
      </div>
      <CalculatorForm initial={EMPTY_FIELDS} calcular={calcular} procurar={procurar} />
    </div>
  );
}
