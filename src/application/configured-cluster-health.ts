import {
  CcloudClusterHealthEvidenceProvider,
  getCcloudClusterHealthConfig,
  type ClusterHealthEvidenceProvider,
} from "@/src/adapters/cluster-health/ccloud-cluster-health";

let provider: ClusterHealthEvidenceProvider | null = null;
let configurationKey: string | null = null;

export function getConfiguredClusterHealthEvidenceProvider(
  environment: Record<string, string | undefined> = process.env,
): ClusterHealthEvidenceProvider {
  const config = getCcloudClusterHealthConfig(environment);
  const key = JSON.stringify(config);
  if (!provider || configurationKey !== key) {
    provider = new CcloudClusterHealthEvidenceProvider(config);
    configurationKey = key;
  }
  return provider;
}
