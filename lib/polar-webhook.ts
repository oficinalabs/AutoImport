/**
 * Verificação e validação do webhook da Polar. Vive fora da rota porque um
 * `route.ts` do Next só pode exportar os handlers (GET/POST/…) e um punhado de
 * opções — qualquer outro export falha o build. E porque isto é testável
 * sozinho, sem HTTP.
 *
 * ⚠️ **Por confirmar contra a sandbox real da Polar** — ver o cabeçalho de
 * app/api/polar/webhook/route.ts. O formato foi conferido com o verificador do
 * `@polar-sh/sdk` 1.0.2 (`verifySignature`) e com os campos do `Subscription`
 * da API "2026-10".
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
 * A chave: a Polar mostra o segredo como texto e assina com os **bytes UTF-8**
 * desse texto (era o que o `@polar-sh/sdk` 0.x fazia, ao codificar em base64
 * antes de entregar à `standardwebhooks`, que voltava a descodificar). O SDK
 * 1.0.2 (`hmacKeys`) aceita também a forma clássica do Standard Webhooks —
 * `whsec_<base64>`, chave = bytes descodificados — e aqui faz-se o mesmo: um
 * segredo copiado de outra ferramenta de teste continua a verificar.
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

  const esperadas = chavesDoSegredo(secret).map((chave) =>
    createHmac("sha256", chave).update(`${id}.${timestamp}.${corpo}`).digest(),
  );

  for (const parte of assinaturas.split(" ")) {
    const [versao, valor] = parte.split(",");
    if (versao !== "v1" || !valor) continue;
    const recebida = Buffer.from(valor, "base64");
    for (const esperada of esperadas) {
      // timingSafeEqual rebenta com tamanhos diferentes; comparar o tamanho antes
      // não vaza nada — vem no header, é público.
      if (recebida.length === esperada.length && timingSafeEqual(recebida, esperada)) return true;
    }
  }
  return false;
}

/** As chaves HMAC a experimentar — ver o comentário de `assinaturaValida`. */
function chavesDoSegredo(secret: string): Buffer[] {
  const utf8 = Buffer.from(secret, "utf-8");
  const resto = secret.startsWith("whsec_") ? secret.slice(6) : secret;
  // Só se for base64 a sério: o Buffer.from ignora caracteres inválidos em
  // silêncio, e uma chave "meio descodificada" não pode entrar na lista.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(resto) || resto.length % 4 !== 0) return [utf8];
  const descodificada = Buffer.from(resto, "base64");
  return descodificada.length > 0 && !descodificada.equals(utf8) ? [utf8, descodificada] : [utf8];
}
