CREATE TABLE IF NOT EXISTS organization_integration_settings (
  organization_id STRING NOT NULL,
  integration STRING NOT NULL,
  ciphertext BYTES NOT NULL,
  nonce BYTES NOT NULL,
  auth_tag BYTES NOT NULL,
  updated_by STRING NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, integration)
);
