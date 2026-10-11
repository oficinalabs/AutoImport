/**
 * Chamadas à API da Polar que a app faz por iniciativa própria: abrir um
 * checkout e abrir o portal do cliente. O sentido inverso (a Polar a avisar-nos)
 * é o webhook — lib/polar-webhook.ts.
 *
 * `fetch` cru e não o `@polar-sh/sdk`: são dois POSTs com três campos cada, e o
 * SDK trazia uma dependência inteira para isso. Os nomes dos campos foram
 * confirmados nos tipos do `@polar-sh/sdk` 1.0.2 (API "2026-10":
 * `CheckoutCreate`, `CustomerSessionCustomerIDCreate`, `Checkout.url`,
 * `CustomerSession.customer_portal_url`).
 *
 * Puro de BD e de sessão — quem decide se o pedido pode ser feito são as rotas
 * (app/api/polar/{checkout,portal}/route.ts, via lib/billing-auth.ts). O `fetch`
 * entra por parâmetro para os testes não falarem com a Polar.
 */
import type { SubscriptionStatus } from "./types";

const SERVIDORES = {
  sandbox: "https://sandbox-api.polar.sh",
  production: "https://api.polar.sh",
} as const;

/** Versão da API com que os campos acima foram confirmados. */
const POLAR_VERSION = "2026-10";

export interface PolarConfig {
  token: string;
  productId: string;
  baseUrl: string;
}

/**
 * A configuração, ou null se faltar alguma coisa — e aí os botões ficam
 * desativados em vez de darem erro.
 *
 * O servidor por omissão é a **sandbox**: um ambiente mal configurado falha com
 * 401 (token de produção na sandbox), nunca cobra a sério sem alguém ter escrito
 * `POLAR_SERVER=production`.
 */
export function polarConfig(
  env: Record<string, string | undefined> = process.env,
): PolarConfig | null {
  const token = env.POLAR_ACCESS_TOKEN?.trim();
  const productId = env.POLAR_PRODUCT_ID?.trim();
  if (!token || !productId) return null;
  const servidor = env.POLAR_SERVER === "production" ? "production" : "sandbox";
  return { token, productId, baseUrl: SERVIDORES[servidor] };
}

export class PolarApiError extends Error {
  constructor(
    readonly status: number,
    readonly detalhe: string,
  ) {
    super(`Polar respondeu ${status}`);
  }
}

async function post(
  cfg: PolarConfig,
  caminho: string,
  corpo: unknown,
  fetchImpl: typeof fetch,
): Promise<Record<string, unknown>> {
  const res = await fetchImpl(`${cfg.baseUrl}${caminho}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "Polar-Version": POLAR_VERSION,
    },
    body: JSON.stringify(corpo),
    cache: "no-store",
  });
  if (!res.ok) {
    // O corpo vai para o log do servidor (pode trazer o motivo da Polar); ao
    // cliente só chega uma mensagem genérica (CLAUDE.md).
    throw new PolarApiError(res.status, (await res.text().catch(() => "")).slice(0, 500));
  }
  return (await res.json()) as Record<string, unknown>;
}

export interface PedidoDeCheckout {
  standId: string;
  email: string;
  /** Origem da app (https://…), para os URLs de regresso. */
  origem: string;
}

/**
 * Cria a sessão de checkout e devolve o URL para onde mandar o browser.
 *
 * - `metadata.stand_id` é o que o webhook lê para saber de que stand é a
 *   subscrição (`standIdDe` em lib/polar-webhook.ts). A Polar copia o metadata
 *   do checkout para a subscrição.
 * - `external_customer_id = standId` é a rede de segurança do mesmo webhook
 *   (`customer.external_id`) e faz com que um stand que volta a subscrever
 *   reutilize o mesmo cliente na Polar.
 */
export async function criarCheckout(
  cfg: PolarConfig,
  pedido: PedidoDeCheckout,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const checkout = await post(
    cfg,
    "/v1/checkouts/",
    {
      products: [cfg.productId],
      metadata: { stand_id: pedido.standId },
      external_customer_id: pedido.standId,
      customer_email: pedido.email,
      success_url: `${pedido.origem}/stand?checkout=ok`,
      return_url: `${pedido.origem}/stand`,
    },
    fetchImpl,
  );
  if (typeof checkout.url !== "string") throw new PolarApiError(502, "checkout sem url");
  return checkout.url;
}

/** Abre uma sessão do portal do cliente (faturas, cartão, cancelar). */
export async function criarSessaoDoPortal(
  cfg: PolarConfig,
  customerId: string,
  origem: string,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const sessao = await post(
    cfg,
    "/v1/customer-sessions/",
    { customer_id: customerId, return_url: `${origem}/stand` },
    fetchImpl,
  );
  if (typeof sessao.customer_portal_url !== "string") {
    throw new PolarApiError(502, "sessão sem customer_portal_url");
  }
  return sessao.customer_portal_url;
}

/** A partir de quantos dias do fim do trial aparece o aviso na barra. */
export const AVISO_TRIAL_DIAS = 5;

/**
 * Dias (arredondados para cima) até ao fim do trial, se faltarem
 * `AVISO_TRIAL_DIAS` ou menos; null fora do trial ou longe do fim. "0" não
 * aparece: com o trial acabado o estado já é `expirada`.
 */
export function diasParaAvisoDoTrial(
  status: SubscriptionStatus,
  fimIso: string,
  agora: Date = new Date(),
): number | null {
  if (status !== "trial") return null;
  const dias = Math.ceil((new Date(fimIso).getTime() - agora.getTime()) / 86_400_000);
  if (!Number.isFinite(dias) || dias < 1 || dias > AVISO_TRIAL_DIAS) return null;
  return dias;
}
