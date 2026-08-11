import { getConfiguredInfrastructureCatalog } from "@/src/application/configured-infrastructure-catalog";

export async function GET(request: Request) {
  try {
    const incidentId = new URL(request.url).searchParams.get("incidentId")
      ?? process.env.RECALLOPS_ACTIVE_INCIDENT_ID;
    if (!incidentId) throw new Error("An incidentId is required for infrastructure catalog lookup.");
    const context = await getConfiguredInfrastructureCatalog().getByIncidentId(incidentId);
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
