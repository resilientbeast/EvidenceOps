import { SlackSettingsForm, emptySlackSettings } from "@/app/settings/slack-settings-form";
import { authenticateLocalRequest } from "@/src/adapters/auth/local-auth";
import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const requestHeaders = await headers();
  const authentication = authenticateLocalRequest(new Request("http://internal.local/settings", { headers: requestHeaders }));
  if (authentication.kind !== "authenticated") {
    redirect("/sign-in?redirect_url=%2Fsettings");
  }

  let initialSettings = emptySlackSettings;
  let initialError = "";
  try {
    initialSettings = await getConfiguredSlackSettingsStore().read(authentication.userId);
  } catch (error) {
    initialError = error instanceof Error ? error.message : "Unable to load persistent Slack settings.";
  }

  return (
    <main className="settings-shell">
      <header className="settings-topbar">
        <a className="settings-brand" href="/dashboard"><span>EO</span><strong>EvidenceOps</strong></a>
        <a className="settings-back" href="/dashboard">← Incident command</a>
      </header>
      <section className="settings-content" aria-labelledby="settings-title">
        <p className="settings-eyebrow">Organization settings</p>
        <h1 id="settings-title">Slack ingestion</h1>
        <p className="settings-intro">Configure the encrypted credentials and channel allowlist for Slack Events API ingestion. The signing secret verifies each inbound request; stored secrets are never shown again.</p>
        <SlackSettingsForm initialSettings={initialSettings} initialError={initialError} />
      </section>
    </main>
  );
}
