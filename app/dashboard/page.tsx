import { readIncident } from "@/src/application/read-incident";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";
import { IncidentConsole } from "@/app/incident-console";

export const dynamic = "force-dynamic";

export default async function Dashboard() {
  const incidentId = process.env.RECALLOPS_ACTIVE_INCIDENT_ID ?? "INC-247";
  let incident;
  try {
    incident = await readIncident(incidentId, getConfiguredIncidentRepository());
  } catch (error) {
    if (process.env.NODE_ENV !== "development") throw error;
    incident = await readIncident("INC-247", fixtureIncidentRepository);
  }
  return <IncidentConsole initialIncident={incident} />;
}
