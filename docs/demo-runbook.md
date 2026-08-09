# Local hackathon demo runbook

The DataHub Agent Hackathon rules explicitly permit the local DataHub
Quickstart. This project uses that allowed path for its functional demo rather
than making a partially configured catalog public.

## What is live and what is a fixture

| Surface | Status | Evidence shown |
| --- | --- | --- |
| DataHub catalog context | Live, local, read-only | Dataset name, owners, schema-field count, downstream assets, observation time |
| Incident investigation | Fixture | Seeded lineage narrative, hypotheses, historical match, simulated approval |
| DataHub writes | Disabled | MCP preflight rejects mutation tools; no public write endpoint exists |

Never describe the fixture investigation as a live incident. The console makes
the boundary visible: the live card is separately named **Verified catalog
context** and only appears as connected after the route has successfully read
the local catalog.

## Before recording

1. Start Docker Desktop.
2. In PowerShell, run `./infra/datahub/bootstrap-auth-enabled.ps1`.
3. Create a dedicated DataHub service account with the **Reader** role. Keep
   its token only in the untracked `.env.local` file as `DATAHUB_GMS_TOKEN`.
4. Set `DATAHUB_GMS_URL=http://localhost:8080` and leave
   `DATAHUB_LIVE_SOURCE_URN` at the bootstrap default from `.env.example`.
5. Run `npm run datahub:smoke`. It must succeed before calling anything live.
6. If the bootstrap graph is empty, use a separate short-lived writer token in
   `DATAHUB_SEED_TOKEN`, run `npm run datahub:seed`, then revoke that writer
   token. Do not use it for the app or MCP preflight.
7. Run `npm run dev` and open the app. The live card should read `connected`
   and name `fct_users_created`.

## Suggested under-three-minute video sequence

1. Show the incident command page and point out the `DEMO FIXTURE` label.
2. Show the `Verified catalog context` card: its connected state, source
   dataset, owner, field count, downstream count, and observation time are the
   genuine local DataHub read.
3. Switch to DataHub and show the same source dataset and a downstream asset.
4. Return to the app, inspect a competing hypothesis, and use the simulated
   human decision gate.
5. Close with the repository's local setup instructions and explain that
   catalog access is Reader-only and DataHub mutation tools are disabled.

## Submission materials

The Devpost entry should link to the public repository and the public demo
video. The repository provides free local reproduction instructions for the
DataHub-backed portion. If the app itself is hosted separately, label it a
fixture preview unless it can reach the same configured DataHub environment.
