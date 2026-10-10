/**
 * Abre o portal do cliente da Polar (faturas, cartão, cancelar) para o stand da
 * sessão e devolve o URL. Só o dono.
 *
 * A chave é o `polar_customer_id` que o webhook gravou em `subscriptions`. Sem
 * ele o stand nunca passou por um checkout e não há portal para abrir — 404, e
 * a UI mostra "Subscrever" nesse caso, não este botão.
 */
import { db } from "@/db";
import { subscriptions } from "@/db/schema";
import { criarSessaoDoPortal, polarConfig } from "@/lib/billing";
import { donoDoStand } from "@/lib/billing-auth";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<NextResponse> {
  const cfg = polarConfig();
  if (!cfg) return NextResponse.json({ error: "indisponível" }, { status: 503 });

  try {
    const dono = await donoDoStand(request.headers);
    if (!dono.ok) return NextResponse.json({ error: "sem permissão" }, { status: dono.status });

    const [linha] = await db
      .select({ customerId: subscriptions.polarCustomerId })
      .from(subscriptions)
      .where(eq(subscriptions.standId, dono.standId))
      .limit(1);
    if (!linha?.customerId) {
      return NextResponse.json({ error: "sem subscrição" }, { status: 404 });
    }

    const url = await criarSessaoDoPortal(cfg, linha.customerId, new URL(request.url).origin);
    return NextResponse.json({ url });
  } catch (erro) {
    console.error("[polar] falha a abrir o portal", erro);
    return NextResponse.json({ error: "erro a abrir o portal" }, { status: 502 });
  }
}
