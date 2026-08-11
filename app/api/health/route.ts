export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json({
    service: "evidenceops",
    status: "ok",
    configured: {
      cockroachdb: Boolean(process.env.COCKROACHDB_URL),
      cockroachdbManagedMcp: Boolean(
        process.env.COCKROACHDB_MCP_URL
        && process.env.COCKROACHDB_MCP_CLUSTER_ID
        && process.env.COCKROACHDB_MCP_API_KEY,
      ),
      bedrock: Boolean(
        process.env.AWS_BEARER_TOKEN_BEDROCK
        && process.env.AWS_REGION
        && process.env.BEDROCK_REASONING_MODEL_ID,
      ),
    },
  });
}
