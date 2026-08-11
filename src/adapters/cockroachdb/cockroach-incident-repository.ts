import type { Pool, PoolClient } from "pg";
import type { IncidentRepository, RecordDecisionInput } from "@/src/adapters/incident-repository";
import { mapCatalogRow } from "@/src/adapters/infra-catalog/cockroach-catalog";
import type {
  HistoricalMemoryRecord,
  Incident,
  IncidentDecision,
} from "@/src/domain/incident";

type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

interface IncidentRow {
  id: string;
  severity: string | null;
  title: string;
  root_cause: string | null;
  resolution: string | null;
  outcome: string | null;
  status: string | null;
  opened_at: Date | string | null;
  resolved_at: Date | string | null;
  evidence: unknown;
  embedding_text: string | null;
  server_id: string;
  hostname: string;
  panel: string | null;
  region: string | null;
  site_id: string;
  domain: string;
  owner: string | null;
  sla_tier: string | null;
  service_id: string;
  service_kind: string;
  service_name: string;
  service_status: string | null;
  service_metadata: unknown;
}

interface MemoryRow extends IncidentRow {
  vector_distance: number | string;
}

interface VectorCandidateRow {
  id: string;
  status: string | null;
  vector_distance: number | string;
}

interface DecisionRow {
  id: string;
  idempotency_key: string;
  plan_version: number;
  approved_by: string | null;
  approved_at: Date | string | null;
  outcome: string | null;
}

const incidentSelect = `
  SELECT inc.id::STRING AS id,
         inc.severity,
         inc.title,
         inc.root_cause,
         inc.resolution,
         inc.outcome,
         inc.status,
         inc.opened_at,
         inc.resolved_at,
         inc.evidence,
         inc.embedding::STRING AS embedding_text,
         srv.id::STRING AS server_id,
         srv.hostname,
         srv.panel,
         srv.region,
         site.id::STRING AS site_id,
         site.domain,
         site.owner,
         site.sla_tier,
         svc.id::STRING AS service_id,
         svc.kind AS service_kind,
         svc.name AS service_name,
         svc.status AS service_status,
         svc.metadata AS service_metadata
    FROM incidents AS inc
    JOIN services AS svc ON svc.id = inc.service_id
    JOIN sites AS site ON site.id = svc.site_id
    JOIN servers AS srv ON srv.id = site.server_id`;

function cloneIncident(incident: Incident): Incident {
  return structuredClone(incident);
}

