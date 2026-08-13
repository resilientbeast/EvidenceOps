import {
  CockroachTableStatisticsEvidenceProvider,
  type TableStatisticsEvidenceProvider,
} from "@/src/adapters/table-statistics/cockroach-table-statistics";
import { getConfiguredCockroachPool } from "@/src/application/configured-incident-repository";
import type { Evidence } from "@/src/domain/incident";

class UnavailableTableStatisticsEvidenceProvider implements TableStatisticsEvidenceProvider {
  constructor(private readonly reason: string) {}

  async observe(): Promise<Evidence> {
    return {
      id: "EVD-TABLE-STATISTICS",
      kind: "table-statistics",
      sourceSystem: "cockroachdb",
      sourceRef: "cockroachdb-skills@e14e86d23ce8ee2e7e40a34ce2944c2502b6eadd:auditing-table-statistics;table=unconfigured",
      observedAt: new Date().toISOString(),
      summary: `Optimizer table-statistics evidence is unknown: ${this.reason}. The investigation continues without this optional observation.`,
    };
  }
}

export function getConfiguredTableStatisticsEvidenceProvider(
  environment: Record<string, string | undefined> = process.env,
): TableStatisticsEvidenceProvider {
  const pool = getConfiguredCockroachPool(environment);
  if (!pool) return new UnavailableTableStatisticsEvidenceProvider("COCKROACHDB_URL is not configured");
  try {
    return new CockroachTableStatisticsEvidenceProvider(
      pool,
      environment.COCKROACHDB_STATS_DATABASE ?? "defaultdb",
    );
  } catch {
    return new UnavailableTableStatisticsEvidenceProvider("COCKROACHDB_STATS_DATABASE is invalid");
  }
}
