import type { IncidentRepository, RecordDecisionInput } from "@/src/adapters/incident-repository";
import type { Incident } from "@/src/domain/incident";
import { phpFpmElementorFixture } from "@/src/fixtures/php-fpm-elementor";
import { historicalMemoryFixtures } from "@/src/fixtures/historical-memory";
import type { HistoricalMemoryRecord } from "@/src/domain/incident";

function cloneIncident(incident: Incident): Incident {
  return structuredClone(incident);
}

export class FixtureIncidentRepository implements IncidentRepository {
  private incident = cloneIncident(phpFpmElementorFixture);

  async getById(id: string): Promise<Incident | null> {
    return this.incident.id === id ? cloneIncident(this.incident) : null;
  }

  async listHistoricalMemory(): Promise<HistoricalMemoryRecord[]> {
    return structuredClone(historicalMemoryFixtures);
  }

  async recordDecision(input: RecordDecisionInput): Promise<Incident> {
    if (input.incidentId !== this.incident.id) {
      throw new Error(`Incident ${input.incidentId} was not found.`);
    }

    if (this.incident.decision?.idempotencyKey === input.idempotencyKey) {
      return cloneIncident(this.incident);
    }

    if (this.incident.decision) {
      throw new Error("A decision has already been recorded for this incident.");
    }

    if (
      input.planId !== this.incident.remediationPlan.id ||
      input.planVersion !== this.incident.remediationPlan.version
    ) {
      throw new Error("The decision does not match the current remediation plan.");
    }

    const createdAt = "2026-08-05T01:46:00.000Z";
    this.incident.decision = {
      id: `DEC-${this.incident.id}-1`,
      kind: input.decision,
      actorId: input.actorId,
      planId: input.planId,
      planVersion: input.planVersion,
      idempotencyKey: input.idempotencyKey,
      createdAt,
    };
    this.incident.status = input.decision === "approved" ? "awaiting_execution" : "needs_review";
    this.incident.events.push({
      id: `EVT-${String(this.incident.events.length + 1).padStart(3, "0")}`,
      sequence: this.incident.events.length + 1,
      occurredAt: "09:46",
      label: input.decision === "approved" ? "Simulated remediation approved" : "Additional review requested",
      actor: input.actorId,
      source: "operator",
    });

    return cloneIncident(this.incident);
  }

  async saveAgentRun(incident: Incident): Promise<Incident> {
    if (incident.id !== this.incident.id) {
      throw new Error(`Incident ${incident.id} was not found.`);
    }

    this.incident = cloneIncident(incident);
    return cloneIncident(this.incident);
  }
}

export const fixtureIncidentRepository = new FixtureIncidentRepository();
