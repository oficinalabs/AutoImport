import { getStand } from "@/lib/data";
import { temAcesso } from "@/lib/subscription";
import { redirect } from "next/navigation";

/**
 * Gate da subscrição. Com o acesso expirado, a app fecha-se e o stand vai parar
 * a /stand — que é onde estão os dados da conta e (quando a Polar estiver
 * ligada) o botão de reativar. Os Termos prometem conta **suspensa**, não
 * eliminada: nada se apaga, só se deixa de entrar.
 *
 * **Porque é que isto não está no `app/(app)/layout.tsx`**, que era o sítio
 * óbvio: um layout do App Router não sabe que rota está a servir. Não há
 * pathname em Server Components e o `headers()` não o traz (confirmado neste
 * projeto: numa `page.tsx` de sonda, os headers de um pedido a /probe-headers
 * eram host, user-agent, accept e os x-forwarded-*, e mais nada). Sem saber a
 * rota, o layout de `(app)` também redirecionaria o próprio /stand — e o
 * redirect ciclava, deixando o cliente sem forma de pagar.
 *
 * A alternativa era o `middleware.ts`, mas esse corre no Edge e só vê o cookie:
 * não fala com a base de dados, logo não sabe o estado da subscrição.
 *
 * A saída é um **grupo de rotas aninhado**: as rotas fechadas vivem em
 * `app/(app)/(gated)/`, e é o `layout.tsx` DESSE grupo que monta este
 * componente. Os parênteses não entram no URL — `/painel` continua `/painel` —
 * e o `(app)/layout.tsx` continua a envolver tudo com a barra de topo, `/stand`
 * incluída. Um só sítio decide quem está fechado.
 *
 * Isto **falha fechado**, que é o que interessa numa porta: uma rota nova criada
 * onde as outras vivem fica automaticamente atrás do gate. Só quem for
 * deliberadamente posto fora de `(gated)` é que escapa — hoje, e só, o `/stand`:
 * é o destino do redirect, e fechá-lo ciclava, deixando o cliente sem forma de
 * pagar. A landing, as páginas legais e os ecrãs de auth vivem fora de `(app)` e
 * nunca estiveram cá dentro.
 */
export default async function SubscriptionGate({ children }: { children: React.ReactNode }) {
  const stand = await getStand();
  // Sem stand não há subscrição para avaliar (sessão inválida, ou utilizador
  // sem organização): quem trata disso é a página, com o seu estado honesto.
  if (stand && !temAcesso(stand.subscription.status)) redirect("/stand");
  return <>{children}</>;
}
