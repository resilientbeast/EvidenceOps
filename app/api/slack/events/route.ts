import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import { SettingsConfigurationError, SettingsPersistenceError } from "@/src/adapters/settings/organization-slack-settings";
import { decideSlackInboundEvent, redactedSlackInboundLog, verifySlackRequest } from "@/src/adapters/slack/slack-event-guard";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  const rawBody = await request.text();
  let store: ReturnType<typeof getConfiguredSlackSettingsStore>;

  try {
    store = getConfiguredSlackSettingsStore();
    const configuration = await store.inboundConfiguration();
    if (!verifySlackRequest(
      rawBody,
      request.headers.get("x-slack-request-timestamp"),
      request.headers.get("x-slack-signature"),
      configuration.signingSecret,
    )) {
      logRedacted({ event: "slack_inbound", outcome: "rejected", reason: "invalid_signature" });
      return Response.json({ error: "Invalid Slack signature." }, { status: 401 });
    }

    const decision = decideSlackInboundEvent(rawBody, configuration);
    if (decision.kind === "url_verification") {
      // Slack requires the signed challenge to be echoed immediately; no event
      // processing or message content retention happens on this path.
      logRedacted(redactedSlackInboundLog(decision));
      return new Response(decision.challenge, { status: 200, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (decision.kind === "ignore") {
      logRedacted(redactedSlackInboundLog(decision));
      return Response.json({ ok: true });
    }

    // The single insert is the durable deduplication gate. Acknowledgement does
    // not wait for AI work, Slack Web API calls, or any unbounded processing.
    const firstDelivery = await store.claimInboundEvent(decision);
    logRedacted({ ...redactedSlackInboundLog(decision), outcome: firstDelivery ? "accepted" : "duplicate" });
    return Response.json({ ok: true });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsPersistenceError) {
      return Response.json({ error: "Slack ingestion is not configured." }, { status: 503 });
    }
    logRedacted({ event: "slack_inbound", outcome: "failed" });
    return Response.json({ error: "Unable to acknowledge Slack event." }, { status: 503 });
  }
}

function logRedacted(event: Record<string, string>): void {
  // Never write the raw Slack body, message text, tokens, or signing secret.
  console.info(JSON.stringify(event));
}
