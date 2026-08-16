import assert from "node:assert/strict";
import test from "node:test";

process.env.NODE_ENV = "test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/dashboard", {
      headers: {
        accept: "text/html",
        "x-evidenceops-test-auth": "fixture",
      },
    }),
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
  assert.match(html, /<title>EvidenceOps — Evidence-Gated Incident Response<\/title>/i);
  assert.match(html, /PHP-FPM pool exhausted by live Elementor regeneration on frontend requests/);
  assert.match(html, /Competing hypotheses/);
  assert.match(html, /Evidence-gated investigation/);
  assert.match(html, /MATCH DELTA/);
  assert.match(html, /0(?:<!-- -->)? stored resolutions searched/);
  assert.match(html, /HUMAN DECISION GATE/);
});

test("server-renders a public landing page with a dashboard sign-in path", async () => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  const response = await worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );

  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /Turn an infrastructure alert into a defensible next step/);
  assert.match(html, /href="\/dashboard"/);
  assert.match(html, /Evidence before action/);
});

test("fixture mode is explicit and never presented as a live connection", async () => {
  const response = await render();
  const html = await response.text();

  assert.match(html, /SEEDED RECORD[\s\S]*40000000-0000-4000-8000-000000000006/);
  assert.match(html, /Seeded incident record/);
  assert.match(html, /Memory fixture/);
  assert.match(html, /Seeded evidence · anonymized client/);
  assert.doesNotMatch(html, /third-party catalog/i);
  assert.doesNotMatch(html, /Memory online/);
});
