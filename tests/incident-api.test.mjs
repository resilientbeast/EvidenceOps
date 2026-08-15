import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";
const phpFpmIncidentId = "40000000-0000-4000-8000-000000000006";

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

function authenticatedRequest(url, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("x-evidenceops-test-auth", "fixture");
  return new Request(url, { ...init, headers });
}

const executionContext = {
  waitUntil() {},
  passThroughOnException() {},
};

test("incident API serves a typed fixture and enforces decision idempotency", async () => {
  const worker = await loadWorker();

  const healthResponse = await worker.fetch(
    new Request("http://localhost/api/health"),
    environment(),
    executionContext,
  );
  assert.equal(healthResponse.status, 200);
  assert.equal((await healthResponse.json()).status, "ok");

  const unauthenticatedResponse = await worker.fetch(
    new Request(`http://localhost/api/incidents/${phpFpmIncidentId}`),
    environment(),
    executionContext,
  );
  assert.equal(unauthenticatedResponse.status, 503);

  const incidentResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}`),
    environment(),
    executionContext,
  );
  assert.equal(incidentResponse.status, 200);
  const initialPayload = await incidentResponse.json();
  assert.equal(initialPayload.incident.id, phpFpmIncidentId);
  assert.equal(initialPayload.incident.mode, "fixture");
  assert.equal(initialPayload.incident.title, "PHP-FPM pool exhausted by live Elementor regeneration on frontend requests");
  assert.equal(initialPayload.incident.historicalMemoryCount, 0);
  assert.equal(initialPayload.incident.historicalMatch.incidentId, "none");
  assert.equal(initialPayload.incident.decision.kind, "approved");

  const unavailableAgentResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}/agent-run`, { method: "POST" }),
    environment(),
    executionContext,
  );
  assert.equal(unavailableAgentResponse.status, 503);
  assert.match((await unavailableAgentResponse.json()).error, /AWS_BEARER_TOKEN_BEDROCK/);

  const invalidResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ decision: "approved" }),
    }),
    environment(),
    executionContext,
  );
  assert.equal(invalidResponse.status, 400);

  const command = {
    actorId: "client-confirmed",
    decision: "approved",
    idempotencyKey: "seed-php-fpm-elementor-resolved",
    planId: "PLAN-PHP-FPM-ELEMENTOR-1",
    planVersion: 1,
  };
  const decisionResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    }),
    environment(),
    executionContext,
  );
  assert.equal(decisionResponse.status, 200);
  const decisionPayload = await decisionResponse.json();
  assert.equal(decisionPayload.incident.status, "resolved");
  assert.equal(decisionPayload.incident.decision.kind, "approved");
  assert.equal(decisionPayload.incident.events.length, 4);

  const replayResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}/replay`),
    environment(),
    executionContext,
  );
  assert.equal(replayResponse.status, 200);
  const replayPayload = await replayResponse.json();
  assert.equal(replayPayload.replay.evidence.length, 4);
  assert.equal(replayPayload.replay.investigation.length, 4);
  assert.equal(replayPayload.replay.decision.kind, "approved");
  assert.equal(replayPayload.replay.learning.status, "ready_for_review");

  const idempotentReplayResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(command),
    }),
    environment(),
    executionContext,
  );
  assert.equal(idempotentReplayResponse.status, 200);
  const idempotentReplayPayload = await idempotentReplayResponse.json();
  assert.equal(idempotentReplayPayload.incident.events.length, 4);

  const conflictResponse = await worker.fetch(
    authenticatedRequest(`http://localhost/api/incidents/${phpFpmIncidentId}/decisions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...command, idempotencyKey: "test-approval-2" }),
    }),
    environment(),
    executionContext,
  );
  assert.equal(conflictResponse.status, 409);
});
