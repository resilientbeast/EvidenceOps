import type { HistoricalMemoryRecord, Incident, IncidentDecision } from "@/src/domain/incident";

export interface RecordDecisionInput {
  incidentId: string;
  decision: IncidentDecision["kind"];
  actorId: string;
  planId: string;
  planVersion: number;
  idempotencyKey: string;
}

export interface IncidentRepository {
  getById(id: string): Promise<Incident | null>;
  listHistoricalMemory(): Promise<HistoricalMemoryRecord[]>;
  recordDecision(input: RecordDecisionInput): Promise<Incident>;
}
