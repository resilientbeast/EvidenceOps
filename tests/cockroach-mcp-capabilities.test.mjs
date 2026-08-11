import assert from "node:assert/strict";
import test from "node:test";
import {
  assessCockroachMcpTools,
  assertSelectOnlyCall,
  requiredCockroachMcpReadTools,
} from "../scripts/lib/cockroach-mcp-capabilities.mjs";

test("Managed MCP preflight requires select_query and reports server write tools", () => {
  assert.deepEqual(requiredCockroachMcpReadTools, ["select_query"]);
  assert.deepEqual(assessCockroachMcpTools([
    { name: "select_query" },
    { name: "get_table_schema" },
    { name: "insert_rows" },
  ]), {
    missingRequiredTools: [],
    exposedWriteTools: ["insert_rows"],
  });
});

test("application MCP boundary permits only select_query with SELECT text", () => {
  assert.deepEqual(assertSelectOnlyCall("select_query", { query: "SELECT 1" }), {
    name: "select_query",
    arguments: { query: "SELECT 1" },
  });
  assert.throws(() => assertSelectOnlyCall("insert_rows", { statement: "INSERT INTO x VALUES (1)" }), /rejects tool/);
  assert.throws(() => assertSelectOnlyCall("select_query", { query: "DELETE FROM x" }), /only an explicit SELECT/);
});
