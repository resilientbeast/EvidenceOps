import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import type { Pool } from "pg";

const INTEGRATION = "slack";
const DEFAULT_ORGANIZATION_ID = "org-local-default";

export type SlackSettings = {
  botTokenConfigured: boolean;
  appTokenConfigured: boolean;
  signingSecretConfigured: boolean;
  botUserId: string | null;
  allowedChannelIds: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export type SlackSettingsUpdate = {
  botToken?: string;
  appToken?: string;
  signingSecret?: string;
  botUserId?: string;
  allowedChannelIds?: string[];
};

type StoredSlackSettings = {
  botToken: string | null;
  appToken: string | null;
  signingSecret: string | null;
  botUserId: string | null;
  allowedChannelIds: string[];
};

export type SlackInboundConfiguration = {
  organizationId: string;
  signingSecret: string;
  botUserId: string | null;
  allowedChannelIds: string[];
};

export type SlackInboundEventClaim = {
  eventId: string;
  eventType: string;
  channelId: string;
  senderId: string | null;
};

type SettingsRow = {
  ciphertext: Buffer;
  nonce: Buffer;
  auth_tag: Buffer;
  updated_at: Date | string;
  updated_by: string;
};

type ClaimedInboundEventRow = {
  event_id: string;
};

export class SettingsConfigurationError extends Error {}
export class SettingsPersistenceError extends Error {}

export class CockroachOrganizationSlackSettingsStore {
  private readonly pool: Pick<Pool, "query">;
  private readonly encryptionKey: Buffer;

  constructor(
    pool: Pick<Pool, "query">,
    encryptionKey: Buffer,
  ) {
    this.pool = pool;
    this.encryptionKey = encryptionKey;
  }

  static fromEnvironment(
    pool: Pick<Pool, "query">,
    environment: Record<string, string | undefined> = process.env,
  ): CockroachOrganizationSlackSettingsStore {
    const configuredKey = environment.SETTINGS_ENCRYPTION_KEY;
    if (!configuredKey) {
      throw new SettingsConfigurationError("SETTINGS_ENCRYPTION_KEY is required to persist Slack settings.");
    }

    const encryptionKey = Buffer.from(configuredKey, "base64");
    if (encryptionKey.length !== 32) {
      throw new SettingsConfigurationError("SETTINGS_ENCRYPTION_KEY must be a base64-encoded 32-byte key.");
    }

    return new CockroachOrganizationSlackSettingsStore(pool, encryptionKey);
  }

  async read(userId: string): Promise<SlackSettings> {
    const organizationId = organizationIdFor(userId);
    await this.ensureTable();
    const result = await this.pool.query<SettingsRow>(
      `SELECT ciphertext, nonce, auth_tag, updated_at, updated_by
         FROM organization_integration_settings
        WHERE organization_id = $1 AND integration = $2`,
      [organizationId, INTEGRATION],
    );

    if (result.rowCount !== 1) {
      return {
        botTokenConfigured: false,
        appTokenConfigured: false,
        signingSecretConfigured: false,
        botUserId: null,
        allowedChannelIds: [],
        updatedAt: null,
        updatedBy: null,
      };
    }

    const row = result.rows[0];
    const stored = this.decrypt(row, organizationId);
    return toPublicSettings(stored, row);
  }

  async update(userId: string, update: SlackSettingsUpdate): Promise<SlackSettings> {
    const organizationId = organizationIdFor(userId);
    await this.ensureTable();
    const existing = await this.readStored(organizationId);
    const next: StoredSlackSettings = {
      botToken: update.botToken === undefined ? existing.botToken : update.botToken || null,
      appToken: update.appToken === undefined ? existing.appToken : update.appToken || null,
      signingSecret: update.signingSecret === undefined ? existing.signingSecret : update.signingSecret || null,
      botUserId: update.botUserId === undefined ? existing.botUserId : update.botUserId || null,
      allowedChannelIds: update.allowedChannelIds === undefined ? existing.allowedChannelIds : update.allowedChannelIds,
    };
    const encrypted = this.encrypt(next, organizationId);

    const result = await this.pool.query<SettingsRow>(
      `UPSERT INTO organization_integration_settings
        (organization_id, integration, ciphertext, nonce, auth_tag, updated_by, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())
       RETURNING ciphertext, nonce, auth_tag, updated_at, updated_by`,
      [organizationId, INTEGRATION, encrypted.ciphertext, encrypted.nonce, encrypted.authTag, userId],
    );

    return toPublicSettings(next, result.rows[0]);
  }

  async inboundConfiguration(): Promise<SlackInboundConfiguration> {
    const organizationId = DEFAULT_ORGANIZATION_ID;
    await this.ensureTable();
    const settings = await this.readStored(organizationId);
    if (!settings.signingSecret) {
      throw new SettingsConfigurationError("A Slack signing secret is required for inbound event verification.");
    }
    return {
      organizationId,
      signingSecret: settings.signingSecret,
      botUserId: settings.botUserId,
      allowedChannelIds: settings.allowedChannelIds,
    };
  }

  async claimInboundEvent(claim: SlackInboundEventClaim): Promise<boolean> {
    await this.ensureInboundEventTable();
    const result = await this.pool.query<ClaimedInboundEventRow>(
      `INSERT INTO slack_ingestion_events
        (organization_id, event_id, event_type, channel_id, sender_id, received_at)
       VALUES ($1, $2, $3, $4, $5, now())
       ON CONFLICT (organization_id, event_id) DO NOTHING
       RETURNING event_id`,
      [DEFAULT_ORGANIZATION_ID, claim.eventId, claim.eventType, claim.channelId, claim.senderId],
    );
    return result.rowCount === 1;
  }

  private async ensureTable(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS organization_integration_settings (
          organization_id STRING NOT NULL,
          integration STRING NOT NULL,
          ciphertext BYTES NOT NULL,
          nonce BYTES NOT NULL,
          auth_tag BYTES NOT NULL,
          updated_by STRING NOT NULL,
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (organization_id, integration)
        )
      `);
    } catch {
      throw new SettingsPersistenceError("Unable to initialize persistent organization settings.");
    }
  }

  private async ensureInboundEventTable(): Promise<void> {
    try {
      await this.pool.query(`
        CREATE TABLE IF NOT EXISTS slack_ingestion_events (
          organization_id STRING NOT NULL,
          event_id STRING NOT NULL,
          event_type STRING NOT NULL,
          channel_id STRING NOT NULL,
          sender_id STRING NULL,
          received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          PRIMARY KEY (organization_id, event_id)
        )
      `);
    } catch {
      throw new SettingsPersistenceError("Unable to initialize Slack event deduplication.");
    }
  }

  private async readStored(organizationId: string): Promise<StoredSlackSettings> {
    const result = await this.pool.query<SettingsRow>(
      `SELECT ciphertext, nonce, auth_tag, updated_at, updated_by
         FROM organization_integration_settings
        WHERE organization_id = $1 AND integration = $2`,
      [organizationId, INTEGRATION],
    );
    return result.rowCount === 1
      ? this.decrypt(result.rows[0], organizationId)
      : { botToken: null, appToken: null, signingSecret: null, botUserId: null, allowedChannelIds: [] };
  }

  private encrypt(value: StoredSlackSettings, organizationId: string) {
    const nonce = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.encryptionKey, nonce);
    cipher.setAAD(aad(organizationId));
    const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
    return { ciphertext, nonce, authTag: cipher.getAuthTag() };
  }

  private decrypt(row: SettingsRow, organizationId: string): StoredSlackSettings {
    try {
      const decipher = createDecipheriv("aes-256-gcm", this.encryptionKey, Buffer.from(row.nonce));
      decipher.setAAD(aad(organizationId));
      decipher.setAuthTag(Buffer.from(row.auth_tag));
      const plaintext = Buffer.concat([decipher.update(Buffer.from(row.ciphertext)), decipher.final()]).toString("utf8");
      const value: unknown = JSON.parse(plaintext);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid settings payload");
      const record = value as Record<string, unknown>;
      return {
        botToken: typeof record.botToken === "string" ? record.botToken : null,
        appToken: typeof record.appToken === "string" ? record.appToken : null,
        signingSecret: typeof record.signingSecret === "string" ? record.signingSecret : null,
        botUserId: typeof record.botUserId === "string" ? record.botUserId : null,
        allowedChannelIds: Array.isArray(record.allowedChannelIds)
          ? record.allowedChannelIds.filter((item): item is string => typeof item === "string")
          : [],
      };
    } catch {
      throw new SettingsPersistenceError("Stored Slack settings could not be decrypted.");
    }
  }
}

function organizationIdFor(userId: string): string {
  // Local auth currently has one operator. A future membership resolver can replace
  // this without changing the settings table or API contract.
  if (!userId) throw new SettingsConfigurationError("An authenticated organization member is required.");
  return DEFAULT_ORGANIZATION_ID;
}

function aad(organizationId: string): Buffer {
  return Buffer.from(`evidenceops:${organizationId}:${INTEGRATION}`, "utf8");
}

function toPublicSettings(settings: StoredSlackSettings, row: Pick<SettingsRow, "updated_at" | "updated_by">): SlackSettings {
  return {
    botTokenConfigured: Boolean(settings.botToken),
    appTokenConfigured: Boolean(settings.appToken),
    signingSecretConfigured: Boolean(settings.signingSecret),
    botUserId: settings.botUserId,
    allowedChannelIds: settings.allowedChannelIds,
    updatedAt: row.updated_at instanceof Date ? row.updated_at.toISOString() : new Date(row.updated_at).toISOString(),
    updatedBy: row.updated_by,
  };
}
