/**
 * Webhook da Polar — o único sítio que escreve o estado real da subscrição.
 *
 * É o primeiro route handler não-auth do projeto. Regras (docs/03-BACKEND.md):
 * verificar assinatura, validar com Zod, responder rápido, nunca devolver
 * detalhe de erro ao cliente (CLAUDE.md).
 *
 * ⚠️ **ESQUELETO, por confirmar contra a sandbox real da Polar.** Não há
 * credenciais neste ambiente, portanto nada disto foi trocado com a Polar a
 * sério. O que está implementado é o **Standard Webhooks**
 * (standardwebhooks.com), que é o que a Polar usa — os detalhes da assinatura e
 * a cadeia de codificações do segredo estão em lib/polar-webhook.ts. Se a
 * verificação falhar na sandbox, é aí que se olha.
 *
 * O que este ficheiro NÃO faz (de propósito, não por esquecimento): não cria
 * checkouts nem abre o portal de faturação. Isso precisa do POLAR_ACCESS_TOKEN
 * e de produtos criados do lado deles; enquanto não existirem, o botão "Gerir
 * subscrição" em /stand fica honestamente desativado.
 */
import { db } from "@/db";
import { organization, subscriptions } from "@/db/schema";
import {
  EVENTOS_DE_SUBSCRICAO,
  assinaturaValida,
  envelopeSchema,
  standIdDe,
  subscricaoSchema,
} from "@/lib/polar-webhook";
import { estadoDaPolar } from "@/lib/subscription";
import type { SubscriptionStatus } from "@/lib/types";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

// Assina-se o corpo cru: nada de cache, nada de pré-render.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.POLAR_WEBHOOK_SECRET;
  // Fail-closed. Um webhook sem verificação é um endpoint onde qualquer pessoa
  // se põe com subscrição ativa — 503 e não se escreve nada.
  if (!secret) {
    console.error("[polar] POLAR_WEBHOOK_SECRET ausente — webhook recusado sem escrever nada");
    return NextResponse.json({ error: "indisponível" }, { status: 503 });
  }

  const corpo = await request.text();
  if (!assinaturaValida(request.headers, corpo, secret)) {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 401 });
  }

  const envelope = envelopeSchema.safeParse(parseJson(corpo));
  if (!envelope.success) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  // 202: recebido e descartado de propósito. Devolver erro fazia a Polar
  // reentregar para sempre um evento que nunca nos vai interessar.
  if (!EVENTOS_DE_SUBSCRICAO.has(envelope.data.type)) {
    return NextResponse.json({ ignorado: true }, { status: 202 });
  }

  const dados = subscricaoSchema.safeParse(envelope.data.data);
  if (!dados.success) {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const sub = dados.data;

  const standId = standIdDe(sub);
  if (!standId) {
    console.error(`[polar] subscrição ${sub.id} sem stand identificável — nada escrito`);
    return NextResponse.json({ ignorado: true }, { status: 202 });
  }

  // `revoked` é a Polar a dizer "corta já", independentemente do status que
  // venha no objeto. Os restantes traduzem-se pelo vocabulário partilhado.
  const estado: SubscriptionStatus | null =
    envelope.data.type === "subscription.revoked"
      ? "expirada"
      : estadoDaPolar(sub.status, sub.cancel_at_period_end);
  if (!estado) {
    console.error(`[polar] status desconhecido "${sub.status}" na subscrição ${sub.id}`);
    return NextResponse.json({ ignorado: true }, { status: 202 });
  }

  try {
    const [stand] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.id, standId))
      .limit(1);
    // Stand apagado, ou um id que nunca foi nosso. Não há onde escrever, e
    // reentregar não muda isso.
    if (!stand) {
      console.error(`[polar] stand ${standId} não existe — subscrição ${sub.id} ignorada`);
      return NextResponse.json({ ignorado: true }, { status: 202 });
    }

    const valores = {
      standId,
      polarCustomerId: sub.customer_id ?? null,
      polarSubscriptionId: sub.id,
      status: estado,
      currentPeriodEnd: sub.current_period_end ? new Date(sub.current_period_end) : null,
      cancelAtPeriodEnd: sub.cancel_at_period_end,
    };

    // Uma linha por stand: o último evento manda. A Polar não garante ordem, e
    // um `updated` atrasado a chegar depois de um `revoked` reabria o acesso —
    // o que salva o produto disso é o `estadoEfetivo` (lib/subscription.ts),
    // que expira sozinho quando o período passa. Ordenar por `modified_at` é a
    // melhoria óbvia se isto alguma vez incomodar.
    await db
      .insert(subscriptions)
      .values(valores)
      .onConflictDoUpdate({
        target: subscriptions.standId,
        set: { ...valores, updatedAt: new Date() },
      });
  } catch (erro) {
    // Detalhe só no log do servidor (CLAUDE.md). 500 para a Polar reentregar.
    console.error("[polar] falha a gravar a subscrição", erro);
    return NextResponse.json({ error: "erro a processar" }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

function parseJson(texto: string): unknown {
  try {
    return JSON.parse(texto);
  } catch {
    return null;
  }
}
