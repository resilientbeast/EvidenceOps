import assert from "node:assert/strict";
import test from "node:test";
import {
  approvedReadTools,
  assessReadOnlyDataHubMcpTools,
} from "../scripts/lib/datahub-mcp-capabilities.mjs";

test("approved tool list contains only discovery and read operations", () => {
  assert.deepEqual(approvedReadTools, [
    "get_dataset_queries",
    "get_entities",
    "get_lineage",
    "get_lineage_paths_between",
    "get_me",
    "list_schema_fields",
    "search",
  ]);
});

test("DataHub MCP preflight accepts only the expected read-only toolset", () => {
  const assessment = assessReadOnlyDataHubMcpTools([
    { name: "get_entities" },
    { name: "get_lineage" },
    { name: "get_me" },
    { name: "get_dataset_queries" },
    { name: "list_schema_fields" },
  ]);

  assert.equal(assessment.isSafe, true);
  assert.deepEqual(assessment.missingRequiredTools, []);
  assert.deepEqual(assessment.writeLikeTools, []);
});

test("DataHub MCP preflight rejects missing and write-capable tools", () => {
  const assessment = assessReadOnlyDataHubMcpTools([
    { name: "get_entities" },
    { name: "save_document" },
    { name: "update_tag" },
  ]);

  assert.equal(assessment.isSafe, false);
  assert.deepEqual(assessment.missingRequiredTools, ["get_lineage", "get_me"]);
  assert.deepEqual(assessment.writeLikeTools, ["save_document", "update_tag"]);
});
