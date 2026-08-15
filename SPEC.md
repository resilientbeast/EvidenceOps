# EvidenceOps — Product and Engineering Specification

## Product

EvidenceOps is an evidence-gated infrastructure incident command center. It
uses CockroachDB for infrastructure context and durable incident memory, AWS
Bedrock for bounded read-only reasoning, and a mandatory human decision before
any remediation outcome is recorded.

The application does not connect to a third-party data catalog. Its current
seed record is the real Linea Research WordPress PHP-FPM/Elementor incident,
labelled as seeded evidence whenever CockroachDB is unavailable locally.

## Core workflow

1. Read the current incident, server, site, and service from CockroachDB.
2. Retrieve comparable resolved incidents with vector similarity and show the
   match delta: shared context, changed context, and non-transferable
   assumptions.
3. Run a Bedrock investigation only against the immutable, read-only evidence
   bundle, and validate every cited evidence ID.
4. Produce a bounded plan, challenge it in review, and require a human
   decision before persisting the outcome and audit replay.

## Safety boundaries

| Capability | Boundary |
| --- | --- |
| Infrastructure context | CockroachDB SQL or Managed MCP read path |
| Historical memory | CockroachDB vector retrieval; no unverified resolution transfer |
| AI reasoning | Read-only evidence tool and deterministic evidence validation |
| Remediation | Human-approved, plan-versioned, and auditable |
| Local access | Signed HTTP-only local operator session |

## Development modes

- With CockroachDB configured, EvidenceOps reads the active incident selected
  by `RECALLOPS_ACTIVE_INCIDENT_ID`.
- When local development cannot reach CockroachDB, the dashboard visibly uses
  the real, seeded Linea PHP-FPM record. It must not be presented as live
  telemetry.
- `/api/health` remains public; dashboard and incident APIs require local
  operator authentication.

## Verification

```powershell
npm run check
npm run cockroach:seed
npm run cockroach:phase3:verify
```
