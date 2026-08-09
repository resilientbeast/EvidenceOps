import { createServer } from "node:http";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { assessReadOnlyDataHubMcpTools } from "./lib/datahub-mcp-capabilities.mjs";

const requiredEnvironment = [
  "DATAHUB_GMS_URL",
  "DATAHUB_GMS_TOKEN",
  "DATAHUB_MCP_VERSION",
  "DATAHUB_MCP_BRIDGE_TOKEN",
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);
const port = Number(process.env.DATAHUB_MCP_BRIDGE_PORT ?? "7331");
const requestTimeoutMs = 20_000;

function send(response, status, body) {
  response.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}

function getTextPayload(toolResult) {
  if (toolResult.structuredContent && typeof toolResult.structuredContent === "object") {
    return toolResult.structuredContent;
  }
  const text = toolResult.content
    ?.filter((item) => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
  if (!text) throw new Error("DataHub MCP returned no structured text content.");
  try {
    return JSON.parse(text);
  } catch {
    throw new Error("DataHub MCP returned a context format this bridge does not recognize.");
  }
}

function visit(value, predicate, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return undefined;
  seen.add(value);
  if (predicate(value)) return value;
  for (const child of Array.isArray(value) ? value : Object.values(value)) {
    const found = visit(child, predicate, seen);
    if (found) return found;
  }
  return undefined;
}

function collect(value, predicate, matches = [], seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return matches;
  seen.add(value);
  if (predicate(value)) matches.push(value);
  for (const child of Array.isArray(value) ? value : Object.values(value)) collect(child, predicate, matches, seen);
  return matches;
}

function humanName(value) {
  if (!value || typeof value !== "object") return undefined;
  const properties = value.properties && typeof value.properties === "object" ? value.properties : undefined;
  return value.displayName ?? value.name ?? properties?.displayName ?? properties?.name;
}

function normalizeMcpContext(urn, entityPayload, lineagePayload) {
  const source = visit(entityPayload, (value) => value.urn === urn);
  if (!source) throw new Error("DataHub MCP entity response did not contain the requested source URN.");

  const properties = source.properties && typeof source.properties === "object" ? source.properties : {};
  const owners = collect(source, (value) => typeof value.displayName === "string" || (value.properties && typeof value.properties.displayName === "string"))
    .map(humanName)
    .filter((name) => typeof name === "string");
  const fieldContainer = visit(source, (value) => Array.isArray(value.fields) || Array.isArray(value.schemaFields));
  const fields = fieldContainer?.fields ?? fieldContainer?.schemaFields ?? [];
  const lineage = collect(lineagePayload, (value) => typeof value.urn === "string" && value.urn !== urn)
    .map((value) => ({
      urn: value.urn,
      name: humanName(value) ?? value.urn,
      type: typeof value.type === "string" ? value.type : "DATASET",
      degree: Number.isFinite(value.degree) ? value.degree : Number.isFinite(value.hops) ? value.hops : 1,
    }));

  return {
    source: {
      urn,
      name: humanName(source) ?? properties.name ?? urn,
      description: typeof properties.description === "string" ? properties.description : null,
      owners: [...new Set(owners)],
      schemaFieldCount: Array.isArray(fields) ? fields.length : 0,
    },
    downstreams: [...new Map(lineage.map((entry) => [entry.urn, entry])).values()],
    observedAt: new Date().toISOString(),
  };
}

function lineageArguments(tool, urn) {
  const properties = tool.inputSchema?.properties ?? {};
  if ("upstream" in properties) return { urn, upstream: false, max_hops: 3 };
  return { urn, direction: "downstream", depth: 3 };
}

async function withTimeout(operation, timeoutMs = requestTimeoutMs) {
  let timeout;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`DataHub MCP request timed out after ${timeoutMs / 1000}s.`)), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

async function readMcpContext(urn) {
  const client = new Client({ name: "recallops-datahub-mcp-bridge", version: "0.1.0" });
  const transport = new StdioClientTransport({
    command: process.env.DATAHUB_MCP_COMMAND ?? "uvx",
    args: [`mcp-server-datahub@${process.env.DATAHUB_MCP_VERSION}`],
    env: {
      ...process.env,
      TOOLS_IS_MUTATION_ENABLED: "false",
      TOOLS_IS_USER_ENABLED: "true",
      DATAHUB_MCP_DOCUMENT_TOOLS_DISABLED: "true",
      SAVE_DOCUMENT_TOOL_ENABLED: "false",
    },
    stderr: "pipe",
  });

  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const assessment = assessReadOnlyDataHubMcpTools(tools);
    if (!assessment.isSafe) throw new Error("DataHub MCP toolset failed the read-only capability check.");

    const lineageTool = tools.find((tool) => tool.name === "get_lineage");
    if (!lineageTool) throw new Error("DataHub MCP did not provide get_lineage.");
    const [entities, lineage] = await Promise.all([
      client.callTool({ name: "get_entities", arguments: { urns: [urn] } }),
      client.callTool({ name: "get_lineage", arguments: lineageArguments(lineageTool, urn) }),
    ]);
    return normalizeMcpContext(urn, getTextPayload(entities), getTextPayload(lineage));
  } finally {
    await Promise.race([
      client.close(),
      new Promise((resolve) => setTimeout(resolve, 1_000)),
    ]);
  }
}

if (missingEnvironment.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnvironment.join(", ")}.`);
  process.exitCode = 1;
} else if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  console.error("DATAHUB_MCP_BRIDGE_PORT must be an unprivileged TCP port.");
  process.exitCode = 1;
} else {
  createServer(async (request, response) => {
    if (request.method === "GET" && request.url === "/health") {
      send(response, 200, { status: "ok", access: "loopback-only DataHub MCP bridge" });
      return;
    }
    if (request.method !== "POST" || request.url !== "/context") {
      send(response, 404, { error: "Not found." });
      return;
    }
    if (request.headers.authorization !== `Bearer ${process.env.DATAHUB_MCP_BRIDGE_TOKEN}`) {
      send(response, 401, { error: "Unauthorized." });
      return;
    }

    let body = "";
    for await (const chunk of request) body += chunk;
    try {
      const { urn } = JSON.parse(body);
      if (typeof urn !== "string" || !urn.startsWith("urn:li:")) {
        send(response, 400, { error: "A DataHub URN is required." });
        return;
      }
      send(response, 200, { context: await withTimeout(readMcpContext(urn)) });
    } catch (error) {
      send(response, 503, { error: error instanceof Error ? error.message : "DataHub MCP context is unavailable." });
    }
  }).listen(port, "127.0.0.1", () => {
    console.log(`RecallOps DataHub MCP bridge listening at http://127.0.0.1:${port}.`);
  });
}
