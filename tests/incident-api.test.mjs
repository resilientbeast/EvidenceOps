import assert from "node:assert/strict";
import test from "node:test";

async function loadWorker() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker;
}

function environment() {
  return {
    ASSETS: {
      fetch: async () => new Response("Not found", { status: 404 }),
    },
  };
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

test("incident API serves a typed fixture and enforces decision idempotency", async () => {
  const worker = await loadWorker();

  const incidentResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247"),
    environment(),
    executionContext,
  );
  assert.equal(incidentResponse.status, 200);
  const initialPayload = await incidentResponse.json();
  assert.equal(initialPayload.incident.id, "INC-247");
  assert.equal(initialPayload.incident.mode, "fixture");
  assert.equal(initialPayload.incident.historicalMemoryCount, 3);
  assert.equal(initialPayload.incident.historicalMatch.incidentId, "INC-184");
  assert.match(initialPayload.incident.historicalMatch.summary, /Retrieved from 3 stored resolutions/);
  assert.equal(initialPayload.incident.decision, undefined);

  const unavailableAgentResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247/agent-run", { method: "POST" }),
    environment(),
    executionContext,
  );
  assert.equal(unavailableAgentResponse.status, 503);
  assert.match((await unavailableAgentResponse.json()).error, /AWS_BEARER_TOKEN_BEDROCK/);

  const invalidResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    }),
    environment(),
    executionContext,
  );
  assert.equal(invalidResponse.status, 400);

  const command = {
    actorId: "demo-operator",
    decision: "approved",
    idempotencyKey: "test-approval-1",
    planId: "PLAN-247-1",
    planVersion: 1,
  };
  const decisionResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    }),
    environment(),
    executionContext,
  );
  assert.equal(decisionResponse.status, 200);
  const decisionPayload = await decisionResponse.json();
  assert.equal(decisionPayload.incident.status, "awaiting_execution");
  assert.equal(decisionPayload.incident.decision.kind, "approved");
  assert.equal(decisionPayload.incident.events.length, 5);

  const replayResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247/replay"),
    environment(),
    executionContext,
  );
  assert.equal(replayResponse.status, 200);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.replay.evidence.length, 4);
  assert.equal(replayPayload.replay.investigation.length, 4);
  assert.equal(replayPayload.replay.decision.kind, "approved");
  assert.equal(replayPayload.replay.learning.status, "awaiting_human_outcome");

  const idempotentReplayResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    }),
    environment(),
    executionContext,
  );
  assert.equal(idempotentReplayResponse.status, 200);
  const idempotentReplayPayload = await idempotentReplayResponse.json();
  assert.equal(idempotentReplayPayload.incident.events.length, 5);

  const conflictResponse = await worker.fetch(
    new Request("http://localhost/api/incidents/INC-247/decisions", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...command, idempotencyKey: "test-approval-2" }),
    }),
    environment(),
    executionContext,
  );
  assert.equal(conflictResponse.status, 409);
});
