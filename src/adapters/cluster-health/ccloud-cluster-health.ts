import type { Evidence } from "@/src/domain/incident";

const evidenceId = "EVD-CLUSTER-HEALTH";
const defaultTimeoutMs = 5_000;
const defaultCacheMs = 30_000;
const maxTimeoutMs = 15_000;
const maxCacheMs = 300_000;
const defaultCloudApiUrl = "https://cockroachlabs.cloud/api/v1";

interface CcloudClusterInfo {
  id?: unknown;
  name?: unknown;
  state?: unknown;
  plan?: unknown;
  cloud_provider?: unknown;
  cockroach_version?: unknown;
  regions?: unknown;
}

interface CachedEvidence {
  expiresAt: number;
  evidence: Evidence;
}

export interface ClusterHealthEvidenceProvider {
  observe(): Promise<Evidence>;
}

export interface CcloudClusterHealthConfig {
  apiKey: string | undefined;
  apiUrl: string;
  clusterId: string | undefined;
  timeoutMs: number;
  cacheMs: number;
}

function boundedInteger(value: string | undefined, fallback: number, maximum: number): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isInteger(parsed) && parsed > 0 ? Math.min(parsed, maximum) : fallback;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

function primaryRegion(value: unknown): string | null {
  if (!Array.isArray(value)) return null;
  const region = value.find((item) => item && typeof item === "object" && (item as { primary?: unknown }).primary === true)
    ?? value[0];
  return region && typeof region === "object" ? stringField((region as { name?: unknown }).name) : null;
}

function unavailableEvidence(clusterId: string | undefined, reason: string): Evidence {
  const observedAt = new Date().toISOString();
  return {
    id: evidenceId,
    kind: "cluster-health",
    sourceSystem: "cockroachdb-cloud",
    sourceRef: clusterId ? `cockroachdb-cloud-api:cluster:${clusterId}` : "cockroachdb-cloud-api:cluster:unconfigured",
    observedAt,
    summary: `CockroachDB Cloud cluster health is unknown: ${reason}. The investigation continues without this optional observation.`,
  };
}

function availableEvidence(clusterId: string, result: CcloudClusterInfo): Evidence {
  const observedAt = new Date().toISOString();
  const name = stringField(result.name) ?? clusterId;
  const id = stringField(result.id) ?? clusterId;
  const state = stringField(result.state) ?? "UNKNOWN";
  const plan = stringField(result.plan);
  const provider = stringField(result.cloud_provider);
  const version = stringField(result.cockroach_version);
  const region = primaryRegion(result.regions);
  const details = [plan, provider, region, version].filter((value): value is string => Boolean(value)).join(" · ");

  return {
    id: evidenceId,
    kind: "cluster-health",
    sourceSystem: "cockroachdb-cloud",
    sourceRef: `cockroachdb-cloud-api:cluster:${id ?? name}`,
    observedAt,
    summary: `CockroachDB Cloud cluster ${name} reported state ${state}${details ? ` (${details})` : ""}.`,
  };
}

export function getCcloudClusterHealthConfig(
  environment: Record<string, string | undefined> = process.env,
): CcloudClusterHealthConfig {
  return {
    apiKey: environment.COCKROACHDB_CLOUD_API_KEY ?? environment.COCKROACHDB_MCP_API_KEY,
    apiUrl: environment.COCKROACHDB_CLOUD_API_URL ?? defaultCloudApiUrl,
    clusterId: environment.COCKROACHDB_MCP_CLUSTER_ID,
    timeoutMs: boundedInteger(environment.CCLOUD_HEALTH_TIMEOUT_MS, defaultTimeoutMs, maxTimeoutMs),
    cacheMs: boundedInteger(environment.CCLOUD_HEALTH_CACHE_MS, defaultCacheMs, maxCacheMs),
  };
}

export class CcloudClusterHealthEvidenceProvider implements ClusterHealthEvidenceProvider {
  private cached: CachedEvidence | null = null;

  constructor(private readonly config: CcloudClusterHealthConfig) {}

  async observe(): Promise<Evidence> {
    if (!this.config.clusterId || !this.config.apiKey) {
      return unavailableEvidence(this.config.clusterId, "CockroachDB Cloud API credentials are not configured");
    }

    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return { ...this.cached.evidence, observedAt: new Date().toISOString() };
    }

    let evidence: Evidence;
    try {
      const response = await fetch(`${this.config.apiUrl}/clusters/${encodeURIComponent(this.config.clusterId)}`, {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${this.config.apiKey}`,
        },
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });
      if (!response.ok) {
        throw new Error("CockroachDB Cloud API did not return cluster health");
      }
      const result: unknown = await response.json();
      if (!result || typeof result !== "object" || Array.isArray(result)) {
        throw new Error("CockroachDB Cloud API returned an invalid cluster payload");
      }
      evidence = availableEvidence(this.config.clusterId, result as CcloudClusterInfo);
    } catch (error) {
      const detail = error instanceof DOMException && error.name === "TimeoutError"
        ? `the CockroachDB Cloud API check exceeded ${this.config.timeoutMs}ms`
        : "the CockroachDB Cloud API check was unavailable";
      evidence = unavailableEvidence(this.config.clusterId, detail);
    }

    this.cached = { evidence, expiresAt: now + this.config.cacheMs };
    return evidence;
  }
}
