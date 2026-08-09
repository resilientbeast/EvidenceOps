export type DataMode = "fixture" | "live";
export type MemoryMode = "fixture" | "postgres";
export type IncidentStatus = "open" | "awaiting_execution" | "needs_review";
export type DecisionKind = "approved" | "review";
export type RiskClass = "read" | "simulate" | "write-low-risk" | "write-high-risk";

export type EvidenceSourceSystem =
  | "datahub"
  | "postgresql"
  | "action-runner"
  | "operator";

export interface Evidence {
  id: string;
  kind: "assertion" | "lineage" | "schema" | "historical-memory" | "action";
  sourceSystem: EvidenceSourceSystem;
  sourceRef: string;
  observedAt: string;
  summary: string;
}

export interface BlastRadiusAsset {
  id: string;
  type: "source" | "transformation" | "dashboard" | "ml-feature";
  name: string;
  platform: string;
  status: "failed" | "delayed" | "at-risk";
  evidenceId: string;
}

export interface Hypothesis {
  id: string;
  rank: string;
  title: string;
  confidence: number;
  verdict: "Leading" | "Weakened" | "Unlikely";
  summary: string;
  supportingEvidenceIds: string[];
  contradictingEvidenceIds: string[];
  unknowns: string[];
  reviewerFinding: string;
}

export interface HistoricalMatch {
  incidentId: string;
  title: string;
  similarity: number;
  summary: string;
  rootCause: string;
  winningAction: string;
  outcome: string;
  evidenceId: string;
}

export interface HistoricalMemoryRecord {
  incidentId: string;
  title: string;
  sourceAssetUrn: string;
  assertionName: string;
  severity: Incident["severity"];
  downstreamAssetIds: string[];
  resolvedAt: string;
  durationMinutes: number;
  rootCause: string;
  winningAction: string;
  outcome: string;
  verificationRequirements: string[];
  evidenceId: string;
}

export interface MatchDelta {
  sharedContext: string[];
  changedContext: string[];
  nonTransferableAssumptions: string[];
  recommendation: string;
}

export interface InvestigationStep {
  id: string;
  agent: "investigator" | "historian" | "planner" | "reviewer";
  label: string;
  finding: string;
  evidenceIds: string[];
  status: "grounded" | "challenged" | "pending";
}

export interface ResolutionLearning {
  status: "awaiting_human_outcome" | "ready_for_review";
  candidateSummary: string;
  safeguards: string[];
}

export interface RemediationPlan {
  id: string;
  version: number;
  objective: string;
  riskClass: RiskClass;
  steps: string[];
  validation: string[];
  rollback: string[];
  evidenceIds: string[];
}

export interface IncidentDecision {
  id: string;
  kind: DecisionKind;
  actorId: string;
  planId: string;
  planVersion: number;
  idempotencyKey: string;
  createdAt: string;
}

export interface IncidentEvent {
  id: string;
  sequence: number;
  occurredAt: string;
  label: string;
  actor: string;
  source: "fixture" | "operator" | "agent";
}

export interface AgentRun {
  provider: "aimlapi";
  model: string;
  generatedAt: string;
  toolsUsed: string[];
  evidenceValidated: true;
}

export interface Incident {
  id: string;
  mode: DataMode;
  memoryMode: MemoryMode;
  status: IncidentStatus;
  title: string;
  severity: "SEV-2";
  openedAt: string;
  assertionName: string;
  sourceAssetUrn: string;
  estimatedExposure: string;
  owner: string;
  policy: string;
  consumers: number;
  blastRadius: BlastRadiusAsset[];
  evidence: Evidence[];
  hypotheses: Hypothesis[];
  historicalMatch: HistoricalMatch;
  historicalMemoryCount: number;
  matchDelta: MatchDelta;
  investigation: InvestigationStep[];
  remediationPlan: RemediationPlan;
  resolutionLearning: ResolutionLearning;
  events: IncidentEvent[];
  decision?: IncidentDecision;
  agentRun?: AgentRun;
}
