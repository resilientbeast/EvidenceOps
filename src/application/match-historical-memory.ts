import type { HistoricalMemoryRecord, Incident, MatchDelta } from "@/src/domain/incident";

export interface RetrievedHistoricalMatch {
  record: HistoricalMemoryRecord;
  similarity: number;
  matchDelta: MatchDelta;
}

function vectorSimilarity(distance: number): number {
  // Titan embeddings are normalized. For unit vectors, cosine similarity = 1 - d²/2.
  return Math.round(Math.max(0, Math.min(1, 1 - (distance * distance) / 2)) * 100);
}

function sentence(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function legacyDelta(incident: Incident, record: HistoricalMemoryRecord): MatchDelta {
  const sharedAssets = record.downstreamAssetIds.filter((id) =>
    incident.blastRadius.some((asset) => asset.id === id),
  );
  const sharedNames = incident.blastRadius
    .filter((asset) => sharedAssets.includes(asset.id))
    .map((asset) => asset.name);
  const currentOnlyAssets = incident.blastRadius
    .filter((asset) => !record.downstreamAssetIds.includes(asset.id) && asset.id !== incident.blastRadius[0]?.id)
    .map((asset) => asset.name);

  return {
    sharedContext: [
      ...(record.sourceAssetUrn === incident.sourceAssetUrn ? [`Same ${incident.blastRadius[0]?.name ?? "source"} source asset.`] : []),
      ...(record.assertionName === incident.assertionName ? [`Same ${incident.assertionName} assertion.`] : []),
      ...(sharedNames.length ? [`Shared downstream assets: ${sharedNames.join(", ")}.`] : []),
    ],
    changedContext: [
      ...(currentOnlyAssets.length ? [`Current blast radius additionally includes ${currentOnlyAssets.join(", ")}.`] : []),
      record.durationMinutes === null
        ? "The historical incident has no precise duration; the current incident remains under investigation."
        : `Historical incident resolved in ${record.durationMinutes} minutes; the current incident remains under investigation.`,
    ],
    nonTransferableAssumptions: record.verificationRequirements,
    recommendation: `Reuse the diagnostic sequence from ${record.incidentId}, not its resolution. Confirm current conditions before proposing ${record.winningAction.toLowerCase()}.`,
  };
}

function infrastructureDelta(incident: Incident, record: HistoricalMemoryRecord): MatchDelta {
  const current = incident.infrastructure;
  const historical = record.infrastructure;
  if (!current || !historical) return legacyDelta(incident, record);

  const shared = [
    ...(current.service.kind === historical.service.kind
      ? [`Same ${current.service.kind} service kind.`]
      : []),
    ...(current.server.panel === historical.server.panel && current.server.panel
      ? [`Both services run under ${current.server.panel}.`]
      : []),
    ...(record.sharedSignals ?? []).map(sentence),
  ];
  const changed = [
    ...(current.site.domain !== historical.site.domain
      ? [`Different site: current ${current.site.domain}; historical ${historical.site.domain}.`]
      : []),
    ...(incident.severity !== record.severity
      ? [`Severity differs: current ${incident.severity}; historical ${record.severity}.`]
      : []),
    ...(record.changedSignals ?? []).map(sentence),
    record.durationMinutes === null
      ? "The historical record has no precise duration; the current incident remains open."
      : `The historical incident resolved in ${record.durationMinutes} minutes; the current incident remains open.`,
  ];

  return {
    sharedContext: shared.length ? shared : ["The semantic evidence bundle is similar, but no structured infrastructure field is identical."],
    changedContext: changed,
    nonTransferableAssumptions: record.verificationRequirements,
    recommendation: `Reuse the diagnostic sequence from ${record.incidentId}, not its resolution. Verify current Redis pressure and live lock ownership before proposing any capacity or lock change.`,
  };
}

export function retrieveHistoricalMatch(
  incident: Incident,
  records: HistoricalMemoryRecord[],
): RetrievedHistoricalMatch | null {
  const selected = records[0];
  if (!selected) return null;

  // CockroachDB already returns nearest neighbours in vector-distance order. Fixture
  // records preserve their curated similarity so the offline demo remains deterministic.
  const similarity = selected.vectorDistance === undefined
    ? incident.historicalMatch.similarity
    : vectorSimilarity(selected.vectorDistance);

  return {
    record: selected,
    similarity,
    matchDelta: selected.infrastructure
      ? infrastructureDelta(incident, selected)
      : legacyDelta(incident, selected),
  };
}

export function applyHistoricalMemory(incident: Incident, records: HistoricalMemoryRecord[]): Incident {
  const match = retrieveHistoricalMatch(incident, records);
  const historicalMemoryCount = records[0]?.corpusCount ?? records.length;
  if (!match) return { ...incident, historicalMemoryCount };

  const resolvedSummary = match.record.resolvedAt
    ? `${match.record.title} resolved on ${new Date(match.record.resolvedAt).toLocaleDateString("en-SG")}.`
    : `${match.record.title} has an operator-confirmed resolution with intentionally date-only timing.`;
  const retrievalSummary = match.record.vectorDistance === undefined
    ? `Retrieved from ${historicalMemoryCount} stored resolutions.`
    : `Retrieved by vector similarity from ${historicalMemoryCount} stored resolutions.`;
  const historicalEvidence = incident.evidence.map((evidence) =>
    evidence.id === "EVD-004"
      ? {
          ...evidence,
          sourceRef: `incident:${match.record.incidentId}`,
          observedAt: match.record.resolvedAt ?? evidence.observedAt,
          summary: `CockroachDB vector search retrieved ${match.record.title} at ${match.similarity}% similarity.`,
        }
      : evidence,
  );

  return {
    ...incident,
    evidence: historicalEvidence,
    historicalMemoryCount,
    historicalMatch: {
      incidentId: match.record.incidentId,
      title: match.record.title,
      similarity: match.similarity,
      summary: `${retrievalSummary} ${resolvedSummary}`,
      rootCause: match.record.rootCause,
      winningAction: match.record.winningAction,
      outcome: match.record.outcome,
      evidenceId: match.record.evidenceId,
    },
    matchDelta: match.matchDelta,
  };
}
