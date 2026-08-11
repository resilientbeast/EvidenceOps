import { readFile } from "node:fs/promises";
import pg from "pg";

const connectionString = process.env.COCKROACHDB_URL;
const incidentId = process.env.RECALLOPS_ACTIVE_INCIDENT_ID;
if (!connectionString || !incidentId) {
  throw new Error("COCKROACHDB_URL and RECALLOPS_ACTIVE_INCIDENT_ID are required.");
}

const poolOptions = {
  connectionString,
  max: 1,
  application_name: "recallops-phase3-verification",
  connectionTimeoutMillis: 15_000,
  idleTimeoutMillis: 5_000,
};
if (process.env.COCKROACHDB_CA_CERT_PATH) {
  poolOptions.ssl = {
    ca: await readFile(process.env.COCKROACHDB_CA_CERT_PATH, "utf8"),
    rejectUnauthorized: true,
  };
}

const pool = new pg.Pool(poolOptions);
const vectorQuery = `
  SELECT id::STRING AS id,
         status,
         round((embedding <-> $1::VECTOR)::DECIMAL, 6)::STRING AS distance
    FROM incidents
   ORDER BY embedding <-> $1::VECTOR
   LIMIT 100`;

try {
  const active = await pool.query(
    `SELECT embedding::STRING AS embedding,
            evidence->'provenance'->>'kind' AS provenance,
            status
       FROM incidents
      WHERE id = $1::UUID`,
    [incidentId],
  );
  if (active.rowCount !== 1 || !active.rows[0].embedding) {
    throw new Error("The configured active incident is missing or has no embedding.");
  }
  if (active.rows[0].provenance !== "synthetic_demo_alert" || active.rows[0].status !== "open") {
    throw new Error("The active phase-3 incident must remain an explicitly synthetic, unresolved alert.");
  }

  const candidates = await pool.query(vectorQuery, [active.rows[0].embedding]);
  const resolvedCandidates = candidates.rows
    .filter((row) => row.status === "resolved" && row.id !== incidentId)
    .slice(0, 5);
  const resolvedIds = resolvedCandidates.map((row) => row.id);
  const catalog = await pool.query(
    `SELECT inc.id::STRING AS id, inc.title, site.domain, srv.hostname, svc.kind
       FROM incidents AS inc
       JOIN services AS svc ON svc.id = inc.service_id
       JOIN sites AS site ON site.id = svc.site_id
       JOIN servers AS srv ON srv.id = site.server_id
      WHERE inc.id = ANY($1::UUID[])`,
    [resolvedIds],
  );
  const catalogById = new Map(catalog.rows.map((row) => [row.id, row]));
  const matches = resolvedCandidates.map((candidate) => ({ ...catalogById.get(candidate.id), ...candidate }));
  if (matches[0]?.id !== "40000000-0000-4000-8000-000000000001") {
    throw new Error(`Expected the Riddimstream memory first; received ${matches[0]?.id ?? "no result"}.`);
  }

  const plan = await pool.query(`EXPLAIN ${vectorQuery}`, [active.rows[0].embedding]);
  const planText = plan.rows.map((row) => Object.values(row)[0]).join("\n");
  if (!planText.includes("vector search") || !planText.includes("incidents_embedding_idx")) {
    throw new Error("The phase-3 retrieval plan did not use incidents_embedding_idx for vector search.");
  }

  console.log(`COCKROACH_PHASE3_OK active=${incidentId} top_match=${matches[0].hostname}/${matches[0].kind}`);
  for (const [index, match] of matches.entries()) {
    console.log(`VECTOR_MEMORY rank=${index + 1} distance=${match.distance} domain=${match.domain} title=${JSON.stringify(match.title)}`);
  }
  console.log("VECTOR_INDEX_PLAN_OK index=incidents_embedding_idx operator=<->");
} finally {
  await pool.end();
}
