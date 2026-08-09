import assert from "node:assert/strict";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );
}

test("server-renders the incident console", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<title>RecallOps — Agentic Incident Command<\/title>/i);
  assert.match(html, /NYC Taxi pipeline is 9h 42m stale/);
  assert.match(html, /Competing hypotheses/);
  assert.match(html, /Evidence-gated investigation/);
  assert.match(html, /MATCH DELTA/);
  assert.match(html, /3(?:<!-- -->)? stored resolutions searched/);
  assert.match(html, /HUMAN DECISION GATE/);
});

test("fixture mode is explicit and never presented as a live connection", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /DEMO FIXTURE[\s\S]*INC-247/);
  assert.match(html, /DataHub fixture/);
  assert.match(html, /Memory fixture/);
  assert.match(html, /Fixture · seeded demo/);
  assert.doesNotMatch(html, /DataHub connected/);
  assert.doesNotMatch(html, /Memory online/);
  assert.doesNotMatch(html, /DataHub · just now/);
});
