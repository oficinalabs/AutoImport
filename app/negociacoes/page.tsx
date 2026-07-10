import { NegotiationsView } from "@/components/negotiations-view";
import { getConversations } from "@/lib/data";

export default async function NegociacoesPage() {
  const conversations = await getConversations();
  return <NegotiationsView conversations={conversations} />;
}
