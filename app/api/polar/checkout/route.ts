import { criarCheckout, polarConfig } from "@/lib/billing";
/**
 * Abre um checkout da Polar para o stand da sessão e devolve o URL para onde
 * mandar o browser (components/subscription-actions.tsx).
 *
 * Só o dono, e só quando não há já uma subscrição a correr (trial ou expirada):
 * quem está ativo, cancelado a meio do período ou em atraso resolve no portal —
 * um segundo checkout seria uma segunda cobrança.
 *
 * O estado da subscrição **não** se escreve aqui: só o webhook o faz, quando a
 * Polar confirmar o pagamento.
 */
import { donoDoStand } from "@/lib/billing-auth";
import { getStandQuery } from "@/lib/queries";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const cfg = polarConfig();
  if (!cfg) return NextResponse.json({ error: "indisponível" }, { status: 503 });

  try {
    const dono = await donoDoStand(request.headers);
    if (!dono.ok) return NextResponse.json({ error: "sem permissão" }, { status: dono.status });

    const stand = await getStandQuery(dono.standId);
    const estado = stand?.subscription.status;
    if (estado !== "trial" && estado !== "expirada") {
      return NextResponse.json({ error: "subscrição já existe" }, { status: 409 });
    }

    const url = await criarCheckout(cfg, {
      standId: dono.standId,
      email: dono.email,
      origem: new URL(request.url).origin,
    });
    return NextResponse.json({ url });
  } catch (erro) {
    // Detalhe só no log do servidor (CLAUDE.md).
    console.error("[polar] falha a criar o checkout", erro);
    return NextResponse.json({ error: "erro a abrir o pagamento" }, { status: 502 });
  }
}
