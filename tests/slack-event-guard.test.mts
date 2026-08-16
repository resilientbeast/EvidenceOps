import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import test from "node:test";
import {
  decideSlackInboundEvent,
  redactedSlackInboundLog,
  verifySlackRequest,
} from "../src/adapters/slack/slack-event-guard.ts";
import { CockroachOrganizationSlackSettingsStore } from "../src/adapters/settings/organization-slack-settings.ts";

const secret = "test-signing-secret";
const timestamp = "1776307200";
const now = Number(timestamp) * 1_000;
const configuration = { allowedChannelIds: ["C0123456789"], botUserId: "U9999999999" };

function sign(body: string, requestTimestamp = timestamp): string {
  const base = `v0:${requestTimestamp}:${body}`;
  return `v0=${createHmac("sha256", secret).update(base, "utf8").digest("hex")}`;
}

function event(overrides: Record<string, unknown> = {}) {
  return JSON.stringify({
    type: "event_callback",
    event_id: "Ev0123456789",
    event: { type: "message", channel: "C0123456789", user: "U0123456789", text: "password=do-not-log" },
    ...overrides,
  });
}

test("Slack signatures require the untouched body and a current timestamp", () => {
  const body = event();
  assert.equal(verifySlackRequest(body, timestamp, sign(body), secret, now), true);
  assert.equal(verifySlackRequest(`${body} `, timestamp, sign(body), secret, now), false);
  assert.equal(verifySlackRequest(body, String(Number(timestamp) - 301), sign(body, String(Number(timestamp) - 301)), secret, now), false);
});

test("Slack URL verification is acknowledged without processing an event", () => {
  const decision = decideSlackInboundEvent(JSON.stringify({ type: "url_verification", challenge: "signed-challenge" }), configuration);
  assert.deepEqual(decision, { kind: "url_verification", challenge: "signed-challenge" });
});

test("only allowlisted human messages are accepted", () => {
  const accepted = decideSlackInboundEvent(event(), configuration);
  assert.equal(accepted.kind, "accept");
  if (accepted.kind === "accept") assert.equal(accepted.eventId, "Ev0123456789");

  const disallowed = decideSlackInboundEvent(event({ event: { type: "message", channel: "C0000000000", user: "U0123456789", text: "ignore" } }), configuration);
  assert.deepEqual(disallowed, { kind: "ignore", reason: "channel_not_allowed" });
});

test("bot and self-authored messages are filtered before processing", () => {
  const botMessage = decideSlackInboundEvent(event({ event: { type: "message", channel: "C0123456789", user: "U0123456789", bot_id: "B0123456789", text: "ignore" } }), configuration);
  assert.deepEqual(botMessage, { kind: "ignore", reason: "self_message" });

  const selfMessage = decideSlackInboundEvent(event({ event: { type: "message", channel: "C0123456789", user: "U9999999999", text: "ignore" } }), configuration);
  assert.deepEqual(selfMessage, { kind: "ignore", reason: "self_message" });
});

test("inbound logs contain no message text or full identifiers", () => {
  const decision = decideSlackInboundEvent(event(), configuration);
  assert.equal(decision.kind, "accept");
  const log = redactedSlackInboundLog(decision);
  const serialized = JSON.stringify(log);
  assert.doesNotMatch(serialized, /password=do-not-log|C0123456789|U0123456789|Ev0123456789/);
  assert.match(serialized, /accepted/);
});

test("the durable delivery ledger only claims an event once", async () => {
  let deliveries = 0;
  const pool = {
    async query(sql: string) {
      if (sql.includes("CREATE TABLE")) return { rowCount: null, rows: [] };
      deliveries += 1;
      return deliveries === 1
        ? { rowCount: 1, rows: [{ event_id: "Ev0123456789" }] }
        : { rowCount: 0, rows: [] };
    },
  };
  const store = new CockroachOrganizationSlackSettingsStore(pool as never, Buffer.alloc(32, 7));
  const claim = { eventId: "Ev0123456789", eventType: "message", channelId: "C0123456789", senderId: "U0123456789" };
  assert.equal(await store.claimInboundEvent(claim), true);
  assert.equal(await store.claimInboundEvent(claim), false);
});
