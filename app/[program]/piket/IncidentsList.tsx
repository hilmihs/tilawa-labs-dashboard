import { listRecentIncidents } from "./actions";
import { IncidentsTable } from "./IncidentsTable";

export async function IncidentsList({ programSlug }: { programSlug: string }) {
  const incidents = await listRecentIncidents(programSlug);
  return <IncidentsTable incidents={incidents} />;
}
