import { AlertsView } from "@/components/alerts-view";
import { getAlertModels, getAlerts } from "@/lib/data";

export default async function AlertasPage() {
  const [alerts, models] = await Promise.all([getAlerts(), getAlertModels()]);
  return <AlertsView initialAlerts={alerts} models={models} />;
}
