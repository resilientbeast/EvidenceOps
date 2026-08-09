"use client";

import { useEffect, useState } from "react";
import type { BlastRadiusAsset, DecisionKind, Incident } from "@/src/domain/incident";
import type { ApiErrorResponse, IncidentResponse } from "@/src/contracts/api";
import type { LiveDataHubContext } from "@/src/adapters/datahub/live-context";

type ReplayPayload = {
  replay: {
    evidence: Array<{ id: string; kind: string; sourceSystem: string; summary: string }>;
    investigation: Array<{ id: string; agent: string; label: string; finding: string; evidenceIds: string[]; status: string }>;
    decision: { kind: string; actorId: string; planId: string; planVersion: number; createdAt: string } | null;
    learning: { status: string; candidateSummary: string; safeguards: string[] };
  };
};

type IncidentConsoleProps = {
  initialIncident: Incident;
};

function nodeType(asset: BlastRadiusAsset): string {
  return asset.type.replace("-", " ").toUpperCase();
}

export function IncidentConsole({ initialIncident }: IncidentConsoleProps) {
  const [incident, setIncident] = useState(initialIncident);
  const [selectedHypothesisId, setSelectedHypothesisId] = useState(
    initialIncident.hypotheses[0]?.id ?? "",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionError, setSubmissionError] = useState<string | null>(null);
  const [liveContext, setLiveContext] = useState<LiveDataHubContext | null>(null);
  const [liveContextError, setLiveContextError] = useState<string | null>(null);
  const [replay, setReplay] = useState<ReplayPayload["replay"] | null>(null);
  const [isReplayOpen, setIsReplayOpen] = useState(false);
  const [replayError, setReplayError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function refreshIncident() {
      try {
        const response = await fetch(`/api/incidents/${initialIncident.id}`);
        const payload = (await response.json()) as IncidentResponse | ApiErrorResponse;
        if (response.ok && "incident" in payload && !cancelled) {
          setIncident(payload.incident);
        }
      } catch {
        // The server-rendered fixture remains available if the refresh fails.
      }
    }

    void refreshIncident();
    return () => {
      cancelled = true;
    };
  }, [initialIncident.id]);

  useEffect(() => {
    let cancelled = false;

    async function loadLiveContext() {
      try {
        const response = await fetch("/api/datahub/context");
        const payload = (await response.json()) as
          | { context: LiveDataHubContext }
          | { error: { message?: string } };
        if (cancelled) return;
        if (response.ok && "context" in payload) {
          setLiveContext(payload.context);
          return;
        }
        setLiveContextError("A local DataHub connection has not been configured.");
      } catch {
        if (!cancelled) setLiveContextError("Local DataHub context is unavailable.");
      }
    }

    void loadLiveContext();
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedHypothesis = incident.hypotheses.find(
    (hypothesis) => hypothesis.id === selectedHypothesisId,
  );
  const [sourceAsset, transformationAsset, ...downstreamAssets] = incident.blastRadius;
  if (!sourceAsset || !transformationAsset || !selectedHypothesis) {
    throw new Error("The incident fixture is missing required investigation data.");
  }

  const isFixture = incident.mode === "fixture";
  const isPersistentMemory = incident.memoryMode === "postgres";
  const sourceLabel = isFixture ? "Fixture · seeded demo" : "DataHub · live";
  const decision = incident.decision?.kind;

  async function submitDecision(kind: DecisionKind) {
    setIsSubmitting(true);
    setSubmissionError(null);

    try {
      const response = await fetch(`/api/incidents/${incident.id}/decisions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          actorId: "demo-operator",
          decision: kind,
          idempotencyKey: crypto.randomUUID(),
          planId: incident.remediationPlan.id,
          planVersion: incident.remediationPlan.version,
        }),
      });
      const payload = (await response.json()) as IncidentResponse | ApiErrorResponse;
      if (!response.ok || !("incident" in payload)) {
        setSubmissionError("error" in payload ? payload.error : "Unable to record the decision.");
        return;
      }

      setIncident(payload.incident);
    } catch {
      setSubmissionError("Unable to reach the incident API. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function toggleReplay() {
    const nextOpen = !isReplayOpen;
    setIsReplayOpen(nextOpen);
    if (!nextOpen || replay) return;

    try {
      const response = await fetch(`/api/incidents/${incident.id}/replay`);
      const payload = (await response.json()) as ReplayPayload | ApiErrorResponse;
      if (!response.ok || !("replay" in payload)) {
        setReplayError("The evidence replay could not be loaded.");
        return;
      }
      setReplay(payload.replay);
    } catch {
      setReplayError("The evidence replay could not be loaded.");
    }
  }

  return (
    <main className="app-shell">
      <aside className="rail" aria-label="Primary navigation">
        <div className="brand-mark" aria-label="RecallOps">
          RO
        </div>
        <nav className="rail-nav">
          <button className="rail-button active" aria-label="Active incident" type="button">
            <span>⌁</span>
          </button>
          <button className="rail-button" aria-label="Incident memory" type="button">
            <span>◎</span>
          </button>
          <button className="rail-button" aria-label="Data lineage" type="button">
            <span>◇</span>
          </button>
        </nav>
        <div className="rail-avatar" aria-label="Operator AR">
          AR
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">RECALLOPS · AGENTIC MEMORY</p>
            <h1>Incident command</h1>
          </div>
          <div className="topbar-actions">
            <span className="connection"><i /> {isFixture ? "DataHub fixture" : "DataHub connected"}</span>
            <span className="connection"><i /> {isPersistentMemory ? "PostgreSQL connected" : "Memory fixture"}</span>
            <button className="icon-button" aria-label="More actions" type="button">•••</button>
          </div>
        </header>

        <div className="incident-banner">
          <div className="severity-block">
            <span className="severity">{incident.severity}</span>
            <span className="pulse" />
          </div>
          <div className="incident-title">
            <p className="eyebrow">{isFixture ? "DEMO FIXTURE" : "ACTIVE"} · {incident.id}</p>
            <h2>{incident.title}</h2>
            <p>Detected by <strong>{incident.assertionName}</strong> · Opened 09:42 SGT</p>
          </div>
          <div className="banner-metric">
            <strong>{incident.blastRadius.length}</strong>
            <span>assets at risk</span>
          </div>
          <div className="banner-metric">
            <strong>{incident.estimatedExposure}</strong>
            <span>estimated exposure</span>
          </div>
          <button
            className="quiet-button"
            disabled={isFixture}
            title="Available after DataHub is connected"
            type="button"
          >
            Open in DataHub ↗
          </button>
        </div>

        <div className="content-grid">
          <div className="primary-column">
            <section className="panel lineage-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">ORGANIZATIONAL CONTEXT</p>
                  <h3>Blast radius</h3>
                </div>
                <span className="source-badge">{sourceLabel}</span>
              </div>
              <div className="lineage" aria-label="Affected data lineage">
                <div className="lineage-node failed" title={sourceAsset.evidenceId}>
                  <span className="node-type">{nodeType(sourceAsset)}</span>
                  <strong>{sourceAsset.name}</strong>
                  <small>{sourceAsset.platform}</small>
                </div>
                <span className="line-arrow">→</span>
                <div className="lineage-node" title={transformationAsset.evidenceId}>
                  <span className="node-type">{nodeType(transformationAsset)}</span>
                  <strong>{transformationAsset.name}</strong>
                  <small>{transformationAsset.platform}</small>
                </div>
                <span className="line-arrow">→</span>
                <div className="lineage-stack">
                  {downstreamAssets.map((asset) => (
                    <div className="lineage-node compact" key={asset.id} title={asset.evidenceId}>
                      <span className="node-type">{nodeType(asset)}</span>
                      <strong>{asset.name}</strong>
                    </div>
                  ))}
                </div>
              </div>
              <div className="owner-row">
                <span>Owner</span><strong>{incident.owner}</strong>
                <span>Policy</span><strong>{incident.policy}</strong>
                <span>Consumers</span><strong>{incident.consumers} active</strong>
              </div>
            </section>

            <section className="panel hypotheses-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">GROUNDED INVESTIGATION</p>
                  <h3>Competing hypotheses</h3>
                </div>
                <span className="agent-count">fixture investigation</span>
              </div>
              <div className="hypothesis-list">
                {incident.hypotheses.map((hypothesis) => (
                  <button
                    key={hypothesis.id}
                    className={`hypothesis ${selectedHypothesisId === hypothesis.id ? "selected" : ""}`}
                    onClick={() => setSelectedHypothesisId(hypothesis.id)}
                    aria-pressed={selectedHypothesisId === hypothesis.id}
                    type="button"
                  >
                    <span className="hypothesis-rank">{hypothesis.rank}</span>
                    <span className="hypothesis-copy">
                      <strong>{hypothesis.title}</strong>
                      <small>{hypothesis.summary}</small>
                    </span>
                    <span className="confidence">
                      <strong>{hypothesis.confidence}%</strong>
                      <span className="confidence-bar"><i style={{ width: `${hypothesis.confidence}%` }} /></span>
                    </span>
                    <span className={`verdict ${hypothesis.verdict.toLowerCase()}`}>{hypothesis.verdict}</span>
                  </button>
                ))}
              </div>
              <div className="review-note">
                <span className="reviewer-icon">R</span>
                <div>
                  <strong>Adversarial review</strong>
                  <p>
                    Selected hypothesis: <b>{selectedHypothesis.title}</b>. {selectedHypothesis.reviewerFinding}
                  </p>
                  <small className="evidence-refs">
                    Evidence: {[...selectedHypothesis.supportingEvidenceIds, ...selectedHypothesis.contradictingEvidenceIds].join(", ") || "none"}
                  </small>
                </div>
              </div>
            </section>

            <section className="panel investigation-panel">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">STRUCTURED AGENT FLOW</p>
                  <h3>Evidence-gated investigation</h3>
                </div>
                <span className="agent-count">4 bounded steps</span>
              </div>
              <ol className="investigation-flow">
                {incident.investigation.map((step) => (
                  <li key={step.id} className={step.status}>
                    <span className="agent-step">{step.agent.slice(0, 1).toUpperCase()}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <p>{step.finding}</p>
                      <small className="evidence-refs">Evidence: {step.evidenceIds.join(", ")}</small>
                    </div>
                    <span className="step-status">{step.status}</span>
                  </li>
                ))}
              </ol>
            </section>
          </div>

          <aside className="secondary-column">
            <section className="panel memory-panel">
              <div className="memory-orbit"><span>{incident.historicalMatch.similarity}%</span><small>match</small></div>
              <p className="eyebrow">{isPersistentMemory ? "PERSISTED HISTORICAL MATCH" : "HISTORICAL FIXTURE MATCH"}</p>
              <h3>{incident.historicalMatch.incidentId} · {incident.historicalMatch.title}</h3>
              <span className="memory-count">{incident.historicalMemoryCount} stored resolutions searched</span>
              <p className="memory-summary">{incident.historicalMatch.summary}</p>
              <dl>
                <div><dt>Root cause</dt><dd>{incident.historicalMatch.rootCause}</dd></div>
                <div><dt>Winning action</dt><dd>{incident.historicalMatch.winningAction}</dd></div>
                <div><dt>Outcome</dt><dd>{incident.historicalMatch.outcome}</dd></div>
              </dl>
              <small className="evidence-refs">Evidence: {incident.historicalMatch.evidenceId}</small>
              <div className="match-delta">
                <p className="eyebrow">MATCH DELTA · {incident.historicalMatch.incidentId}</p>
                <div>
                  <strong>Shared context</strong>
                  <ul>{incident.matchDelta.sharedContext.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div>
                  <strong>Changed context</strong>
                  <ul>{incident.matchDelta.changedContext.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <div className="assumption-list">
                  <strong>Do not transfer</strong>
                  <ul>{incident.matchDelta.nonTransferableAssumptions.map((item) => <li key={item}>{item}</li>)}</ul>
                </div>
                <p className="delta-recommendation">{incident.matchDelta.recommendation}</p>
              </div>
            </section>

            <section className="panel timeline-panel">
              <div className="panel-heading compact-heading">
                <h3>Investigation log</h3>
                <span>{isFixture ? "seeded" : "live"}</span>
              </div>
              <ol className="timeline">
                {incident.events.map((event) => (
                  <li key={event.id}>
                    <time>{event.occurredAt}</time>
                    <div><strong>{event.label}</strong><small>{event.actor}</small></div>
                  </li>
                ))}
              </ol>
            </section>

            <section className="panel live-context-panel" aria-live="polite">
              <div className="panel-heading compact-heading">
                <div>
                  <p className="eyebrow">READ-ONLY LOCAL DATAHUB</p>
                  <h3>Verified catalog context</h3>
                </div>
                <span className={liveContext ? "live-state connected" : "live-state"}>
                  {liveContext ? "connected" : "optional"}
                </span>
              </div>
              {liveContext ? (
                <div className="live-context-copy">
                  <strong>{liveContext.source.name}</strong>
                  <p>
                    {liveContext.source.owners.length ? `Owner: ${liveContext.source.owners.join(", ")}` : "No owner returned"}
                    {" · "}{liveContext.source.schemaFieldCount} fields
                  </p>
                  <p>{liveContext.downstreams.length} downstream assets observed from the local catalog.</p>
                  <small className="evidence-refs">Observed {new Date(liveContext.observedAt).toLocaleTimeString()}</small>
                </div>
              ) : (
                <div className="live-context-copy unavailable">
                  <p>{liveContextError ?? "Checking the local DataHub catalog…"}</p>
                  <small>Fixture investigation remains available without a catalog connection.</small>
                </div>
              )}
            </section>
          </aside>
        </div>

        <section className={`decision-bar ${decision ?? "pending"}`} aria-live="polite">
          <div className="decision-copy">
            <span className="decision-icon">✓</span>
            <div>
              <p className="eyebrow">HUMAN DECISION GATE · {incident.remediationPlan.riskClass.toUpperCase()}</p>
              <strong>
                {decision === "approved"
                  ? "Simulated remediation approved — awaiting execution"
                  : decision === "review"
                    ? "Additional review requested"
                    : incident.remediationPlan.objective}
              </strong>
            </div>
          </div>
          <div className="decision-actions">
            {!decision ? (
              <>
                <button className="quiet-button" disabled={isSubmitting} onClick={() => submitDecision("review")} type="button">
                  Request review
                </button>
                <button className="primary-button" disabled={isSubmitting} onClick={() => submitDecision("approved")} type="button">
                  {isSubmitting ? "Recording…" : "Approve simulated remediation"}
                </button>
              </>
            ) : (
              <span className="decision-recorded" role="status">
                {decision === "approved" ? "Approval recorded" : "Review request recorded"}
              </span>
            )}
            <button className="text-button" onClick={toggleReplay} type="button">
              {isReplayOpen ? "Hide audit replay" : "Show audit replay"}
            </button>
          </div>
          {submissionError ? <p className="decision-error" role="alert">{submissionError}</p> : null}
        </section>

        {isReplayOpen ? (
          <section className="panel audit-panel" aria-live="polite">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">AUDIT REPLAY · FIXTURE MEMORY</p>
                <h3>Why this action is bounded</h3>
              </div>
              <span className="source-badge">immutable projection</span>
            </div>
            {replay ? (
              <div className="audit-grid">
                <div>
                  <strong>Evidence chain</strong>
                  <ol>
                    {replay.evidence.map((evidence) => <li key={evidence.id}><b>{evidence.id}</b> · {evidence.summary}</li>)}
                  </ol>
                </div>
                <div>
                  <strong>Agent checks</strong>
                  <ol>
                    {replay.investigation.map((step) => <li key={step.id}><b>{step.agent}</b> · {step.label} <small>{step.evidenceIds.join(", ")}</small></li>)}
                  </ol>
                </div>
                <div>
                  <strong>Learning gate</strong>
                  <p>{replay.learning.candidateSummary}</p>
                  <ul>{replay.learning.safeguards.map((safeguard) => <li key={safeguard}>{safeguard}</li>)}</ul>
                  <small className="evidence-refs">{replay.decision ? `Human decision: ${replay.decision.kind} by ${replay.decision.actorId}` : "No human decision recorded yet."}</small>
                </div>
              </div>
            ) : replayError ? <p className="decision-error">{replayError}</p> : <p className="memory-summary">Loading the replay…</p>}
          </section>
        ) : null}
      </section>
    </main>
  );
}
