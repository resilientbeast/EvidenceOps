-- Inbound event bodies are deliberately not persisted. This table is a
-- minimal delivery ledger used only to deduplicate signed Slack events.
CREATE TABLE IF NOT EXISTS slack_ingestion_events (
  organization_id STRING NOT NULL,
  event_id STRING NOT NULL,
  event_type STRING NOT NULL,
  channel_id STRING NOT NULL,
  sender_id STRING NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, event_id)
);
