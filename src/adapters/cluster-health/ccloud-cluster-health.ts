import { execFile as executeFile } from "node:child_process";
import { readFile, stat } from "node:fs/promises";
import { promisify } from "node:util";
import type { Evidence } from "@/src/domain/incident";

const execFile = promisify(executeFile);
const evidenceId = "EVD-CLUSTER-HEALTH";
const defaultTimeoutMs = 5_000;
const defaultCacheMs = 30_000;
const defaultSnapshotMaxAgeMs = 120_000;
const maxTimeoutMs = 15_000;
const maxCacheMs = 300_000;
const maxSnapshotMaxAgeMs = 300_000;

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
  command: string;
  clusterName: string | undefined;
  clusterId: string | undefined;
  timeoutMs: number;
  cacheMs: number;
  snapshotFile: string | undefined;
  snapshotMaxAgeMs: number;
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

function unavailableEvidence(clusterName: string | undefined, reason: string): Evidence {
  const observedAt = new Date().toISOString();
  return {
    id: evidenceId,
    kind: "cluster-health",
    sourceSystem: "cockroachdb-cloud",
    sourceRef: clusterName ? `ccloud:cluster:${clusterName}` : "ccloud:cluster:unconfigured",
    observedAt,
    summary: `CockroachDB Cloud cluster health is unknown: ${reason}. The investigation continues without this optional observation.`,
  };
}

function wasKilledProcess(error: unknown): boolean {
  return Boolean(
    error
    && typeof error === "object"
    && "killed" in error
    && (error as { killed?: unknown }).killed === true,
  );
}

function availableEvidence(
  clusterName: string,
  clusterId: string | undefined,
  result: CcloudClusterInfo,
  observedAt = new Date().toISOString(),
): Evidence {
  const name = stringField(result.name) ?? clusterName;
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
    sourceRef: `ccloud:cluster:${id ?? name}`,
    observedAt,
    summary: `CockroachDB Cloud cluster ${name} reported state ${state}${details ? ` (${details})` : ""}.`,
  };
}

export function getCcloudClusterHealthConfig(
  environment: Record<string, string | undefined> = process.env,
): CcloudClusterHealthConfig {
  return {
    command: environment.CCLOUD_COMMAND ?? "ccloud",
    clusterName: environment.CCLOUD_CLUSTER_NAME,
    clusterId: environment.COCKROACHDB_MCP_CLUSTER_ID,
    timeoutMs: boundedInteger(environment.CCLOUD_HEALTH_TIMEOUT_MS, defaultTimeoutMs, maxTimeoutMs),
    cacheMs: boundedInteger(environment.CCLOUD_HEALTH_CACHE_MS, defaultCacheMs, maxCacheMs),
    snapshotFile: environment.CCLOUD_HEALTH_FILE,
    snapshotMaxAgeMs: boundedInteger(environment.CCLOUD_HEALTH_MAX_AGE_MS, defaultSnapshotMaxAgeMs, maxSnapshotMaxAgeMs),
  };
}

async function readCurrentSnapshot(path: string, maxAgeMs: number): Promise<{ result: CcloudClusterInfo; observedAt: string }> {
  const [raw, details] = await Promise.all([readFile(path, "utf8"), stat(path)]);
  if (Date.now() - details.mtimeMs > maxAgeMs) {
    throw new Error("ccloud health snapshot is stale");
  }
  const result: unknown = JSON.parse(raw);
  if (!result || typeof result !== "object" || Array.isArray(result)) {
    throw new Error("ccloud health snapshot is invalid");
  }
  return { result: result as CcloudClusterInfo, observedAt: details.mtime.toISOString() };
}

export class CcloudClusterHealthEvidenceProvider implements ClusterHealthEvidenceProvider {
  private cached: CachedEvidence | null = null;

  constructor(private readonly config: CcloudClusterHealthConfig) {}

  async observe(): Promise<Evidence> {
    if (!this.config.clusterName) {
      return unavailableEvidence(undefined, "CCLOUD_CLUSTER_NAME is not configured");
    }

    const now = Date.now();
    if (this.cached && this.cached.expiresAt > now) {
      return { ...this.cached.evidence, observedAt: new Date().toISOString() };
    }

    let evidence: Evidence;
    try {
      if (this.config.snapshotFile) {
        const snapshot = await readCurrentSnapshot(this.config.snapshotFile, this.config.snapshotMaxAgeMs);
        evidence = availableEvidence(this.config.clusterName, this.config.clusterId, snapshot.result, snapshot.observedAt);
      } else {
        const { stdout } = await execFile(
          this.config.command,
          ["cluster", "info", this.config.clusterName, "--quiet", "--output", "json"],
          { timeout: this.config.timeoutMs, windowsHide: true, maxBuffer: 64 * 1024 },
        );
        const result: unknown = JSON.parse(stdout);
        if (!result || typeof result !== "object" || Array.isArray(result)) {
          throw new Error("ccloud returned an invalid cluster-info payload");
        }
        evidence = availableEvidence(this.config.clusterName, this.config.clusterId, result as CcloudClusterInfo);
      }
    } catch (error) {
      const detail = wasKilledProcess(error)
        ? `the ccloud check exceeded ${this.config.timeoutMs}ms`
        : "the ccloud check was unavailable";
      evidence = unavailableEvidence(this.config.clusterName, detail);
    }

    this.cached = { evidence, expiresAt: now + this.config.cacheMs };
    return evidence;
  }
}
