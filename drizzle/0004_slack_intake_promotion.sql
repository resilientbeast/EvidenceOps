ALTER TABLE slack_incident_intakes
  ADD COLUMN IF NOT EXISTS promoted_incident_id UUID NULL;
ALTER TABLE slack_incident_intakes
  ADD COLUMN IF NOT EXISTS promoted_at TIMESTAMPTZ NULL;
ALTER TABLE slack_incident_intakes
  ADD COLUMN IF NOT EXISTS promoted_by STRING NULL;

ALTER TABLE slack_incident_intakes
  DROP CONSTRAINT IF EXISTS slack_incident_intakes_status_check;
ALTER TABLE slack_incident_intakes
  ADD CONSTRAINT slack_incident_intakes_status_check
  CHECK (status IN ('pending_review', 'reviewed', 'dismissed', 'promoted'));
