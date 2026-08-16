import { readIncident } from "@/src/application/read-incident";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";
import { phpFpmElementorFixture } from "@/src/fixtures/php-fpm-elementor";
import { IncidentConsole } from "@/app/incident-console";

export const dynamic = "force-dynamic";

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ incident?: string }> }) {
  const query = await searchParams;
  const incidentId = isUuid(query.incident)
    ? query.incident
    : process.env.RECALLOPS_ACTIVE_INCIDENT_ID ?? phpFpmElementorFixture.id;
  let incident;
  try {
    incident = await readIncident(incidentId, getConfiguredIncidentRepository());
  } catch (error) {
    if (process.env.NODE_ENV !== "development") throw error;
    incident = await readIncident(phpFpmElementorFixture.id, fixtureIncidentRepository);
  }
  return <IncidentConsole initialIncident={incident} />;
}

function isUuid(value: string | undefined): value is string {
  return Boolean(value && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value));
}
