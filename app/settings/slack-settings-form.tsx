"use client";

import { useState, type FormEvent } from "react";

type SlackSettings = {
  botTokenConfigured: boolean;
  appTokenConfigured: boolean;
  allowedChannelIds: string[];
  updatedAt: string | null;
  updatedBy: string | null;
};

export const emptySlackSettings: SlackSettings = {
  botTokenConfigured: false,
  appTokenConfigured: false,
  allowedChannelIds: [],
  updatedAt: null,
  updatedBy: null,
};

export function SlackSettingsForm({ initialSettings = emptySlackSettings, initialError = "" }: { initialSettings?: SlackSettings; initialError?: string }) {
  const [settings, setSettings] = useState<SlackSettings>(initialSettings);
  const [botToken, setBotToken] = useState("");
  const [appToken, setAppToken] = useState("");
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
      </div>
      <label>
        <span>Bot token</span>
        <small>Leave blank to keep the encrypted value already stored.</small>
        <input type="password" value={botToken} onChange={(event) => setBotToken(event.target.value)} autoComplete="off" placeholder={settings.botTokenConfigured ? "Stored securely — enter only to replace" : "xoxb-…"} />
      </label>
      <label>
        <span>App-level token</span>
        <small>Required for Socket Mode. Leave blank to keep the encrypted value already stored.</small>
        <input type="password" value={appToken} onChange={(event) => setAppToken(event.target.value)} autoComplete="off" placeholder={settings.appTokenConfigured ? "Stored securely — enter only to replace" : "xapp-…"} />
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
