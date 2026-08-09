import { IncidentNotFoundError } from "@/src/application/errors";
import type { IncidentRepository } from "@/src/adapters/incident-repository";
import { fixtureIncidentRepository } from "@/src/adapters/fixture/fixture-incident-repository";

export interface IncidentReplay {
  incidentId: string;
  evidence: Array<{ id: string; kind: string; sourceSystem: string; sourceRef: string; observedAt: string; summary: string }>;
  investigation: Array<{ id: string; agent: string; label: string; finding: string; evidenceIds: string[]; status: string }>;
  decision: { kind: string; actorId: string; planId: string; planVersion: number; createdAt: string } | null;
  learning: { status: string; candidateSummary: string; safeguards: string[] };
}

export async function readIncidentReplay(id: string, repository: IncidentRepository = fixtureIncidentRepository): Promise<IncidentReplay> {
  const incident = await repository.getById(id);
  if (!incident) throw new IncidentNotFoundError(id);

  return {
    incidentId: incident.id,
    evidence: incident.evidence.map(({ id, kind, sourceSystem, sourceRef, observedAt, summary }) => ({ id, kind, sourceSystem, sourceRef, observedAt, summary })),
    investigation: incident.investigation.map(({ id, agent, label, finding, evidenceIds, status }) => ({ id, agent, label, finding, evidenceIds, status })),
    decision: incident.decision
      ? {
          kind: incident.decision.kind,
          actorId: incident.decision.actorId,
          planId: incident.decision.planId,
          planVersion: incident.decision.planVersion,
          createdAt: incident.decision.createdAt,
        }
      : null,
    learning: incident.resolutionLearning,
  };
}
