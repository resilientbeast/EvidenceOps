# Local demo runbook

RecallOps supports a fully local DataHub Quickstart for development, testing,
and demonstrations. No public catalog deployment is required.

## What is live and what is a fixture

| Surface | Status | Evidence shown |
| --- | --- | --- |
| DataHub catalog context | Live, local, read-only | DataHub MCP: dataset name, owners, schema-field count, downstream assets, observation time |
| Incident investigation | Fixture plus optional model run | Seeded lineage narrative, hypotheses, historical match, simulated approval |
| DataHub writes | Disabled | MCP preflight rejects mutation tools; no public write endpoint exists |

Never describe the fixture investigation as a live incident. The console keeps
the boundary visible: **Verified catalog context** is separate and only becomes
connected after the app reads the local catalog.

## Full local setup

1. Start Docker Desktop.
2. Copy `.env.local.example` to `.env.local`.
3. Run `npm install`.
4. Run `npm run postgres:bootstrap`, then `npm run postgres:api`.
5. In PowerShell, run `./infra/datahub/bootstrap-auth-enabled.ps1`.
6. Create a DataHub **Reader** service account and set `DATAHUB_GMS_TOKEN` in
   `.env.local`. Keep `DATAHUB_GMS_URL=http://localhost:8080`.
7. Run `npm run datahub:smoke`. If the bootstrap graph is empty, use a separate
   short-lived writer token in `DATAHUB_SEED_TOKEN`, run `npm run datahub:seed`,
   then revoke that token.
8. Set a random `DATAHUB_MCP_BRIDGE_TOKEN`, choose either `auto` or strict
   `mcp` mode, and run `npm run datahub:mcp-bridge` in a separate terminal.
9. If using model-backed investigation, set `AIMLAPI_KEY` and run
   `npm run ai:bridge` in another terminal.
10. Run `npm run dev` and open `http://localhost:3000`. The catalog card should
    say **Via DataHub MCP** when strict MCP mode is configured.

## Before enabling write-back

Write-back needs a separate, opt-in execution path with narrowly scoped
credentials and an approval gate. After every mutation, read the exact target
URN or aspect directly with bounded backoff and persist a receipt. Never rely
on search results as read-your-own-write verification.
