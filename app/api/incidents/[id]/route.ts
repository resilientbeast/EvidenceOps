import { IncidentNotFoundError } from "@/src/application/errors";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { readIncident } from "@/src/application/read-incident";
import type { ApiErrorResponse, IncidentResponse } from "@/src/contracts/api";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const incident = await readIncident(id, getConfiguredIncidentRepository());
    return Response.json({ incident } satisfies IncidentResponse);
  } catch (error) {
    if (error instanceof IncidentNotFoundError) {
      return Response.json({ error: error.message } satisfies ApiErrorResponse, { status: 404 });
    }

    throw error;
  }
}
