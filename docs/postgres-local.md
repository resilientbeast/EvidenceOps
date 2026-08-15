# PostgreSQL + pgvector local agentic memory

RecallOps uses one local PostgreSQL container for durable incident dossiers,
historical agentic memory, human decisions, and audit replay. Historical
matches are retrieved from PostgreSQL and ranked deterministically by source
asset, assertion, severity, and downstream overlap. The `pgvector` extension
is enabled for a later semantic-retrieval expansion. The service is for local
demo use; it binds only to
`127.0.0.1:5433` and uses a Docker named volume for durable data.

## Why this is durable agentic memory

The database stores resolved incident records and decision/audit state across
app restarts. RecallOps retrieves those records by grounded incident context,
then exposes what is shared, what changed, and what cannot safely transfer.
The result is reusable operational knowledge with a human approval boundary,
not an opaque conversation history.

Because the app runs in a Cloudflare-compatible worker runtime, it reads this
local database through a loopback-only PostgREST bridge on `127.0.0.1:5434`.
The bridge is another local Docker container; it is not a hosted service and
does not require a cloud account.

## Start it

```powershell
npm run postgres:bootstrap
npm run postgres:api
```

The helper generates a local-only password and writes `POSTGRES_MEMORY_URL` to
the untracked `.env.local` file. It refuses to overwrite an existing memory
connection or replace an existing container/volume.

Restart the app, load it once, then run:

```powershell
npm run postgres:smoke
```

On first app access, the adapter enables `vector`, creates `incident_dossiers`
and `historical_incident_memory`, and inserts the anonymized PHP-FPM seed record.
memory records only if absent. The app then changes its header from `Memory
fixture` to `PostgreSQL connected`.

## Demo proof

1. Load the app and confirm the PostgreSQL connection label.
2. Record a simulated approval or review request.
3. Restart the app and reload the anonymized PHP-FPM seed record.
4. Open the audit replay: the decision and operator event remain because they
   are stored in the persistent dossier.

The schema is in `drizzle/0000_incident_dossiers.sql`. It stores an
evidence-cited incident projection and resolved-memory records as JSONB. The
memory table can later store `vector` embeddings alongside its existing
structured retrieval filters.
