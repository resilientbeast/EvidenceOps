import { Pool } from "pg";
import type { IncidentRepository, RecordDecisionInput } from "@/src/adapters/incident-repository";
import type { HistoricalMemoryRecord, Incident } from "@/src/domain/incident";
import { lineaPhpFpmFixture } from "@/src/fixtures/linea-php-fpm";
import { historicalMemoryFixtures } from "@/src/fixtures/historical-memory";

const createVectorExtensionSql = "CREATE EXTENSION IF NOT EXISTS vector";
const createDossiersTableSql = `
  CREATE TABLE IF NOT EXISTS incident_dossiers (
    id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
  )`;
const createHistoricalMemoryTableSql = `
  CREATE TABLE IF NOT EXISTS historical_incident_memory (
    incident_id TEXT PRIMARY KEY,
    payload JSONB NOT NULL,
    resolved_at TIMESTAMPTZ NOT NULL
  )`;

function cloneIncident(incident: Incident): Incident {
  return structuredClone(incident);
}

function normalizePayload(payload: unknown): Incident {
  const parsed = typeof payload === "string" ? JSON.parse(payload) : payload;
  if (!parsed || typeof parsed !== "object") throw new Error("PostgreSQL returned an invalid incident payload.");
  return { ...(parsed as Incident), memoryMode: "postgres" };
}

export class PostgresIncidentRepository implements IncidentRepository {
  private readonly pool: Pool;
  private initialized: Promise<void> | null = null;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString, max: 4 });
  }

  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) {
      this.initialized = (async () => {
        await this.pool.query(createVectorExtensionSql);
        await this.pool.query(createDossiersTableSql);
        await this.pool.query(createHistoricalMemoryTableSql);
        const seed = { ...cloneIncident(lineaPhpFpmFixture), memoryMode: "postgres" as const };
        await this.pool.query(
          "INSERT INTO incident_dossiers (id, payload) VALUES ($1, $2::JSONB) ON CONFLICT (id) DO NOTHING",
          [seed.id, JSON.stringify(seed)],
        );
        for (const record of historicalMemoryFixtures) {
          await this.pool.query(
            "INSERT INTO historical_incident_memory (incident_id, payload, resolved_at) VALUES ($1, $2::JSONB, $3) ON CONFLICT (incident_id) DO NOTHING",
            [record.incidentId, JSON.stringify(record), record.resolvedAt],
          );
        }
      })();
    }
    return this.initialized;
  }

  async getById(id: string): Promise<Incident | null> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ payload: unknown }>(
      "SELECT payload FROM incident_dossiers WHERE id = $1",
      [id],
    );
    return result.rowCount ? normalizePayload(result.rows[0].payload) : null;
  }

  async listHistoricalMemory(): Promise<HistoricalMemoryRecord[]> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ payload: unknown }>(
      "SELECT payload FROM historical_incident_memory ORDER BY resolved_at DESC",
    );
    return result.rows.map((row) => {
      const parsed = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      if (!parsed || typeof parsed !== "object") throw new Error("PostgreSQL returned invalid historical memory.");
      return parsed as HistoricalMemoryRecord;
    });
  }

  async recordDecision(input: RecordDecisionInput): Promise<Incident> {
    await this.ensureInitialized();
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await client.query<{ payload: unknown }>(
        "SELECT payload FROM incident_dossiers WHERE id = $1 FOR UPDATE",
        [input.incidentId],
      );
      if (!result.rowCount) throw new Error(`Incident ${input.incidentId} was not found.`);

      const incident = normalizePayload(result.rows[0].payload);
      if (incident.decision?.idempotencyKey === input.idempotencyKey) {
        await client.query("COMMIT");
        return cloneIncident(incident);
      }
      if (incident.decision) throw new Error("A decision has already been recorded for this incident.");
      if (input.planId !== incident.remediationPlan.id || input.planVersion !== incident.remediationPlan.version) {
        throw new Error("The decision does not match the current remediation plan.");
      }

      const createdAt = new Date().toISOString();
      incident.decision = {
        id: `DEC-${incident.id}-1`,
        kind: input.decision,
        actorId: input.actorId,
        planId: input.planId,
        planVersion: input.planVersion,
        idempotencyKey: input.idempotencyKey,
        createdAt,
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
      await client.query(
        "UPDATE incident_dossiers SET payload = $2::JSONB, updated_at = now() WHERE id = $1",
        [incident.id, JSON.stringify(incident)],
      );
      await client.query("COMMIT");
      return cloneIncident(incident);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAgentRun(incident: Incident): Promise<Incident> {
    await this.ensureInitialized();
    const result = await this.pool.query<{ payload: unknown }>(
      "UPDATE incident_dossiers SET payload = $2::JSONB, updated_at = now() WHERE id = $1 RETURNING payload",
      [incident.id, JSON.stringify(incident)],
    );
    if (!result.rowCount) throw new Error(`Incident ${incident.id} was not found.`);
    return cloneIncident(normalizePayload(result.rows[0].payload));
  }
}
