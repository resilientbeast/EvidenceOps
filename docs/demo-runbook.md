# Local demo runbook

EvidenceOps has two transparent local modes:

| Surface | CockroachDB available | CockroachDB unavailable locally |
| --- | --- | --- |
| Incident and infrastructure context | Selected live CockroachDB record | Seeded, anonymized PHP-FPM/Elementor record |
| Historical memory | CockroachDB vector retrieval | No fabricated historical match |
| AI investigation | Optional Bedrock run against read-only evidence | Optional fixture-evidence run |

## Start the demo

1. Create `.env` from `.env.example` and set the three `LOCAL_AUTH_*` values.
2. Optionally populate CockroachDB and Bedrock settings.
3. Run `npm install`, then `npm run dev`.
4. Open `http://localhost:3000/dashboard` and sign in with the local operator
   account.

The seeded record is an anonymized, client-confirmed resolution case. It
must remain labelled as seeded evidence and never be described as live site
telemetry.

## Before enabling any write-back

Keep execution in a separate, explicitly approved path. Read the exact target
after each mutation, retain a receipt, and record the human decision and plan
version in the audit trail.
