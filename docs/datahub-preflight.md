# DataHub MCP compatibility preflight

This project uses the DataHub MCP server as an explicit graph-access boundary.
The Cloudflare-compatible app cannot spawn `uvx`, so a separate local Node
bridge starts the stdio MCP client and exposes one loopback-only, authenticated
catalog-context endpoint. The browser never receives either token.

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

## Runtime MCP path

After preflight succeeds, add a random `DATAHUB_MCP_BRIDGE_TOKEN` to the
untracked `.env.local`, then run this in a separate terminal:

```sh
npm run datahub:mcp-bridge
```

The bridge binds only to `127.0.0.1:7331`, verifies the approved toolset for
each request, and calls only `get_entities` and `get_lineage`. With
`DATAHUB_CONTEXT_MODE=auto`, the application labels a bridge outage as
**MCP unavailable · GraphQL fallback** and preserves the established read path.
For a strict MCP-only demonstration, use `DATAHUB_CONTEXT_MODE=mcp`: a bridge failure
then makes the catalog card unavailable rather than silently using GraphQL.

## Before enabling write-back

Write-back needs a separate, opt-in execution path with narrowly scoped
credentials and an approval gate. After every mutation, read the exact target
URN/aspect directly with bounded backoff and persist a receipt. Never rely on
search results as read-your-own-write verification.
