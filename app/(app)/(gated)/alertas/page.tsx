import { AlertsView } from "@/components/alerts-view";
import { getAlerts } from "@/lib/data";

export default async function AlertasPage() {
  const alerts = await getAlerts();
  return <AlertsView initialAlerts={alerts} />;
}
