# DataHub MCP compatibility preflight

This project uses the DataHub MCP server as an explicit graph-access boundary.
The application does not start a local MCP process: its deployment target is a
Cloudflare Worker, which cannot spawn `uvx`. Run this preflight from a trusted
operator or CI environment that can reach the DataHub instance.

## One-time environment setup

1. Start the pinned local stack with `./infra/datahub/bootstrap-auth-enabled.ps1`.
   It retrieves the exact `v1.6.0` quickstart profile, checks its expected
   structure, and produces a local copy with metadata-service authentication
   enabled for GMS and the frontend. The helper uses the pinned `1.7.0` CLI.
2. Create a dedicated service account whose token is scoped to the smallest
   practical read permissions for this preflight.
3. Do not modify a DataHub quickstart-generated compose file in place. The
   bootstrap helper creates an auth-enabled copy and is the sole startup path
   for this demo environment.
4. Copy `.env.example` to an untracked `.env.local` and set the GMS URL, the
   service-account token, and an exact tested `DATAHUB_MCP_VERSION`.

The preflight deliberately disables mutation and document-write tools. It must
never receive mutation tools or a broadly privileged personal token.

## Run and record

Run:

```sh
npm run datahub:smoke
```

Success requires a successful `get_me` call and the `get_entities` and
`get_lineage` tools. Record the tested DataHub CLI, DataHub OSS, Python/uv, and
MCP server versions in the demo runbook. A version mismatch, missing tool, or
authentication error is a release blocker; do not silently fall back to fixture
data while presenting the result as live.

## Before enabling write-back

Write-back needs a separate, opt-in execution path with narrowly scoped
credentials and an approval gate. After every mutation, read the exact target
URN/aspect directly with bounded backoff and persist a receipt. Never rely on
search results as read-your-own-write verification.
