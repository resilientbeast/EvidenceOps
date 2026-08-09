import type { IncidentRepository } from "@/src/adapters/incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";
import { IncidentNotFoundError } from "@/src/application/errors";
import { applyHistoricalMemory } from "@/src/application/match-historical-memory";
import type { Incident } from "@/src/domain/incident";

export async function readIncident(
  id: string,
  repository: IncidentRepository = fixtureIncidentRepository,
): Promise<Incident> {
  const incident = await repository.getById(id);
  if (!incident) throw new IncidentNotFoundError(id);
  return applyHistoricalMemory(incident, await repository.listHistoricalMemory());
}
