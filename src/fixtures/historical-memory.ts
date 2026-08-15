import type { HistoricalMemoryRecord } from "@/src/domain/incident";

// The local fallback deliberately has no invented historical match. Comparable
// cases are retrieved from CockroachDB when that configured source is available.
export const historicalMemoryFixtures: HistoricalMemoryRecord[] = [];