function jsonObject(value: unknown): Record<string, unknown> {
  if (typeof value === "string") {
    const parsed: unknown = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  }
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function iso(value: Date | string | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function incidentStatus(value: string | null): Incident["status"] {
  if (value === "resolved" || value === "awaiting_execution" || value === "needs_review") return value;
  return "open";
}

function evidenceSummary(evidence: Record<string, unknown>, fallback: string): string {
  return typeof evidence.summary === "string" ? evidence.summary : fallback;
}

function planId(incidentId: string): string {
  return `PLAN-${incidentId.slice(0, 8)}-1`;
}

function buildIncident(row: IncidentRow): Incident {
  const evidenceBundle = jsonObject(row.evidence);
  const diagnostics = strings(evidenceBundle.diagnostics);
  const symptoms = strings(evidenceBundle.symptoms);
  const infrastructure = mapCatalogRow(row);
  const observedAt = iso(row.opened_at) ?? infrastructure.observedAt;
  const memoryPressureEvidence = diagnostics.find((item) => /memory|222\.5|256 MB/i.test(item));
  const mutexEvidence = diagnostics.find((item) => /PCNTL|mutex|lock/i.test(item));
  const summary = evidenceSummary(evidenceBundle, row.title);
  const severity = row.severity === "SEV-3" ? "SEV-3" : "SEV-2";
  const metadata = infrastructure.service.metadata;
  const consumers = Array.isArray(metadata.affectedCampaigns) ? metadata.affectedCampaigns.length : 3;

  return {
    id: row.id,
    mode: "live",
    memoryMode: "cockroachdb",
    status: incidentStatus(row.status),
    title: row.title,
    severity,
    openedAt: iso(row.opened_at),
    assertionName: "mailwizz_campaign_progress",
    sourceAssetUrn: `cockroachdb:service:${row.service_id}`,
    estimatedExposure: "Multi-campaign delivery delay",
    owner: row.owner ?? row.domain,
    policy: row.sla_tier ? `${row.sla_tier} SLA` : "Operator-reviewed response",
    consumers,
    infrastructure,
    evidence: [
      {
        id: "EVD-001",
        kind: "assertion",
        sourceSystem: "operator",
        sourceRef: `incident:${row.id}:evidence`,
        observedAt,
        summary: symptoms[0] ?? summary,
      },
      {
        id: "EVD-002",
        kind: "lineage",
        sourceSystem: "cockroachdb",
        sourceRef: `service:${row.service_id}`,
        observedAt: infrastructure.observedAt,
        summary: `${infrastructure.service.name} serves ${infrastructure.site.domain} on ${infrastructure.server.hostname}.`,
      },
      {
        id: "EVD-003",
        kind: "schema",
        sourceSystem: "operator",
        sourceRef: `incident:${row.id}:diagnostics`,
        observedAt,
        summary: [memoryPressureEvidence, mutexEvidence].filter(Boolean).join(" ") || diagnostics[0] || "Current diagnostics remain under review.",
      },
      {
        id: "EVD-004",
        kind: "historical-memory",
        sourceSystem: "cockroachdb",
        sourceRef: "vector-search:pending",
        observedAt: infrastructure.observedAt,
        summary: "CockroachDB vector memory retrieval is pending.",
      },
    ],
    blastRadius: [
      {
        id: row.server_id,
        type: "server",
        name: row.hostname,
        platform: `${row.panel ?? "server"} · ${row.region ?? "region unknown"}`,
        status: "at-risk",
        evidenceId: "EVD-002",
      },
      {
        id: row.site_id,
        type: "site",
        name: row.domain,
        platform: "Site · campaign operations",
        status: "delayed",
        evidenceId: "EVD-001",
      },
      {
        id: row.service_id,
        type: "service",
        name: row.service_name,
        platform: `${row.service_kind} · ${row.service_status ?? "status unknown"}`,
        status: "failed",
        evidenceId: "EVD-003",
      },
      {
        id: `${row.id}:campaigns`,
        type: "campaign",
        name: "Affected campaign sends",
        platform: "MailWizz · delivery delayed",
        status: "delayed",
        evidenceId: "EVD-001",
      },
    ],
    hypotheses: [
      {
        id: "redis-memory-pressure",
        rank: "01",
        title: "Redis memory pressure",
        confidence: 74,
        verdict: "Leading",
        summary: memoryPressureEvidence ?? "Redis headroom is a leading condition to verify.",
        supportingEvidenceIds: ["EVD-001", "EVD-003"],
        contradictingEvidenceIds: [],
        unknowns: ["Current container memory, maxmemory, eviction policy, and restart history require confirmation."],
        reviewerFinding: "Confirm live Redis memory and process state before transferring any historical remediation.",
      },
      {
        id: "pcntl-mutex",
        rank: "02",
        title: "Stale PCNTL mutex",
        confidence: 18,
        verdict: "Weakened",
        summary: mutexEvidence ?? "A mutex symptom may reflect active processes rather than an orphaned lock.",
        supportingEvidenceIds: ["EVD-003"],
        contradictingEvidenceIds: ["EVD-004"],
        unknowns: ["Whether the lock is orphaned or held by a live PCNTL process."],
        reviewerFinding: "Do not clear Redis locks until process ownership is independently verified.",
      },
      {
        id: "ses-delivery",
        rank: "03",
        title: "Downstream SES failure",
        confidence: 8,
        verdict: "Unlikely",
        summary: "Other campaign deliveries succeeding would contradict a broad SES outage.",
        supportingEvidenceIds: [],
        contradictingEvidenceIds: ["EVD-001"],
        unknowns: ["Per-campaign delivery telemetry has not yet been replayed."],
        reviewerFinding: "Keep SES as a bounded check, but do not treat it as the leading cause without delivery errors.",
      },
    ],
    historicalMatch: {
      incidentId: "pending",
      title: "Vector retrieval pending",
      similarity: 0,
      summary: "CockroachDB historical memory has not been queried yet.",
      rootCause: "Unverified",
      winningAction: "No action proposed",
      outcome: "Pending",
      evidenceId: "EVD-004",
    },
    historicalMemoryCount: 0,
    matchDelta: {
      sharedContext: [],
      changedContext: [],
      nonTransferableAssumptions: ["No historical resolution may be transferred without current-condition verification."],
      recommendation: "Retrieve historical memory, then reuse its diagnostic sequence only.",
    },
    investigation: [
      { id: "INV-001", agent: "investigator", label: "Map current blast radius", finding: "Server, site, service, and campaign scope were read from the CockroachDB catalog and evidence bundle.", evidenceIds: ["EVD-001", "EVD-002"], status: "grounded" },
      { id: "INV-002", agent: "historian", label: "Retrieve comparable resolution", finding: "CockroachDB vector retrieval ranks resolved incidents by semantic distance.", evidenceIds: ["EVD-004"], status: "grounded" },
      { id: "INV-003", agent: "planner", label: "Draft bounded remediation", finding: "The plan is limited to read-only verification and a simulated capacity change.", evidenceIds: ["EVD-001", "EVD-003", "EVD-004"], status: "grounded" },
      { id: "INV-004", agent: "reviewer", label: "Challenge action preconditions", finding: "Execution remains blocked until live memory and lock ownership are confirmed by an operator.", evidenceIds: ["EVD-003", "EVD-004"], status: "challenged" },
    ],
    remediationPlan: {
      id: planId(row.id),
      version: 1,
      objective: "Verify Redis pressure and simulate a bounded memory-headroom change without clearing live locks.",
      riskClass: "simulate",
      steps: ["Read current Redis and container memory settings", "Verify PCNTL lock ownership", "Simulate a bounded memory-headroom change"],
      validation: ["Campaign progress resumes", "Redis remains reachable", "No live PCNTL lock is deleted"],
      rollback: ["Discard the simulation and leave the running service unchanged"],
      evidenceIds: ["EVD-001", "EVD-002", "EVD-003", "EVD-004"],
    },
    resolutionLearning: {
      status: "awaiting_human_outcome",
      candidateSummary: "A reviewed outcome can become incident memory only after root cause and verification are recorded.",
      safeguards: ["Never store an unverified root cause.", "Preserve the immutable evidence bundle, plan version, reviewer challenge, and human decision."],
    },
    events: [
      { id: "EVT-001", sequence: 1, occurredAt: new Date(observedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false }), label: "Incident evidence received", actor: "Operator", source: "operator" },
      { id: "EVT-002", sequence: 2, occurredAt: new Date(infrastructure.observedAt).toLocaleTimeString("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false }), label: "Infrastructure context loaded", actor: "CockroachDB catalog", source: "agent" },
    ],
  };
}

function memoryRecord(row: MemoryRow, corpusCount: number): HistoricalMemoryRecord {
  const evidence = jsonObject(row.evidence);
  const transferNotes = jsonObject(evidence.transferNotes);
  const resolvedAt = iso(row.resolved_at);
  const openedAt = iso(row.opened_at);
  const durationMinutes = openedAt && resolvedAt
    ? Math.max(0, Math.round((Date.parse(resolvedAt) - Date.parse(openedAt)) / 60_000))
    : null;
  const verificationRequirements = [
    ...strings(transferNotes.doNotTransfer),
    ...strings(evidence.doNotInfer),
  ];

  return {
    incidentId: row.id,
    title: row.title,
    sourceAssetUrn: `cockroachdb:service:${row.service_id}`,
    assertionName: "mailwizz_campaign_progress",
    severity: row.severity === "SEV-3" ? "SEV-3" : "SEV-2",
    downstreamAssetIds: [row.server_id, row.site_id, row.service_id],
    resolvedAt,
    durationMinutes,
    rootCause: row.root_cause ?? "Root cause was not recorded.",
    winningAction: row.resolution ?? "Resolution was not recorded.",
    outcome: row.outcome ?? "Outcome was not recorded.",
    verificationRequirements: verificationRequirements.length
      ? verificationRequirements
      : ["Verify the current incident conditions before transferring any remediation."],
    evidenceId: "EVD-004",
    vectorDistance: Number(row.vector_distance),
    corpusCount,
    infrastructure: mapCatalogRow(row, resolvedAt ?? new Date().toISOString()),
    sharedSignals: strings(transferNotes.shared),
    changedSignals: strings(transferNotes.changed),
  };
}

function decisionFromRow(row: DecisionRow, incidentId: string): IncidentDecision {
  return {
    id: row.id,
    kind: row.outcome === "review" ? "review" : "approved",
    actorId: row.approved_by ?? "unknown-operator",
    planId: planId(incidentId),
    planVersion: row.plan_version,
    idempotencyKey: row.idempotency_key,
    createdAt: iso(row.approved_at) ?? new Date().toISOString(),
  };
}

export class CockroachIncidentRepository implements IncidentRepository {
  private activeIncidentId: string | null = null;
  private activeEmbedding: string | null = null;

  constructor(private readonly pool: Pool) {}

  private async latestStoredState(database: Queryable, incidentId: string): Promise<Incident | null> {
    const result = await database.query<{ incident_state: unknown }>(
      `SELECT payload->'incidentState' AS incident_state
         FROM audit_log
        WHERE incident_id = $1::UUID
          AND payload->'incidentState' IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 1`,
      [incidentId],
    );
    if (!result.rowCount) return null;
    const state = result.rows[0].incident_state;
    return state && typeof state === "object" ? (state as Incident) : null;
  }

  private async latestDecision(database: Queryable, incidentId: string): Promise<IncidentDecision | undefined> {
    const result = await database.query<DecisionRow>(
      `SELECT id::STRING AS id, idempotency_key, plan_version, approved_by, approved_at, outcome
         FROM decisions
        WHERE incident_id = $1::UUID
        ORDER BY approved_at DESC
        LIMIT 1`,
      [incidentId],
    );
    return result.rowCount ? decisionFromRow(result.rows[0], incidentId) : undefined;
  }

  private async loadIncident(database: Queryable, id: string, rememberVector: boolean): Promise<Incident | null> {
    const result = await database.query<IncidentRow>(`${incidentSelect} WHERE inc.id = $1::UUID`, [id]);
    if (!result.rowCount) return null;
    const row = result.rows[0];
    if (rememberVector) {
      this.activeIncidentId = row.id;
      this.activeEmbedding = row.embedding_text;
    }
    const [persisted, decision] = await Promise.all([
      this.latestStoredState(database, row.id),
      this.latestDecision(database, row.id),
    ]);
    const incident = persisted ?? buildIncident(row);
    incident.mode = "live";
    incident.memoryMode = "cockroachdb";
    incident.status = incidentStatus(row.status);
    incident.infrastructure = mapCatalogRow(row);
    incident.decision = decision;
    return cloneIncident(incident);
  }

  async getById(id: string): Promise<Incident | null> {
    return this.loadIncident(this.pool, id, true);
  }

  async listHistoricalMemory(): Promise<HistoricalMemoryRecord[]> {
    if (!this.activeIncidentId || !this.activeEmbedding) {
      throw new Error("CockroachDB vector retrieval requires getById() to load the current incident first.");
    }
    const [count, candidates] = await Promise.all([
      this.pool.query<{ corpus_count: number | string }>(
        `SELECT count(*)::INT AS corpus_count
           FROM incidents
          WHERE status = 'resolved'
            AND embedding IS NOT NULL
            AND id != $1::UUID`,
        [this.activeIncidentId],
      ),
      this.pool.query<VectorCandidateRow>(
        `SELECT id::STRING AS id,
                status,
                embedding <-> $1::VECTOR AS vector_distance
           FROM incidents
          ORDER BY embedding <-> $1::VECTOR
          LIMIT 100`,
        [this.activeEmbedding],
      ),
    ]);
    const corpusCount = Number(count.rows[0]?.corpus_count ?? 0);
    const resolvedCandidates = candidates.rows
      .filter((row) => row.status === "resolved" && row.id !== this.activeIncidentId)
      .slice(0, 5);
    if (!resolvedCandidates.length) return [];

    const result = await this.pool.query<IncidentRow>(
      `${incidentSelect} WHERE inc.id = ANY($1::UUID[])`,
      [resolvedCandidates.map((row) => row.id)],
    );
    const rowsById = new Map(result.rows.map((row) => [row.id, row]));
    return resolvedCandidates.flatMap((candidate) => {
      const row = rowsById.get(candidate.id);
      return row
        ? [memoryRecord({ ...row, vector_distance: candidate.vector_distance }, corpusCount)]
        : [];
    });
  }

  async recordDecision(input: RecordDecisionInput): Promise<Incident> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const locked = await client.query<{ id: string }>(
        "SELECT id::STRING AS id FROM incidents WHERE id = $1::UUID FOR UPDATE",
        [input.incidentId],
      );
      if (!locked.rowCount) throw new Error(`Incident ${input.incidentId} was not found.`);

      const existing = await this.latestDecision(client, input.incidentId);
      if (existing?.idempotencyKey === input.idempotencyKey) {
        await client.query("COMMIT");
        const idempotent = await this.getById(input.incidentId);
        if (!idempotent) throw new Error(`Incident ${input.incidentId} was not found.`);
        return idempotent;
      }
      if (existing) throw new Error("A decision has already been recorded for this incident.");
      if (input.planId !== planId(input.incidentId) || input.planVersion !== 1) {
        throw new Error("The decision does not match the current remediation plan.");
      }

      const current = await this.loadIncident(client, input.incidentId, false);
      if (!current) throw new Error(`Incident ${input.incidentId} was not found.`);
      const createdAt = new Date().toISOString();
      const decision: IncidentDecision = {
        id: crypto.randomUUID(),
        kind: input.decision,
        actorId: input.actorId,
        planId: input.planId,
        planVersion: input.planVersion,
        idempotencyKey: input.idempotencyKey,
        createdAt,
      };
      current.decision = decision;
      current.status = input.decision === "approved" ? "awaiting_execution" : "needs_review";
      current.events.push({
        id: `EVT-${String(current.events.length + 1).padStart(3, "0")}`,
        sequence: current.events.length + 1,
        occurredAt: new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
        label: input.decision === "approved" ? "Simulated remediation approved" : "Additional review requested",
        actor: input.actorId,
        source: "operator",
      });
      await client.query(
        `INSERT INTO decisions (id, incident_id, idempotency_key, plan_version, approved_by, approved_at, outcome)
         VALUES ($1::UUID, $2::UUID, $3, $4, $5, $6, $7)`,
        [decision.id, input.incidentId, input.idempotencyKey, input.planVersion, input.actorId, createdAt, input.decision],
      );
      await client.query(
        "UPDATE incidents SET status = $2 WHERE id = $1::UUID",
        [input.incidentId, current.status],
      );
      await client.query(
        `INSERT INTO audit_log (incident_id, stage, payload)
         VALUES ($1::UUID, 'decision', $2::JSONB)`,
        [input.incidentId, JSON.stringify({ decision, incidentState: current })],
      );
      await client.query("COMMIT");
      return cloneIncident(current);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  async saveAgentRun(incident: Incident): Promise<Incident> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const exists = await client.query("SELECT 1 FROM incidents WHERE id = $1::UUID FOR UPDATE", [incident.id]);
      if (!exists.rowCount) throw new Error(`Incident ${incident.id} was not found.`);
      for (const step of incident.investigation) {
        await client.query(
          `INSERT INTO audit_log (incident_id, stage, payload)
           VALUES ($1::UUID, $2, $3::JSONB)`,
          [
            incident.id,
            step.agent,
            JSON.stringify({
              step,
              agentRun: incident.agentRun,
              ...(step.agent === "reviewer" ? { incidentState: incident } : {}),
            }),
          ],
        );
      }
      await client.query("COMMIT");
      return cloneIncident(incident);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }
}
