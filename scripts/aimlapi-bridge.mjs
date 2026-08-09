import { createServer } from "node:http";

const apiKey = process.env.AIMLAPI_KEY;
const bridgeToken = process.env.AIMLAPI_BRIDGE_TOKEN ?? apiKey;
const port = Number(process.env.AIMLAPI_BRIDGE_PORT ?? "7332");

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

if (!apiKey || !bridgeToken) {
  console.error("AIMLAPI_KEY is required to start the AIMLAPI bridge.");
  process.exitCode = 1;
} else if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("AIMLAPI_BRIDGE_PORT must be an unprivileged TCP port.");
  process.exitCode = 1;
} else {
  createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      send(response, 200, { status: "ok", access: "loopback-only AIMLAPI bridge" });
      return;
    }
    if (request.method !== "POST" || request.url !== "/v1/chat/completions") {
      send(response, 404, { error: "Not found." });
      return;
    }
    if (request.headers.authorization !== `Bearer ${bridgeToken}`) {
      send(response, 401, { error: "Unauthorized." });
      return;
    }

    let body = "";
    for await (const chunk of request) {
      body += chunk;
      if (body.length > 1_000_000) {
        send(response, 413, { error: "Request body too large." });
        return;
      }
    }

    try {
      JSON.parse(body);
      const upstream = await fetch("https://api.aimlapi.com/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body,
      });
      const responseBody = await upstream.text();
      response.writeHead(upstream.status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
      response.end(responseBody);
    } catch (error) {
      console.error("AIMLAPI bridge request failed:", error instanceof Error ? error.message : "unknown error");
      send(response, 502, { error: "AIMLAPI bridge could not complete the provider request." });
    }
  }).listen(port, "127.0.0.1", () => {
    console.log(`RecallOps AIMLAPI bridge listening at http://127.0.0.1:${port}.`);
  });
}
