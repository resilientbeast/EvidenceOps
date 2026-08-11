import { readIncident } from "@/src/application/read-incident";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { IncidentConsole } from "@/app/incident-console";

export default async function Home() {
  const incidentId = process.env.RECALLOPS_ACTIVE_INCIDENT_ID ?? "INC-247";
  const incident = await readIncident(incidentId, getConfiguredIncidentRepository());
  return <IncidentConsole initialIncident={incident} />;
}
