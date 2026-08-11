import type { InfrastructureCatalog } from "@/src/adapters/infra-catalog";
import { CockroachCatalog } from "@/src/adapters/infra-catalog/cockroach-catalog";
import {
  CockroachManagedMcpCatalog,
  CockroachManagedMcpClient,
} from "@/src/adapters/infra-catalog/cockroach-managed-mcp-catalog";
import { getConfiguredCockroachPool } from "@/src/application/configured-incident-repository";

export type CockroachCatalogMode = "auto" | "mcp" | "sql";

function catalogMode(value: string | undefined): CockroachCatalogMode {
  const mode = value ?? "auto";
  if (mode === "auto" || mode === "mcp" || mode === "sql") return mode;
  throw new Error("COCKROACHDB_CATALOG_MODE must be auto, mcp, or sql.");
}

export function getConfiguredInfrastructureCatalog(
  environment: Record<string, string | undefined> = process.env,
): InfrastructureCatalog {
  const mode = catalogMode(environment.COCKROACHDB_CATALOG_MODE);
  const url = environment.COCKROACHDB_MCP_URL;
  const clusterId = environment.COCKROACHDB_MCP_CLUSTER_ID;
  const apiKey = environment.COCKROACHDB_MCP_API_KEY;
  const hasManagedMcp = Boolean(url && clusterId && apiKey);

  if (mode === "mcp" && !hasManagedMcp) {
    throw new Error(
      "Strict Managed MCP catalog mode requires COCKROACHDB_MCP_URL, COCKROACHDB_MCP_CLUSTER_ID, and COCKROACHDB_MCP_API_KEY.",
    );
  }
  if (mode === "mcp" || (mode === "auto" && hasManagedMcp)) {
    return new CockroachManagedMcpCatalog(
      new CockroachManagedMcpClient({
        url: url as string,
        clusterId: clusterId as string,
        apiKey: apiKey as string,
        database: environment.COCKROACHDB_MCP_DATABASE ?? "defaultdb",
      }),
      environment.COCKROACHDB_MCP_DATABASE ?? "defaultdb",
    );
  }

  const pool = getConfiguredCockroachPool(environment);
  if (!pool) throw new Error("COCKROACHDB_URL is not configured for SQL catalog fallback.");
  return new CockroachCatalog(pool);
}
