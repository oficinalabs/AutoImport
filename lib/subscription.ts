/**
 * Vocabulário da subscrição — puro, sem BD e sem rede.
 *
 * Vive à parte porque tem três leitores que não se conhecem: a query que
 * monta o `Stand` (lib/queries.ts), o webhook que escreve o estado
 * (app/api/polar/webhook/route.ts) e o gate da área autenticada
 * (components/subscription-gate.tsx). Se a tradução do vocabulário da Polar
 * vivesse no webhook, o gate ficava a depender de uma rota HTTP.
 */
import type { SubscriptionStatus } from "./types";

/**
 * Estados que a Polar manda no `subscription.status`. Retirados dos payloads de
 * `subscription.*` do polar-js (WebhookSubscription*Payload).
 */
export type PolarSubscriptionStatus =
  | "incomplete"
  | "incomplete_expired"
  | "trialing"
  | "active"
  | "past_due"
  | "canceled"
  | "unpaid";

/**
 * Polar → nosso. Não é 1-para-1 de propósito:
 *
 * - `incomplete*` — um checkout que nunca chegou a pagar. Não é "à espera", é
 *   "não há subscrição": sem acesso.
 * - `unpaid` cai em `em_atraso` com `past_due` — para o stand é a mesma coisa
 *   (o pagamento falhou), e separá-los só daria mais uma etiqueta a traduzir.
 * - `active` + `cancel_at_period_end` vira `cancelada`, senão a UI prometia
 *   "renova a X" a quem já cancelou.
 *
 * Nota: quem decide o acesso é o **fim do período**, não este estado — ver
 * `estadoEfetivo`.
 */
export function estadoDaPolar(
  status: string,
  cancelAtPeriodEnd: boolean,
): SubscriptionStatus | null {
  switch (status) {
    case "trialing":
      return "trial";
    case "active":
      return cancelAtPeriodEnd ? "cancelada" : "ativa";
    case "past_due":
    case "unpaid":
      return "em_atraso";
    case "canceled":
      return "cancelada";
    case "incomplete":
    case "incomplete_expired":
      return "expirada";
    default:
      // Estado novo do lado deles. Devolver null (e não adivinhar "ativa") é a
      // única resposta honesta: quem chama decide, e o registo do erro fica no
      // log do servidor.
      return null;
  }
}

/**
 * O estado que vale **agora**. O que está gravado é o que a Polar disse da
 * última vez; o tempo passa sem webhooks nenhuns, e uma subscrição cancelada
 * com o período terminado é, para todos os efeitos, uma subscrição expirada.
 *
 * Sem isto o gate dependia de a Polar nos avisar a horas — e a webhook que não
 * chega é a que dá acesso de graça para sempre.
 */
export function estadoEfetivo(
  estado: SubscriptionStatus,
  fimDoPeriodo: Date | null,
  agora: Date = new Date(),
): SubscriptionStatus {
  if (estado === "expirada") return "expirada";
  if (fimDoPeriodo && fimDoPeriodo.getTime() <= agora.getTime()) return "expirada";
  return estado;
}

/**
 * Quem entra na app. Só `expirada` fecha a porta: em atraso e cancelada ainda
 * têm período pago por gastar, e fechá-las antes disso seria cobrar um mês e
 * não o entregar.
 */
export function temAcesso(estado: SubscriptionStatus): boolean {
  return estado !== "expirada";
}
