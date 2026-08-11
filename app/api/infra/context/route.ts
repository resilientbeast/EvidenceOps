import { CockroachCatalog } from "@/src/adapters/infra-catalog/cockroach-catalog";
import { getConfiguredCockroachPool } from "@/src/application/configured-incident-repository";

export async function GET(request: Request) {
  try {
    const pool = getConfiguredCockroachPool();
    if (!pool) throw new Error("COCKROACHDB_URL is not configured.");
    const incidentId = new URL(request.url).searchParams.get("incidentId")
      ?? process.env.RECALLOPS_ACTIVE_INCIDENT_ID;
    if (!incidentId) throw new Error("An incidentId is required for infrastructure catalog lookup.");
    const context = await new CockroachCatalog(pool).getByIncidentId(incidentId);
    if (!context) {
      return Response.json(
        { error: { code: "INFRA_CONTEXT_NOT_FOUND", message: `No infrastructure context exists for ${incidentId}.` } },
        { status: 404 },
      );
    }
    return Response.json({ context });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CockroachDB infrastructure context is unavailable.";
    return Response.json({ error: { code: "INFRA_CONTEXT_UNAVAILABLE", message } }, { status: 503 });
  }
}
