import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const requiredEnvironment = [
  "DATAHUB_GMS_URL",
  "DATAHUB_GMS_TOKEN",
  "DATAHUB_MCP_VERSION",
];

const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  console.error(`Missing required environment variable(s): ${missingEnvironment.join(", ")}.`);
  process.exitCode = 1;
} else {
  const client = new Client({
    name: "recallops-datahub-tool-inspector",
    version: "0.1.0",
  });
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
    console.log(
      JSON.stringify(
        tools.map(({ name, description, inputSchema }) => ({ name, description, inputSchema })),
        null,
        2,
      ),
    );
  } finally {
    await client.close();
  }
}
