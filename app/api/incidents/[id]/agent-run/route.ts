import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { getConfiguredClusterHealthEvidenceProvider } from "@/src/application/configured-cluster-health";
import { IncidentNotFoundError } from "@/src/application/errors";
import { readIncident } from "@/src/application/read-incident";
import {
  AiEvidenceValidationError,
  AiInvestigationUnavailableError,
  runAiInvestigation,
} from "@/src/application/run-ai-investigation";
import type { ApiErrorResponse, IncidentResponse } from "@/src/contracts/api";

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const repository = getConfiguredIncidentRepository();

  try {
    const incident = await readIncident(id, repository);
    const generatedIncident = await runAiInvestigation(
      incident,
      process.env,
      getConfiguredClusterHealthEvidenceProvider(),
    );
    const savedIncident = await repository.saveAgentRun(generatedIncident);
    return Response.json({ incident: savedIncident } satisfies IncidentResponse);
  } catch (error) {
    if (error instanceof IncidentNotFoundError) {
      return Response.json({ error: error.message } satisfies ApiErrorResponse, { status: 404 });
    }
    if (error instanceof AiInvestigationUnavailableError) {
      return Response.json({ error: error.message } satisfies ApiErrorResponse, { status: 503 });
    }
    if (error instanceof AiEvidenceValidationError) {
      console.error("EvidenceOps evidence validation failed:", error.message);
      return Response.json({ error: "The model output did not pass EvidenceOps evidence validation. Please run it again." } satisfies ApiErrorResponse, { status: 422 });
    }
    return Response.json(
      { error: "The AI investigation endpoint encountered an unexpected error. Please try again." } satisfies ApiErrorResponse,
      { status: 503 },
    );
  }
}
