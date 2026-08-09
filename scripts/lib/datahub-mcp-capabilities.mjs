export const requiredReadTools = ["get_entities", "get_lineage", "get_me"];
export const approvedReadTools = [
  "get_dataset_queries",
  "get_entities",
  "get_lineage",
  "get_lineage_paths_between",
  "get_me",
  "list_schema_fields",
  "search",
];

const writeLikeToolPattern = /^(create|delete|set|update|write|ingest|save|remove|add)(_|$)/i;

export function assessReadOnlyDataHubMcpTools(tools) {
  const toolNames = new Set(tools.map((tool) => tool.name));
  const missingRequiredTools = requiredReadTools.filter((name) => !toolNames.has(name));
  const writeLikeTools = [...toolNames]
    .filter((name) => writeLikeToolPattern.test(name))
    .sort();

  return {
    missingRequiredTools,
    toolNames: [...toolNames].sort(),
    writeLikeTools,
    isSafe: missingRequiredTools.length === 0 && writeLikeTools.length === 0,
  };
}
