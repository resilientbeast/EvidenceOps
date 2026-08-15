import pg from "pg";

const connectionString = process.env.POSTGRES_MEMORY_URL;
if (!connectionString) {
  throw new Error("POSTGRES_MEMORY_URL is required. Run npm run postgres:bootstrap first.");
}

const pool = new pg.Pool({ connectionString, max: 1 });
try {
  const result = await pool.query(
    "SELECT id, payload->>'memoryMode' AS memory_mode FROM incident_dossiers WHERE id = $1",
    ["40000000-0000-4000-8000-000000000006"],
  );
  const extension = await pool.query("SELECT extname FROM pg_extension WHERE extname = 'vector'");
  const historicalMemory = await pool.query("SELECT count(*)::int AS count FROM historical_incident_memory");
  if (result.rowCount !== 1 || result.rows[0].memory_mode !== "postgres" || extension.rowCount !== 1 || historicalMemory.rows[0].count < 3) {
    throw new Error("PostgreSQL is reachable, but the persistent incident dossier or pgvector extension is not initialized. Load the app once, then rerun this check.");
  }
  console.log(`POSTGRES_MEMORY_OK incident=40000000-0000-4000-8000-000000000006 historical_records=${historicalMemory.rows[0].count} pgvector=enabled`);
} finally {
  await pool.end();
}
