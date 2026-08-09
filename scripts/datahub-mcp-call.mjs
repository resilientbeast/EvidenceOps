import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { approvedReadTools } from "./lib/datahub-mcp-capabilities.mjs";

const [toolName, rawArguments = "{}"] = process.argv.slice(2);

if (!toolName || !approvedReadTools.includes(toolName)) {
  console.error(
    `Choose one read-only tool: ${approvedReadTools.join(", ")}.`,
  );
  process.exitCode = 1;
} else {
  let toolArguments;
  try {
    toolArguments = JSON.parse(rawArguments);
  } catch {
    console.error("The second argument must be a JSON object.");
    process.exitCode = 1;
  }

  if (process.exitCode !== 1) {
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
        name: "recallops-datahub-read-client",
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
        const result = await client.callTool({
          name: toolName,
          arguments: toolArguments,
        });
        console.log(JSON.stringify(result, null, 2));
      } catch (error) {
        console.error(
          `DataHub MCP read failed: ${error instanceof Error ? error.message : String(error)}`,
        );
        process.exitCode = 1;
      } finally {
        await Promise.race([
          client.close(),
          new Promise((resolve) => setTimeout(resolve, 1_000)),
        ]);
      }
    }
  }
}
