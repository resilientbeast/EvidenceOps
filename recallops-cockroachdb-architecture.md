# RecallOps — CockroachDB × AWS Architecture Plan

**Hackathon:** CockroachDB × AWS — Build with Agentic Memory
**Deadline:** Aug 18, 2026, 5:00pm ET
**Tagline to design toward:** *"Agents that think. Agents that act. Agents that remember."*
**Starting point:** github.com/resilientbeast/recallops (built for the DataHub Agent Hackathon)

---

## 1. What's changing and why

| Layer | DataHub version | CockroachDB version | Why |
|---|---|---|---|
| Context source | DataHub (via MCP / GraphQL) | Your own infra catalog (servers, sites, services) | DataHub isn't part of this hackathon; your own domain is your strongest differentiator |
| Memory | Postgres, deterministic weighted scoring | CockroachDB, real vector similarity search | Rules require CockroachDB as the memory layer; this is also a genuine product upgrade over the hand-coded scorer |
| Model | GPT-4.1 mini via AIMLAPI | Bedrock (reasoning model + Titan embeddings) | AWS requirement should power the core feature, not be bolted on |
| Deployment | Local Docker only | Publicly reachable on AWS | This hackathon requires a live demo URL; DataHub's did not |
| Everything else | — | Unchanged | Agent flow, decision gate, audit replay, and safety validation all carry over |

**The one-line pitch:** *RecallOps investigates a server or site incident, remembers what happened last time via CockroachDB vector search, reasons with Bedrock, and never acts without a human — mirroring exactly how a solo sysadmin or a small MSP should actually operate.*

---

## 2. Judging criteria → what to build

The five equally-weighted criteria, and the specific design decision aimed at each:

- **Agentic Memory Design** — one CockroachDB cluster holds both the infra catalog *and* incident memory (structured rows + vector embeddings in the same table). Not a toy: real transactional writes (decisions, audit log) alongside real semantic retrieval.
- **Technological Implementation** — Managed MCP Server for reads, Distributed Vector Indexing for retrieval, both used correctly (read-only scoping, prefix-partitioned index) rather than just present in a config file.
- **Real-World Impact** — genuine MSP/sysadmin incident response, seeded with an incident you actually diagnosed (the riddimstream Redis OOM), not a synthetic dataset.
- **Product Readiness** — reuse your existing safety spine: idempotency-keyed decisions, plan-version conflict rejection, evidence-bundle-validated model output, full audit replay. Extend it with ccloud CLI health checks on the memory cluster itself if time allows.
- **Creativity & Originality** — solo-MSP operational memory is not a use case most entrants will bring. Lean into it explicitly in the write-up.

---

## 3. CockroachDB tools — which ones, and how

Rules require **at least 2**. Recommended:

1. **Distributed Vector Indexing (required-tier)** — replaces `src/application/match-historical-memory.ts`'s hand-coded scoring with real cosine-similarity retrieval over incident embeddings. This is the single highest-value change in the whole pivot — it's both a rules requirement and a real product improvement (the DataHub version had `pgvector` installed but never used it).
2. **Managed MCP Server (required-tier)** — becomes how the Investigator agent reads infra-catalog and incident-memory context from CockroachDB. One config snippet from the Cloud Console; mirrors the reader-only pattern already proven in the DataHub build.
3. **ccloud CLI (stretch, if time allows)** — have the Reviewer agent shell out to check the memory cluster's own backup/audit status before trusting retrieved history. Small addition, strong "Product Readiness" signal, and genuinely on-brand for someone who does this professionally.
4. **Agent Skills Repo (optional bonus)** — run an existing skill (e.g. "detect schema anti-patterns") against your own schema as a self-check moment. Cheapest of the four to skip if the clock runs out.

---

## 4. AWS — Bedrock as the single AI provider

Route **both** the investigation model and the embeddings through Bedrock — don't run AIMLAPI alongside it. One AWS-native path, one less dependency, and a direct echo of the hackathon's own "think / act / remember" framing.

