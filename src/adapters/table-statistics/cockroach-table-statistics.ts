import type { Pool } from "pg";
import type { Evidence } from "@/src/domain/incident";

const evidenceId = "EVD-TABLE-STATISTICS";
const skillCommit = "e14e86d23ce8ee2e7e40a34ce2944c2502b6eadd";
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

interface StatisticsRow {
  created: string | Date | null;
}

export interface TableStatisticsEvidenceProvider {
  observe(): Promise<Evidence>;
}

function requireIdentifier(value: string, label: string): string {
  if (!identifierPattern.test(value)) {
    throw new Error(`${label} must be a plain CockroachDB identifier.`);
  }
  return value;
}

function unavailableEvidence(database: string, reason: string): Evidence {
  return {
    id: evidenceId,
    kind: "table-statistics",
    sourceSystem: "cockroachdb",
    sourceRef: `cockroachdb-skills@${skillCommit}:auditing-table-statistics;table=${database}.public.incidents`,
    observedAt: new Date().toISOString(),
    summary: `Optimizer table-statistics evidence is unknown: ${reason}. The investigation continues without this optional observation.`,
  };
}

function createdAt(value: string | Date | null): Date | null {
  if (!value) return null;
  const parsed = value instanceof Date ? value : new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function freshness(latest: Date | null, now: Date): string {
  if (!latest) return "no valid collection timestamp";
  const ageDays = Math.max(0, (now.getTime() - latest.getTime()) / 86_400_000);
  if (ageDays > 30) return `very stale (${Math.floor(ageDays)}d old)`;
  if (ageDays > 7) return `stale (${Math.floor(ageDays)}d old)`;
  return `fresh (${Math.floor(ageDays)}d old)`;
}

export class CockroachTableStatisticsEvidenceProvider implements TableStatisticsEvidenceProvider {
  private readonly database: string;

  constructor(
    private readonly pool: Pick<Pool, "query">,
    database = "defaultdb",
  ) {
    this.database = requireIdentifier(database, "COCKROACHDB_STATS_DATABASE");
  }

  async observe(): Promise<Evidence> {
    const table = `${this.database}.public.incidents`;
    const observedAt = new Date();
    try {
      // Exact constrained diagnostic from the pinned auditing-table-statistics
      // skill; no caller can choose another statement or table.
      const result = await this.pool.query<StatisticsRow>(`SHOW STATISTICS FOR TABLE ${table}`);
      const collections = result.rows
        .map((row) => createdAt(row.created))
        .filter((value): value is Date => value !== null);
      const latest = collections.sort((left, right) => right.getTime() - left.getTime())[0] ?? null;
      const statisticCount = result.rows.length;
      const status = statisticCount === 0
        ? "no optimizer statistics were returned"
        : `${statisticCount} statistic${statisticCount === 1 ? "" : "s"} returned; ${freshness(latest, observedAt)}`;
      return {
        id: evidenceId,
        kind: "table-statistics",
        sourceSystem: "cockroachdb",
        sourceRef: `cockroachdb-skills@${skillCommit}:auditing-table-statistics;table=${table}`,
        observedAt: observedAt.toISOString(),
        summary: `SHOW STATISTICS FOR TABLE ${table}: ${status}.`,
      };
    } catch {
      return unavailableEvidence(this.database, "the constrained SHOW STATISTICS check was unavailable");
    }
  }
}
