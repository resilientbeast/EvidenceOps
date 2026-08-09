# RecallOps submission runbook

## One-sentence pitch

RecallOps is an evidence-gated incident agent that uses DataHub to show what
an incident can affect, retrieves comparable cases from durable PostgreSQL
agentic memory, and asks a human to approve only a bounded, replayable plan.

## Devpost description starter

Data teams lose time during incidents because catalog context, historical
resolutions, and decision records live in separate places. RecallOps creates a
single incident dossier: it reads local DataHub catalog context with a
Reader-only identity, maps the blast radius, retrieves comparable resolved
incidents from PostgreSQL, challenges unsafe assumptions, and puts a
simulation-only plan behind a human decision gate.

The key design choice is restraint. Live DataHub metadata is visibly separated
from seeded incident reasoning. The historical match has a `match delta` that
calls out shared context, changed context, and assumptions that cannot be
transferred. A replay view shows the evidence, agent checks, human decision,
and safeguards required before a resolution can become reusable agentic memory.

## Video script (about 2 minutes 30 seconds)

1. **0:00–0:20 — Problem and boundary.** Open Incident Command. Explain that
   the dossier is a seeded incident fixture and point to its explicit `DEMO
   FIXTURE` label.
2. **0:20–0:45 — Real DataHub value.** Show `Verified catalog context`. Read
   the connected state, source name, owners, schema-field count, downstream
   count, and observation time. Switch briefly to local DataHub and show the
   same source asset and lineage.
3. **0:45–1:20 — What the agents did.** Return to the dossier. Walk through
   the four evidence-gated steps: map blast radius, retrieve comparable case,
   create a simulation-only plan, and challenge its precondition. Select the
   leading hypothesis and read the reviewer constraint.
4. **1:20–1:50 — Avoid copying the past.** Open the historical-match card.
   Highlight the `match delta`: shared context, changed context, and the
   source-partition assumption that must not transfer. Explain that this is why
   the agent recommends a diagnostic sequence rather than executing the old
   resolution.
5. **1:50–2:15 — Human control and replay.** Choose `Approve simulated
   remediation` or `Request review`. Then open `Show audit replay` and show
   the evidence chain, agent checks, and learning gate.
6. **2:15–2:30 — Close.** State that the DataHub identity is Reader-only,
   mutation tools are disabled, and the repository contains reproducible local
   DataHub and PostgreSQL agentic-memory setup plus smoke tests.

## Final checklist

- [ ] Run `npm run check` successfully.
- [ ] Run `npm run datahub:smoke` successfully against the Reader token.
- [ ] Run `npm run postgres:smoke` and show the PostgreSQL connection label.
- [ ] Confirm the app shows a connected Verified catalog context card.
- [ ] Record and upload an unlisted or public video under three minutes.
- [ ] Make the repository public with this README and the Apache-2.0 license.
- [ ] Add the repository and video URLs to Devpost.
- [ ] Rename the Devpost publication from its original draft slug to RecallOps.
- [ ] Describe the GraphQL-versus-MCP runtime boundary accurately, or complete
      the MCP/Agent Context Kit runtime integration before submission.
- [ ] Select **Agents That Do Real Work** and explain the human approval and
      replay safeguards.
- [ ] Verify that no `.env.local`, token, or temporary writer credential is
      committed or visible in the video.
