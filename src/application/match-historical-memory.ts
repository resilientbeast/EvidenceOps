import type { HistoricalMemoryRecord, Incident, MatchDelta } from "@/src/domain/incident";

export interface RetrievedHistoricalMatch {
  record: HistoricalMemoryRecord;
  similarity: number;
  matchDelta: MatchDelta;
}

function sourceName(incident: Incident): string {
  return incident.blastRadius[0]?.name ?? "source asset";
}

function assetNames(incident: Incident, ids: string[]): string[] {
  return incident.blastRadius.filter((asset) => ids.includes(asset.id)).map((asset) => asset.name);
}

export function retrieveHistoricalMatch(incident: Incident, records: HistoricalMemoryRecord[]): RetrievedHistoricalMatch | null {
  const candidates = records.map((record) => {
    const sameSource = record.sourceAssetUrn === incident.sourceAssetUrn;
    const sameAssertion = record.assertionName === incident.assertionName;
    const sameSeverity = record.severity === incident.severity;
    const sharedAssets = record.downstreamAssetIds.filter((id) => incident.blastRadius.some((asset) => asset.id === id));
    const overlapScore = record.downstreamAssetIds.length
      ? Math.round((sharedAssets.length / record.downstreamAssetIds.length) * 12)
      : 0;
    const similarity = Math.min(99, (sameSource ? 45 : 0) + (sameAssertion ? 25 : 0) + (sameSeverity ? 10 : 0) + overlapScore);
    return { record, similarity, sharedAssets, sameSource, sameAssertion };
  }).sort((left, right) => right.similarity - left.similarity || right.record.resolvedAt.localeCompare(left.record.resolvedAt));

  const selected = candidates[0];
  if (!selected || selected.similarity < 40) return null;

  const currentOnlyAssets = incident.blastRadius
    .filter((asset) => !selected.record.downstreamAssetIds.includes(asset.id) && asset.id !== incident.blastRadius[0]?.id)
    .map((asset) => asset.name);
  const shared = [
    ...(selected.sameSource ? [`Same ${sourceName(incident)} source asset.`] : []),
    ...(selected.sameAssertion ? [`Same ${incident.assertionName} assertion.`] : []),
    ...(selected.sharedAssets.length ? [`Shared downstream assets: ${assetNames(incident, selected.sharedAssets).join(", ")}.`] : []),
  ];
  const changed = [
    ...(currentOnlyAssets.length ? [`Current blast radius additionally includes ${currentOnlyAssets.join(", ")}.`] : []),
    `Historical incident resolved in ${selected.record.durationMinutes} minutes; the current incident remains open for investigation.`,
  ];

  return {
    record: selected.record,
    similarity: selected.similarity,
    matchDelta: {
      sharedContext: shared,
      changedContext: changed,
      nonTransferableAssumptions: selected.record.verificationRequirements,
      recommendation: `Reuse the diagnostic sequence from ${selected.record.incidentId}, not its resolution. Confirm the current conditions before proposing ${selected.record.winningAction.toLowerCase()}.`,
    },
  };
}

export function applyHistoricalMemory(incident: Incident, records: HistoricalMemoryRecord[]): Incident {
  const match = retrieveHistoricalMatch(incident, records);
  if (!match) return { ...incident, historicalMemoryCount: records.length };

  return {
    ...incident,
    historicalMemoryCount: records.length,
    historicalMatch: {
      incidentId: match.record.incidentId,
      title: match.record.title,
      similarity: match.similarity,
      summary: `Retrieved from ${records.length} stored resolutions. ${match.record.title} resolved on ${new Date(match.record.resolvedAt).toLocaleDateString("en-SG")}.`,
      rootCause: match.record.rootCause,
      winningAction: match.record.winningAction,
      outcome: match.record.outcome,
      evidenceId: match.record.evidenceId,
    },
    matchDelta: match.matchDelta,
  };
}
