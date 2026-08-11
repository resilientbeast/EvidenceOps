export const requiredCockroachMcpReadTools = ["select_query"];

const writeToolPattern = /^(create|insert|update|delete|drop|alter|truncate|grant|revoke)_/i;

export function assessCockroachMcpTools(tools) {
  const names = tools
    .map((tool) => tool?.name)
    .filter((name) => typeof name === "string");
  return {
    missingRequiredTools: requiredCockroachMcpReadTools.filter((name) => !names.includes(name)),
    exposedWriteTools: names.filter((name) => writeToolPattern.test(name)),
  };
}

export function assertSelectOnlyCall(name, args) {
  if (name !== "select_query") {
    throw new Error(`EvidenceOps MCP boundary rejects tool ${JSON.stringify(name)}.`);
  }
  if (!args || typeof args.query !== "string" || !/^\s*SELECT\b/i.test(args.query)) {
    throw new Error("EvidenceOps MCP boundary accepts only an explicit SELECT query.");
  }
  return { name, arguments: { query: args.query } };
}
