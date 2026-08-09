import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { assessReadOnlyDataHubMcpTools } from "./lib/datahub-mcp-capabilities.mjs";

const requiredEnvironment = [
  "DATAHUB_GMS_URL",
  "DATAHUB_GMS_TOKEN",
  "DATAHUB_MCP_VERSION",
];

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvironment.join(", ")}. ` +
      "Copy .env.example to .env.local, supply a read-only service-account token, " +
      "and pin the MCP server version after a successful preflight.",
  );
  process.exitCode = 1;
} else {
  const command = process.env.DATAHUB_MCP_COMMAND ?? "uvx";
  const serverPackage = `mcp-server-datahub@${process.env.DATAHUB_MCP_VERSION}`;
  const client = new Client({
    name: "recallops-datahub-preflight",
    version: "0.1.0",
  });
  const transport = new StdioClientTransport({
    command,
    args: [serverPackage],
    env: {
      ...process.env,
      DATAHUB_GMS_URL: process.env.DATAHUB_GMS_URL,
      DATAHUB_GMS_TOKEN: process.env.DATAHUB_GMS_TOKEN,
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
    const capabilityAssessment = assessReadOnlyDataHubMcpTools(tools);

    if (capabilityAssessment.missingRequiredTools.length > 0) {
      throw new Error(
        `Connected MCP server is missing required read tools: ${capabilityAssessment.missingRequiredTools.join(", ")}.`,
      );
    }

    if (capabilityAssessment.writeLikeTools.length > 0) {
      throw new Error(
        `Read-only preflight exposed mutation-like tool(s): ${capabilityAssessment.writeLikeTools.join(", ")}.`,
      );
    }

    await client.callTool({ name: "get_me", arguments: {} });
    console.log(
      JSON.stringify({
        status: "ok",
        serverPackage,
        tools: capabilityAssessment.toolNames,
        authenticatedAs: "get_me succeeded",
      }),
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`DataHub MCP preflight failed: ${message}`);
    process.exitCode = 1;
  } finally {
    await client.close();
  }
}
