CREATE TABLE IF NOT EXISTS incident_dossiers (
  id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS historical_incident_memory (
  incident_id TEXT PRIMARY KEY,
  payload JSONB NOT NULL,
  resolved_at TIMESTAMPTZ NOT NULL
);
