import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const MAX_SIGNATURE_AGE_SECONDS = 5 * 60;

export type SlackInboundConfiguration = {
  allowedChannelIds: string[];
  botUserId: string | null;
};

type SlackMessageEvent = {
  type?: unknown;
  channel?: unknown;
  user?: unknown;
  bot_id?: unknown;
  subtype?: unknown;
  text?: unknown;
};

type SlackEnvelope = {
  type?: unknown;
  challenge?: unknown;
  event_id?: unknown;
  event?: SlackMessageEvent;
};

export type SlackInboundDecision =
  | { kind: "url_verification"; challenge: string }
  | { kind: "accept"; eventId: string; eventType: string; channelId: string; senderId: string | null; redactedSummary: string }
  | { kind: "ignore"; reason: "unsupported_event" | "channel_not_allowed" | "self_message" | "invalid_event" };

export function verifySlackRequest(
  rawBody: string,
  timestamp: string | null,
  signature: string | null,
  signingSecret: string,
  now = Date.now(),
): boolean {
  if (!timestamp || !signature || !signingSecret) return false;
  const timestampSeconds = Number(timestamp);
  if (!Number.isSafeInteger(timestampSeconds) || Math.abs(now - timestampSeconds * 1_000) > MAX_SIGNATURE_AGE_SECONDS * 1_000) {
    return false;
  }

  const expected = `v0=${createHmac("sha256", signingSecret).update(`v0:${timestamp}:${rawBody}`, "utf8").digest("hex")}`;
  const expectedBytes = Buffer.from(expected, "utf8");
  const actualBytes = Buffer.from(signature, "utf8");
  return expectedBytes.length === actualBytes.length && timingSafeEqual(expectedBytes, actualBytes);
}

export function decideSlackInboundEvent(rawBody: string, configuration: SlackInboundConfiguration): SlackInboundDecision {
  let payload: SlackEnvelope;
  try {
    payload = JSON.parse(rawBody) as SlackEnvelope;
  } catch {
    return { kind: "ignore", reason: "invalid_event" };
  }

  if (payload.type === "url_verification" && typeof payload.challenge === "string") {
    return { kind: "url_verification", challenge: payload.challenge };
  }
  if (payload.type !== "event_callback" || !payload.event || typeof payload.event !== "object") {
    return { kind: "ignore", reason: "unsupported_event" };
  }

  const event = payload.event;
  if (event.type !== "message" || typeof payload.event_id !== "string" || typeof event.channel !== "string") {
    return { kind: "ignore", reason: "invalid_event" };
  }
  if (!configuration.allowedChannelIds.includes(event.channel)) {
    return { kind: "ignore", reason: "channel_not_allowed" };
  }
  if (
    typeof event.bot_id === "string"
    || event.subtype === "bot_message"
    || (configuration.botUserId !== null && event.user === configuration.botUserId)
  ) {
    return { kind: "ignore", reason: "self_message" };
  }

  return {
    kind: "accept",
    eventId: payload.event_id,
    eventType: "message",
    channelId: event.channel,
    senderId: typeof event.user === "string" ? event.user : null,
    redactedSummary: redactSlackMessage(typeof event.text === "string" ? event.text : ""),
  };
}

export function redactSlackMessage(message: string): string {
  const compact = message.replace(/\s+/g, " ").trim();
  if (!compact) return "No message text was provided.";
  const redacted = compact
    .replace(/\b(?:https?:\/\/|www\.)[^\s>]+/gi, "[url]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[email]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[ip-address]")
    .replace(/\b(?:[a-z0-9-]+\.)+(?:com|net|org|io|co\.uk|uk)\b/gi, "[domain]")
    .replace(/\b(password|passwd|token|secret|api[-_ ]?key)\s*[:=]\s*\S+/gi, "$1=[redacted]");
  return redacted.length > 500 ? `${redacted.slice(0, 497)}…` : redacted;
}

export function redactedSlackInboundLog(decision: SlackInboundDecision): Record<string, string> {
  if (decision.kind === "accept") {
    return {
      event: "slack_inbound",
      outcome: "accepted",
      type: decision.eventType,
      eventId: fingerprint(decision.eventId),
      channelId: redactIdentifier(decision.channelId),
      senderId: decision.senderId ? redactIdentifier(decision.senderId) : "unknown",
    };
  }
  if (decision.kind === "url_verification") {
    return { event: "slack_inbound", outcome: "url_verification" };
  }
  return { event: "slack_inbound", outcome: "ignored", reason: decision.reason };
}

function fingerprint(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 12);
}

function redactIdentifier(value: string): string {
  return value.length <= 4 ? "[redacted]" : `${value.slice(0, 1)}…${value.slice(-3)}`;
}
