import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import {
  assessCockroachMcpTools,
  assertSelectOnlyCall,
} from "./lib/cockroach-mcp-capabilities.mjs";

const url = process.env.COCKROACHDB_MCP_URL;
const clusterId = process.env.COCKROACHDB_MCP_CLUSTER_ID;
const apiKey = process.env.COCKROACHDB_MCP_API_KEY;
const incidentId = process.env.RECALLOPS_ACTIVE_INCIDENT_ID;
const database = process.env.COCKROACHDB_MCP_DATABASE ?? "defaultdb";
if (!url || !clusterId || !apiKey || !incidentId) {
  throw new Error(
    "COCKROACHDB_MCP_URL, COCKROACHDB_MCP_CLUSTER_ID, COCKROACHDB_MCP_API_KEY, and RECALLOPS_ACTIVE_INCIDENT_ID are required.",
  );
}
if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(database)) {
  throw new Error("COCKROACHDB_MCP_DATABASE must be a plain identifier.");
}
if (!/^[0-9a-f-]{36}$/i.test(incidentId)) {
  throw new Error("RECALLOPS_ACTIVE_INCIDENT_ID must be a UUID.");
}

const client = new Client({ name: "evidenceops-mcp-smoke", version: "0.1.0" });
const transport = new StreamableHTTPClientTransport(new URL(url), {
  requestInit: {
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "mcp-cluster-id": clusterId,
    },
  },
});

try {
  await client.connect(transport);
  const listed = await client.listTools(undefined, { timeout: 10_000 });
  const assessment = assessCockroachMcpTools(listed.tools);
  if (assessment.missingRequiredTools.length) {
    throw new Error(`Managed MCP is missing: ${assessment.missingRequiredTools.join(", ")}.`);
  }

  const request = assertSelectOnlyCall("select_query", {
    query: `SELECT site.domain, srv.hostname, svc.kind
              FROM ${database}.public.incidents AS inc
              JOIN ${database}.public.services AS svc ON svc.id = inc.service_id
              JOIN ${database}.public.sites AS site ON site.id = svc.site_id
              JOIN ${database}.public.servers AS srv ON srv.id = site.server_id
             WHERE inc.id = '${incidentId}'::UUID
             LIMIT 1`,
  });
  const result = await client.callTool(request, undefined, { timeout: 25_000 });
  if (result.isError) throw new Error("Managed MCP select_query returned an error result.");
  const text = result.content
    .filter((item) => item.type === "text")
    .map((item) => item.text)
    .join("");
  const payload = JSON.parse(text);
  const row = payload.rows?.[0];
  if (!row?.domain || !row?.hostname || !row?.kind) {
    throw new Error("Managed MCP did not return the expected catalog row.");
  }
  console.log(
    `COCKROACH_MCP_OK cluster_scoped=true tool=select_query domain=${row.domain} hostname=${row.hostname} service=${row.kind}`,
  );
  console.log(
    `MCP_APP_BOUNDARY select_only=true server_write_tools_exposed=${assessment.exposedWriteTools.length}`,
  );
} finally {
  await client.close().catch(() => undefined);
}
