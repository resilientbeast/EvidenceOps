"use client";

import { useState } from "react";

type Intake = {
  id: string;
  status: "pending_review" | "reviewed" | "dismissed" | "promoted";
  summary: string;
  eventType: string;
  receivedAt: string;
  reviewedAt: string | null;
  reviewedBy: string | null;
  reviewNote: string | null;
  promotedIncidentId: string | null;
};

export function IntakeReviewQueue({ initialIntakes, initialError = "" }: { initialIntakes: Intake[]; initialError?: string }) {
  const [intakes, setIntakes] = useState(initialIntakes);
  const [error, setError] = useState(initialError);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function review(id: string, status: "reviewed" | "dismissed") {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/intakes/${id}/review`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const payload = await response.json() as { intake?: Intake; error?: string };
      if (!response.ok || !payload.intake) throw new Error(payload.error ?? "Unable to review intake.");
      setIntakes((current) => current.map((intake) => intake.id === id ? payload.intake! : intake));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to review intake.");
    } finally {
      setBusyId(null);
    }
  }

  async function promote(id: string) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/intakes/${id}/promote`, { method: "POST" });
      const payload = await response.json() as { incidentId?: string; error?: string };
      if (!response.ok || !payload.incidentId) throw new Error(payload.error ?? "Unable to promote intake.");
      window.location.assign(`/dashboard?incident=${encodeURIComponent(payload.incidentId)}`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Unable to promote intake.");
      setBusyId(null);
    }
  }

  return (
    <main className="settings-shell">
      <header className="settings-topbar">
        <a className="settings-brand" href="/dashboard"><span>EO</span><strong>EvidenceOps</strong></a>
        <a className="settings-back" href="/dashboard">← Incident command</a>
      </header>
      <section className="settings-content" aria-labelledby="intake-title">
        <p className="settings-eyebrow">Human decision gate</p>
        <h1 id="intake-title">Slack intake review</h1>
        <p className="settings-intro">Accepted Slack messages wait here as redacted evidence. Reviewing an intake never starts an investigation or proposes a remediation automatically.</p>
        {error && <p className="settings-message error" role="status">{error}</p>}
        <div className="intake-list">
          {intakes.length === 0 && <p className="intake-empty">No Slack messages are awaiting review.</p>}
          {intakes.map((intake) => (
            <article className="intake-card" key={intake.id}>
              <div className="intake-card-meta"><span>{intake.eventType}</span><span>{intake.status.replace("_", " ")}</span></div>
              <p>{intake.summary}</p>
              <small>Received {new Date(intake.receivedAt).toLocaleString()}</small>
              {intake.status === "pending_review" ? (
                <div className="intake-actions">
                  <button type="button" disabled={busyId === intake.id} onClick={() => review(intake.id, "reviewed")}>Mark reviewed</button>
                  <button type="button" className="intake-dismiss" disabled={busyId === intake.id} onClick={() => review(intake.id, "dismissed")}>Dismiss</button>
                </div>
              ) : intake.status === "reviewed" ? (
                <div className="intake-actions">
                  <button type="button" disabled={busyId === intake.id} onClick={() => promote(intake.id)}>Promote to incident</button>
                </div>
              ) : intake.status === "promoted" && intake.promotedIncidentId ? (
                <a className="settings-back" href={`/dashboard?incident=${encodeURIComponent(intake.promotedIncidentId)}`}>Open promoted incident →</a>
              ) : <small>Reviewed by {intake.reviewedBy ?? "operator"}.</small>}
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
