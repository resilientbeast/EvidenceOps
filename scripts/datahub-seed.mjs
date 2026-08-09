import { spawn } from "node:child_process";

const requiredEnvironment = ["DATAHUB_SEED_TOKEN"];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

if (missingEnvironment.length > 0) {
  console.error(
    `Missing required environment variable(s): ${missingEnvironment.join(", ")}. ` +
      "Supply a temporary DataHub writer token only for seeding. The default MCP token must remain read-only.",
  );
  process.exitCode = 1;
} else {
  const child = spawn(
    "uvx",
    [
      "--from",
      "acryl-datahub==1.6.0",
      "python",
      "scripts/datahub-seed-bootstrap.py",
    ],
    {
      env: process.env,
      shell: process.platform === "win32",
      stdio: "inherit",
    },
  );

  child.on("error", (error) => {
    console.error(`Unable to start DataHub sample ingestion: ${error.message}`);
    process.exitCode = 1;
  });

  child.on("exit", (code, signal) => {
    if (code !== 0) {
      console.error(
        `DataHub sample ingestion ${signal ? `ended with ${signal}` : `exited with code ${code}`}.`,
      );
      process.exitCode = code ?? 1;
    }
  });
}
