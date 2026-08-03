/**
 * Verificação e validação do webhook da Polar. Vive fora da rota porque um
 * `route.ts` do Next só pode exportar os handlers (GET/POST/…) e um punhado de
 * opções — qualquer outro export falha o build. E porque isto é testável
 * sozinho, sem HTTP.
 *
 * ⚠️ **Por confirmar contra a sandbox real da Polar** — ver o cabeçalho de
 * app/api/polar/webhook/route.ts.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Janela de tolerância do timestamp, em segundos — o valor do Standard
 * Webhooks. Sem ela, quem apanhar um pedido válido pode repeti-lo para sempre:
 * a assinatura continua a bater, é do mesmo corpo.
 */
export const TOLERANCIA_SEGUNDOS = 5 * 60;

/** Eventos de subscrição que mexem no acesso. Os outros ignoram-se. */
export const EVENTOS_DE_SUBSCRICAO = new Set([
  "subscription.created",
  "subscription.updated",
  "subscription.active",
  "subscription.canceled",
  "subscription.uncanceled",
  "subscription.past_due",
  "subscription.revoked",
]);

export const envelopeSchema = z.object({
  type: z.string().min(1),
  data: z.unknown(),
});

export const subscricaoSchema = z.object({
  id: z.string().min(1),
  status: z.string().min(1),
  /** ISO — fim do período pago. Null nos estados incompletos. */
  current_period_end: z.string().datetime({ offset: true }).nullish(),
  cancel_at_period_end: z.boolean().default(false),
  customer_id: z.string().nullish(),
  /** Posto no checkout. É por aqui que se sabe de que stand é a subscrição. */
  metadata: z.record(z.unknown()).default({}),
  customer: z.object({ external_id: z.string().nullish() }).partial().nullish(),
});

export type SubscricaoDaPolar = z.infer<typeof subscricaoSchema>;

/**
 * De que stand é esta subscrição. O caminho normal é o `metadata` posto no
 * checkout; o `external_id` do cliente é a rede de segurança para subscrições
 * criadas à mão no painel da Polar.
 */
export function standIdDe(sub: SubscricaoDaPolar): string | null {
  const doMetadata = sub.metadata.stand_id ?? sub.metadata.standId;
  if (typeof doMetadata === "string" && doMetadata) return doMetadata;
  const externo = sub.customer?.external_id;
  return typeof externo === "string" && externo ? externo : null;
}

/**
 * Standard Webhooks: assina-se `${id}.${timestamp}.${corpo}` com HMAC-SHA256 e
 * o resultado vai em base64. O header traz uma lista separada por espaços de
 * `v<versão>,<assinatura>` — mais do que uma durante a rotação do segredo, e
 * basta uma bater.
 *
 * A chave são os **bytes UTF-8 do segredo tal como está no ambiente**: o
 * `@polar-sh/sdk` faz `Buffer.from(secret,"utf-8").toString("base64")` antes de
 * entregar à biblioteca `standardwebhooks`, que faz `Buffer.from(secret,
 * "base64")` — as duas anulam-se.
 *
 * Os nomes `svix-*` são aceites porque são os do protocolo original e há
 * ferramentas de teste que ainda os mandam; a Polar usa os `webhook-*`.
 */
export function assinaturaValida(
  headers: Headers,
  corpo: string,
  secret: string,
  agora: number = Date.now(),
): boolean {
  const id = headers.get("webhook-id") ?? headers.get("svix-id");
  const timestamp = headers.get("webhook-timestamp") ?? headers.get("svix-timestamp");
  const assinaturas = headers.get("webhook-signature") ?? headers.get("svix-signature");
  if (!id || !timestamp || !assinaturas) return false;

  const segundos = Number(timestamp);
  if (!Number.isFinite(segundos)) return false;
  if (Math.abs(agora / 1000 - segundos) > TOLERANCIA_SEGUNDOS) return false;

  const esperada = createHmac("sha256", Buffer.from(secret, "utf-8"))
    .update(`${id}.${timestamp}.${corpo}`)
    .digest();

  for (const parte of assinaturas.split(" ")) {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) continue;
    const recebida = Buffer.from(valor, "base64");
    // timingSafeEqual rebenta com tamanhos diferentes; comparar o tamanho antes
    // não vaza nada — vem no header, é público.
    if (recebida.length === esperada.length && timingSafeEqual(recebida, esperada)) return true;
  }
  return false;
}
