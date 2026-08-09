import { readIncident } from "@/src/application/read-incident";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { IncidentConsole } from "@/app/incident-console";

export default async function Home() {
  const incident = await readIncident("INC-247", getConfiguredIncidentRepository());
  return <IncidentConsole initialIncident={incident} />;
}
