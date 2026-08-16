"use client";

import { useState, type FormEvent } from "react";

type SlackSettings = {
  botTokenConfigured: boolean;
  appTokenConfigured: boolean;
  signingSecretConfigured: boolean;
  botUserId: string | null;
  allowedChannelIds: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export const emptySlackSettings: SlackSettings = {
  botTokenConfigured: false,
  appTokenConfigured: false,
  signingSecretConfigured: false,
  botUserId: null,
  allowedChannelIds: [],
  updatedAt: null,
  updatedBy: null,
};

export function SlackSettingsForm({ initialSettings = emptySlackSettings, initialError = "" }: { initialSettings?: SlackSettings; initialError?: string }) {
  const [settings, setSettings] = useState<SlackSettings>(initialSettings);
  const [botToken, setBotToken] = useState("");
  const [appToken, setAppToken] = useState("");
  const [signingSecret, setSigningSecret] = useState("");
  const [botUserId, setBotUserId] = useState(initialSettings.botUserId ?? "");
  const [channelIds, setChannelIds] = useState(initialSettings.allowedChannelIds.join("\n"));
  const [status, setStatus] = useState<"ready" | "saving" | "error">(initialError ? "error" : "ready");
  const [message, setMessage] = useState(initialError);

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("saving");
    setMessage("");
    const allowedChannelIds = channelIds.split(/\r?\n|,/).map((id) => id.trim()).filter(Boolean);
    const payload: Record<string, unknown> = { allowedChannelIds };
    if (botToken.trim()) payload.botToken = botToken.trim();
    if (appToken.trim()) payload.appToken = appToken.trim();
    if (signingSecret.trim()) payload.signingSecret = signingSecret.trim();
    if (botUserId.trim()) payload.botUserId = botUserId.trim();

    try {
      const response = await fetch("/api/settings/slack", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await response.json() as { settings?: SlackSettings; error?: string };
      if (!response.ok || !result.settings) throw new Error(result.error ?? "Unable to save Slack settings.");
      setSettings(result.settings);
      setBotToken("");
      setAppToken("");
      setSigningSecret("");
      setMessage("Slack settings saved securely.");
      setStatus("ready");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save Slack settings.");
      setStatus("error");
    }
  }

  return (
    <form className="slack-settings-form" onSubmit={save}>
      <div className="settings-status" aria-live="polite">
        <span className={settings.botTokenConfigured ? "configured" : "pending"}>Bot token {settings.botTokenConfigured ? "stored" : "not set"}</span>
        <span className={settings.appTokenConfigured ? "configured" : "pending"}>App token {settings.appTokenConfigured ? "stored" : "not set"}</span>
        <span className={settings.signingSecretConfigured ? "configured" : "pending"}>Signing secret {settings.signingSecretConfigured ? "stored" : "not set"}</span>
      </div>
      <label>
        <span>Bot token</span>
        <small>Leave blank to keep the encrypted value already stored.</small>
        <input type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} autoComplete="off" placeholder={settings.botTokenConfigured ? "Stored securely — enter only to replace" : "xoxb-…"} />
      </label>
      <label>
        <span>App-level token</span>
        <small>Reserved for a future Socket Mode worker; it is not needed for the HTTP Events API endpoint. Leave blank to keep the encrypted value already stored.</small>
        <input type="password" value={appToken} onChange={(event) => setAppToken(event.target.value)} autoComplete="off" placeholder={settings.appTokenConfigured ? "Stored securely — enter only to replace" : "xapp-…"} />
      </label>
      <label>
        <span>Signing secret</span>
        <small>Required to verify every inbound Slack Events API request. Leave blank to retain its encrypted value.</small>
        <input type="password" value={signingSecret} onChange={(event) => setSigningSecret(event.target.value)} autoComplete="off" placeholder={settings.signingSecretConfigured ? "Stored securely — enter only to replace" : "Slack signing secret"} />
      </label>
      <label>
        <span>Bot user ID</span>
        <small>Used to ignore messages authored by this bot. Find it in Slack as a U- or W-prefixed member ID.</small>
        <input value={botUserId} onChange={(event) => setBotUserId(event.target.value)} autoComplete="off" placeholder="U0123456789" />
      </label>
      <label>
        <span>Allowed channel IDs</span>
        <small>One channel ID per line. Only messages from these channels will be processed.</small>
        <textarea value={channelIds} onChange={(event) => setChannelIds(event.target.value)} rows={5} placeholder={"C0123456789\nC0987654321"} />
      </label>
      {message && <p className={`settings-message ${status === "error" ? "error" : ""}`} role="status">{message}</p>}
      <button className="settings-save" type="submit" disabled={status === "saving"}>{status === "saving" ? "Saving…" : "Save Slack settings"}</button>
      {settings.updatedAt && <p className="settings-audit">Last updated {new Date(settings.updatedAt).toLocaleString()} by {settings.updatedBy ?? "an operator"}.</p>}
    </form>
  );
}
