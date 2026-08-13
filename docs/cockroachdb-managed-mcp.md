# CockroachDB Cloud Managed MCP read path

EvidenceOps uses CockroachDB Cloud's hosted MCP endpoint for the Investigator's
infrastructure-catalog read. Distributed vector retrieval and transactional
decision/audit writes remain behind `IncidentRepository` and the direct SQL
connection.

## Production authentication

The deployed service is a non-interactive MCP client. Create a dedicated
CockroachDB Cloud service account and API key, grant it access only to the
EvidenceOps cluster, and configure:

```dotenv
COCKROACHDB_MCP_URL=https://cockroachlabs.cloud/mcp
COCKROACHDB_MCP_CLUSTER_ID=your-cluster-id
COCKROACHDB_MCP_API_KEY=your-service-account-api-key
COCKROACHDB_MCP_DATABASE=defaultdb
COCKROACHDB_CATALOG_MODE=mcp
```

Never commit the API key or send it to the browser. Interactive Codex OAuth
credentials are separate and should not be copied into the application `.env`.

`COCKROACHDB_CATALOG_MODE=mcp` is strict: missing MCP configuration or an MCP
failure makes `/api/infra/context` return 503 rather than silently switching to
SQL. `auto` is intended for local development and uses SQL only when the full
MCP configuration is absent.

## Read-only application boundary

The adapter exposes no generic MCP surface to either the browser or the model.
It always calls `select_query` with a fixed catalog join after validating the
incident UUID and database identifier. It cannot invoke `insert_rows`,
`update_rows`, `delete_rows`, schema changes, or arbitrary model-supplied SQL.
The `mcp-cluster-id` header prevents tool calls from switching clusters.

Run the live preflight before deployment:

```powershell
npm run cockroach:mcp:smoke
```

Success reports `COCKROACH_MCP_OK`, the single-cluster scope, the selected
catalog row, and how many write-capable tools the hosted server advertised but
the application boundary does not expose.

## Runtime proof

With strict MCP mode deployed:

```powershell
Invoke-RestMethod "https://evidenceops.0tt.uk/api/infra/context?incidentId=40000000-0000-4000-8000-000000000005"
```

The returned context must contain:

```json
{ "accessPath": "cockroachdb-managed-mcp" }
```

The dashboard renders the same provenance as **Via CockroachDB Managed MCP**.

## ccloud cluster-health evidence

Before each model investigation, EvidenceOps runs this bounded, read-only
command and adds its result to the one immutable evidence bundle as
`EVD-CLUSTER-HEALTH`:

```bash
ccloud cluster info recallops-agentic-memory --quiet --output json
```

Set `CCLOUD_CLUSTER_NAME` to the cluster name and, when needed, use
`CCLOUD_COMMAND` for the absolute CLI path. The check times out after five
seconds by default and is cached for 30 seconds. A missing CLI, expired login,
timeout, or malformed response produces citeable `unknown` health evidence;
it never prevents the incident investigation from continuing.

`ccloud` uses its own authenticated session. Do not copy a CockroachDB Managed
MCP API key or any browser/session credential into application environment
files.
