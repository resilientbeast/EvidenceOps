import type { IncidentRepository, RecordDecisionInput } from "@/src/adapters/incident-repository";
import type { HistoricalMemoryRecord, Incident } from "@/src/domain/incident";

type DossierRow = { payload: unknown; updated_at: string };
type HistoricalMemoryRow = { payload: unknown };

function parseIncident(payload: unknown): Incident {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") throw new Error("PostgreSQL REST bridge returned an invalid incident payload.");
  return { ...(parsed as Incident), memoryMode: "postgres" };
}

function parseHistoricalMemory(payload: unknown): HistoricalMemoryRecord {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") throw new Error("PostgreSQL REST bridge returned invalid historical memory.");
  return parsed as HistoricalMemoryRecord;
}

export class HttpPostgresIncidentRepository implements IncidentRepository {
  private readonly baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl.replace(/\/$/, "");
  }

  private async request(path: string, init?: RequestInit): Promise<Response> {
    const response = await fetch(`${this.baseUrl}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...(init?.headers ?? {}) },
    });
    if (!response.ok) throw new Error(`PostgreSQL REST bridge returned HTTP ${response.status}.`);
    return response;
  }

  private async getDossier(id: string): Promise<DossierRow | null> {
    const params = new URLSearchParams({ id: `eq.${id}`, select: "payload,updated_at" });
    const rows = await (await this.request(`/incident_dossiers?${params}`)).json() as DossierRow[];
    return rows[0] ?? null;
  }

  async getById(id: string): Promise<Incident | null> {
    const row = await this.getDossier(id);
    return row ? parseIncident(row.payload) : null;
  }

  async listHistoricalMemory(): Promise<HistoricalMemoryRecord[]> {
    const rows = await (await this.request("/historical_incident_memory?select=payload&order=resolved_at.desc")).json() as HistoricalMemoryRow[];
    return rows.map((row) => parseHistoricalMemory(row.payload));
  }

  async recordDecision(input: RecordDecisionInput): Promise<Incident> {
    for (let attempt = 0; attempt < 2; attempt++) {
      const row = await this.getDossier(input.incidentId);
      if (!row) throw new Error(`Incident ${input.incidentId} was not found.`);

      const incident = parseIncident(row.payload);
      if (incident.decision?.idempotencyKey === input.idempotencyKey) return incident;
      if (incident.decision) throw new Error("A decision has already been recorded for this incident.");
      if (input.planId !== incident.remediationPlan.id || input.planVersion !== incident.remediationPlan.version) {
        throw new Error("The decision does not match the current remediation plan.");
      }

      const createdAt = new Date().toISOString();
      incident.decision = {
        id: `DEC-${incident.id}-1`, kind: input.decision, actorId: input.actorId,
        planId: input.planId, planVersion: input.planVersion, idempotencyKey: input.idempotencyKey, createdAt,
      };
      incident.status = input.decision === "approved" ? "awaiting_execution" : "needs_review";
      incident.events.push({
        id: `EVT-${String(incident.events.length + 1).padStart(3, "0")}`,
        sequence: incident.events.length + 1,
        occurredAt: new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
        label: input.decision === "approved" ? "Simulated remediation approved" : "Additional review requested",
        actor: input.actorId,
        source: "operator",
      });

      const params = new URLSearchParams({ id: `eq.${incident.id}`, updated_at: `eq.${row.updated_at}` });
      const response = await this.request(`/incident_dossiers?${params}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ payload: incident, updated_at: createdAt }),
      });
      const updated = await response.json() as DossierRow[];
      if (updated.length === 1) return parseIncident(updated[0].payload);
    }
    throw new Error("The incident changed while the decision was being recorded. Please retry.");
  }

  async saveAgentRun(incident: Incident): Promise<Incident> {
    const row = await this.getDossier(incident.id);
    if (!row) throw new Error(`Incident ${incident.id} was not found.`);

    const updatedAt = new Date().toISOString();
    const params = new URLSearchParams({ id: `eq.${incident.id}`, updated_at: `eq.${row.updated_at}` });
    const response = await this.request(`/incident_dossiers?${params}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Prefer: "return=representation" },
      body: JSON.stringify({ payload: incident, updated_at: updatedAt }),
    });
    const updated = await response.json() as DossierRow[];
    if (updated.length !== 1) {
      throw new Error("The incident changed while the agent run was being recorded. Please retry.");
    }
    return parseIncident(updated[0].payload);
  }
}