- **Reasoning:** a Bedrock foundation model (Claude or similar) replaces the raw OpenAI-compatible call in `src/application/run-ai-investigation.ts`.
- **Embeddings:** Titan Text Embeddings (v2 defaults to 1024 dims, configurable; v1 is 1536 — confirm against whichever you provision) generates the vector stored alongside each incident row.
- **Action item for day 1:** request Bedrock model access in the AWS console for your target region. Usually fast, occasionally has approval lag — don't leave it for day 7.

**Deployment target** (this hackathon requires a live public demo URL, unlike DataHub's local-only allowance):
- *AWS App Runner or ECS Fargate* — more conventionally "cloud-native," moderate setup from a Dockerfile you likely already have most of.
- *EC2 + Docker Compose* — nearly identical to your current local setup, and squarely inside your actual day-to-day skill set. Faster for you personally; slightly less polished on paper.

Either satisfies the rules — the AWS service list explicitly includes "any other AWS service that powers your agent's environment."

---

## 5. Data model

One CockroachDB cluster, two jobs: infra catalog (replaces DataHub) and incident memory (replaces Postgres).

```sql
-- ── Infra catalog ──────────────────────────────────────────────
CREATE TABLE servers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  hostname TEXT NOT NULL,
  panel TEXT,              -- 'Plesk' | 'CyberPanel' | 'ISPConfig'
  region TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  server_id UUID REFERENCES servers(id),
  domain TEXT NOT NULL,
  owner TEXT,
  sla_tier TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE services (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID REFERENCES sites(id),
  kind TEXT NOT NULL,      -- 'mail_queue' | 'redis' | 'cron' | 'dns_zone' | 'ssl_cert'
  name TEXT NOT NULL,
  status TEXT,
  metadata JSONB
);

-- ── Incident memory ────────────────────────────────────────────
CREATE TABLE incidents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  service_id UUID REFERENCES services(id),
  severity TEXT,
  title TEXT NOT NULL,
  root_cause TEXT,
  resolution TEXT,
  outcome TEXT,
  status TEXT,             -- 'open' | 'resolved'
  opened_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  evidence JSONB,           -- the immutable evidence bundle
  embedding VECTOR(1024)    -- Titan embedding of title + root_cause + evidence summary
);

CREATE VECTOR INDEX ON incidents (embedding);

-- nearest-neighbor retrieval (pgvector-compatible syntax)
-- SELECT id, title, root_cause FROM incidents
-- ORDER BY embedding <-> $1 LIMIT 5;

-- ── Decision + audit (carried over from the DataHub build) ─────
CREATE TABLE decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id),
  idempotency_key TEXT UNIQUE NOT NULL,
  plan_version INT NOT NULL,
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  outcome TEXT
);

CREATE TABLE audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id UUID REFERENCES incidents(id),
  stage TEXT,               -- 'investigator' | 'historian' | 'planner' | 'reviewer' | 'decision'
  payload JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);
```

Note: CockroachDB's vector index is a preview feature as of v25.2/v26.2 — functional and exactly what Cockroach Labs is promoting for this hackathon, just worth knowing it's newer surface area than the rest of the engine.

---

## 6. Code migration map

Grounded in the actual repo layout, so this is directly actionable:

| Existing file | What happens to it |
|---|---|
| `src/adapters/datahub/live-context.ts` | Removed. Replaced by `src/adapters/infra-catalog/cockroach-catalog.ts`, reading servers/sites/services via CockroachDB MCP |
| `src/adapters/postgres/postgres-incident-repository.ts` + `http-postgres-incident-repository.ts` | Replaced by `src/adapters/cockroachdb/cockroach-incident-repository.ts`, implementing the same `IncidentRepository` interface |
| `src/adapters/incident-repository.ts` | Unchanged — this interface is exactly the seam that makes the swap clean |
| `src/application/configured-incident-repository.ts` | Small edit — add a `COCKROACHDB_URL`-keyed branch alongside the existing factory pattern |
| `src/application/match-historical-memory.ts` | Rewritten — weighted scoring becomes a vector `ORDER BY embedding <-> $1` query, with the shared/changed/do-not-transfer delta logic kept on top of the results |
| `src/application/run-ai-investigation.ts` | Provider swap — replace the raw AIMLAPI fetch/tool-call parsing with a Bedrock call; same Zod schema, same evidence-bundle validation, same guardrails |
| `src/domain/incident.ts` | Extended, not replaced — add server/site/service types alongside the existing incident model |
| `src/fixtures/inc-247.ts`, `src/fixtures/historical-memory.ts` | Replaced by MSP-domain seed data (below) |
| Everything in `src/application/read-incident.ts`, `read-incident-replay.ts`, `record-decision.ts` | **Unchanged.** Decision gate, idempotency, audit replay all carry over as-is |

Roughly: three adapters swapped, one scoring function rewritten, fixtures replaced. Not a rebuild.

---

## 7. Seed data — use what you actually lived through

- **Seed incident #1 (real):** the `campaigns.riddimstream.com` MailWizz outage — Redis Docker container OOM on Plesk, traced from "campaigns stuck sending" to the actual root cause. Real root cause, real resolution, real timeline.
- **Seed incidents #2–3 (plausible synthetic siblings):** a different client's Redis memory-pressure incident, and something structurally different (a cron/backup failure, or an SSL expiry cascade) so the vector search has more than one lonely match to differentiate against.
- **Demo alert:** a fresh incident on a different site with similar Redis memory-pressure symptoms, which the agent retrieves via genuine embedding similarity against seed #1 — same match-delta narrative device as the DataHub build (shared / changed / do-not-transfer), now running on real domain data instead of a rented fixture.

---

## 8. Eight-day sequence

| Days | Focus |
|---|---|
| 1 | CockroachDB Cloud cluster provisioned. Schema above applied. Bedrock model access requested (do this immediately — approval can lag). |
| 2 | Seed data written (riddimstream + siblings). Titan embeddings generated for seed incidents. Vector query proven from the SQL console before touching app code. |
| 3–4 | Adapter swap: `cockroach-incident-repository.ts`, `cockroach-catalog.ts`, `match-historical-memory.ts` rewrite. App runs locally against CockroachDB Cloud. |
| 5 | Bedrock swap in `run-ai-investigation.ts`. Same validation guardrails, new provider. |
| 6 | AWS deployment (App Runner/ECS or EC2+Compose — pick one early, don't evaluate both this late). Get a real public URL working end-to-end. |
| 7 | MCP Server wired into the live read path. ccloud CLI / Agent Skills stretch goals if time allows. |
| 8 | Video, text description, submission checklist below. Buffer day — treat it as a buffer, not a build day. |

---

## 9. Submission requirements specific to this hackathon

- Video must be **under 3 minutes** and must **show the CockroachDB memory layer at work** — not optional, called out explicitly in the rules. Plan a shot of the vector query returning the matched incident.
- Video hosted on YouTube or Vimeo (not just a local file).
- Submission text must **explicitly name which CockroachDB tools were used and how**, and **which AWS services and how** — don't leave this implicit in the demo, state it plainly.
- Repo must be public with a detectable open-source license (MIT or Apache 2.0) visible in the About section.
- A working demo URL is required for judging — this is the one requirement that materially raises the bar versus the DataHub submission.
- Disclosure: since this project originated as a DataHub Agent Hackathon entry, say so plainly in the write-up — e.g. "originated as a DataHub Agent Hackathon submission; the CockroachDB, AWS, and infra-memory work here was built during this hackathon's submission period." Costs nothing, keeps you clean on the rules' disclosure requirement.
- Optional but worth doing if time allows: an architecture diagram showing CockroachDB, AWS, and the agent interacting — judges are explicitly told this is welcome.

---

## 10. Open decisions

- **Deployment target:** App Runner/ECS vs. EC2+Compose — recommend deciding by end of day 1, not evaluating both.
- **Bedrock model choice:** which foundation model for reasoning — worth a quick check of what's available in your target region before committing.
- **ccloud CLI / Agent Skills:** stretch goals, only after the required two tools and Bedrock swap are solid.
