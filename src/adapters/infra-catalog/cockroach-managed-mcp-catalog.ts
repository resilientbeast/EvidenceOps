import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { InfrastructureCatalog } from "@/src/adapters/infra-catalog";
import {
  mapCatalogRow,
  type CatalogRow,
} from "@/src/adapters/infra-catalog/cockroach-catalog";
import type { InfrastructureContext } from "@/src/domain/incident";

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const identifierPattern = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface CockroachManagedMcpConfig {
  url: string;
  clusterId: string;
  apiKey: string;
  database: string;
}

interface McpRowsPayload {
  rows: unknown[];
}

interface McpCallPayload {
  isError?: boolean;
  content: unknown;
}

interface ReadOnlyMcpClient {
  select(query: string): Promise<unknown[]>;
}

function requireIdentifier(value: string, label: string): string {
  if (!identifierPattern.test(value)) {
    throw new Error(`${label} must be a plain CockroachDB identifier.`);
  }
  return value;
}

function requireIncidentId(value: string): string {
  if (!uuidPattern.test(value)) {
    throw new Error("Managed MCP catalog lookup requires a UUID incidentId.");
  }
  return value;
}

function textContent(value: unknown): string[] {
  if (!Array.isArray(value)) {
    throw new Error("CockroachDB Managed MCP returned an invalid content payload.");
  }
  return value.flatMap((item) => {
    if (
      item
      && typeof item === "object"
      && (item as { type?: unknown }).type === "text"
      && typeof (item as { text?: unknown }).text === "string"
    ) {
      return [(item as { text: string }).text];
    }
    return [];
  });
}

function parseRows(value: unknown): unknown[] {
  if (!value || typeof value !== "object" || !("content" in value)) {
    throw new Error("CockroachDB Managed MCP returned an invalid tool result.");
  }
  const result = value as McpCallPayload;
  const content = textContent(result.content);
  if (result.isError) {
    const message = content.join(" ");
    throw new Error(message || "CockroachDB Managed MCP select_query failed.");
  }

  const text = content.join("");
  if (!text) throw new Error("CockroachDB Managed MCP returned no tabular content.");

  const payload: unknown = JSON.parse(text);
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as McpRowsPayload).rows)) {
    throw new Error("CockroachDB Managed MCP returned an invalid select_query payload.");
  }
  return (payload as McpRowsPayload).rows;
}

export class CockroachManagedMcpClient implements ReadOnlyMcpClient {
  constructor(private readonly config: CockroachManagedMcpConfig) {}

  async select(query: string): Promise<unknown[]> {
    const client = new Client({ name: "evidenceops-infra-catalog", version: "0.1.0" });
    const transport = new StreamableHTTPClientTransport(new URL(this.config.url), {
      requestInit: {
        headers: {
          Authorization: `Bearer ${this.config.apiKey}`,
          "mcp-cluster-id": this.config.clusterId,
        },
      },
    });

    try {
      await client.connect(transport);
      const tools = await client.listTools(undefined, { timeout: 10_000 });
      if (!tools.tools.some((tool) => tool.name === "select_query")) {
        throw new Error("CockroachDB Managed MCP does not expose the required select_query tool.");
      }
      const result = await client.callTool(
        { name: "select_query", arguments: { query } },
        undefined,
        { timeout: 25_000 },
      );
      return parseRows(result);
    } finally {
      await client.close().catch(() => undefined);
    }
  }
}

export class CockroachManagedMcpCatalog implements InfrastructureCatalog {
  private readonly database: string;

  constructor(
    private readonly client: ReadOnlyMcpClient,
    database = "defaultdb",
  ) {
    this.database = requireIdentifier(database, "COCKROACHDB_MCP_DATABASE");
  }

  async getByIncidentId(incidentId: string): Promise<InfrastructureContext | null> {
    const id = requireIncidentId(incidentId);
    const database = this.database;
    const rows = await this.client.select(
      `SELECT srv.id::STRING AS server_id,
              srv.hostname,
              srv.panel,
              srv.region,
              site.id::STRING AS site_id,
              site.domain,
              site.owner,
              site.sla_tier,
              svc.id::STRING AS service_id,
              svc.kind AS service_kind,
              svc.name AS service_name,
              svc.status AS service_status,
              svc.metadata AS service_metadata
         FROM ${database}.public.incidents AS inc
         JOIN ${database}.public.services AS svc ON svc.id = inc.service_id
         JOIN ${database}.public.sites AS site ON site.id = svc.site_id
         JOIN ${database}.public.servers AS srv ON srv.id = site.server_id
        WHERE inc.id = '${id}'::UUID
        LIMIT 1`,
    );
    const row = rows[0];
    if (!row || typeof row !== "object" || Array.isArray(row)) return null;
    return mapCatalogRow(
      row as unknown as CatalogRow,
      new Date().toISOString(),
      "cockroachdb-managed-mcp",
    );
  }
}
