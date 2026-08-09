import type { IncidentRepository, RecordDecisionInput } from "@/src/adapters/incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";
import { IncidentConflictError, IncidentNotFoundError } from "@/src/application/errors";
import type { Incident } from "@/src/domain/incident";

export async function recordDecision(
  input: RecordDecisionInput,
  repository: IncidentRepository = fixtureIncidentRepository,
): Promise<Incident> {
  const incident = await repository.getById(input.incidentId);
  if (!incident) throw new IncidentNotFoundError(input.incidentId);

  if (incident.decision && incident.decision.idempotencyKey !== input.idempotencyKey) {
    throw new IncidentConflictError("A decision has already been recorded for this incident.");
  }

  return repository.recordDecision(input);
}
