import { cn } from "@/lib/utils";
import { CircleAlert, RefreshCw } from "lucide-react";

/**
 * Quando os dados foram lidos pela última vez.
 *
 * Existe porque a produção esteve **sete dias** com dados velhos sem ninguém
 * dar por isso: a recolha vive num daemon na máquina do operador, a publicação
 * é um comando à mão, e a única data visível estava na landing — que a equipa
 * não abre. Quem está dentro da app todos os dias é quem tem de ver primeiro.
 *
 * Fica discreto enquanto está tudo bem e passa a aviso quando passa do limite.
 * Um indicador que grita sempre é um indicador que se aprende a ignorar; a
 * versão que grita a sério (e falha o workflow) é o `pipeline:frescura`.
 */

/** Igual ao do alarme (scripts/pipeline/check-freshness.ts): o pipeline corre
 *  uma vez por dia e 24 h dava falso positivo a qualquer atraso normal. */
const HORAS_LIMITE = 36;

export function FreshnessBadge({ lastSeenAt }: { lastSeenAt: string | null }) {
  // Sem leitura nenhuma não há nada de honesto a dizer — nem "atualizado", nem
  // um alarme sobre uma base que pode estar simplesmente vazia.
  if (!lastSeenAt) return null;

  const quando = new Date(lastSeenAt);
  if (Number.isNaN(quando.getTime())) return null;

  const horas = (Date.now() - quando.getTime()) / 3_600_000;
  const velho = horas > HORAS_LIMITE;

  const texto =
    horas < 1
      ? "agora mesmo"
      : horas < 24
        ? `há ${Math.floor(horas)} h`
        : `há ${Math.floor(horas / 24)} dias`;

  return (
    <span
      title={`Última leitura do pipeline: ${quando.toLocaleString("pt-PT")}`}
      className={cn(
        "hidden items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium md:inline-flex",
        velho ? "bg-amber/15 text-warn" : "text-ink-soft",
      )}
    >
      {velho ? (
        <CircleAlert className="size-3.5 shrink-0" />
      ) : (
        <RefreshCw className="size-3.5 shrink-0" />
      )}
      <span className="tnum">Dados {texto}</span>
    </span>
  );
}
