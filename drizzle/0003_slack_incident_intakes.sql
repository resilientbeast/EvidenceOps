-- Slack message bodies never enter this table. The summary is redacted before
-- persistence and every record starts in a human review queue.
CREATE TABLE IF NOT EXISTS slack_incident_intakes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id STRING NOT NULL,
  event_id STRING NOT NULL,
  event_type STRING NOT NULL,
  redacted_summary STRING NOT NULL,
  status STRING NOT NULL DEFAULT 'pending_review',
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  reviewed_at TIMESTAMPTZ NULL,
  reviewed_by STRING NULL,
  review_note STRING NULL,
  CONSTRAINT slack_incident_intakes_status_check CHECK (status IN ('pending_review', 'reviewed', 'dismissed')),
  UNIQUE (organization_id, event_id)
);
