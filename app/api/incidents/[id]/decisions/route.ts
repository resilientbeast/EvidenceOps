import { IncidentConflictError, IncidentNotFoundError } from "@/src/application/errors";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { recordDecision } from "@/src/application/record-decision";
import type { ApiErrorResponse, IncidentResponse } from "@/src/contracts/api";
import { parseDecisionCommand } from "@/src/contracts/api";
import { requireAuthenticatedApiUser } from "@/app/api/auth";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireAuthenticatedApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  let payload: unknown;

  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: "Request body must be valid JSON." } satisfies ApiErrorResponse, { status: 400 });
  }

  const command = parseDecisionCommand(id, payload);
  if (!command) {
    return Response.json(
      { error: "Decision requires actorId, decision, planId, planVersion, and idempotencyKey." } satisfies ApiErrorResponse,
      { status: 400 },
    );
  }

  try {
    const incident = await recordDecision(
      { ...command, actorId: user.userId },
      getConfiguredIncidentRepository(),
    );
    return Response.json({ incident } satisfies IncidentResponse);
  } catch (error) {
    if (error instanceof IncidentNotFoundError) {
      return Response.json({ error: error.message } satisfies ApiErrorResponse, { status: 404 });
    }
    if (error instanceof IncidentConflictError) {
      return Response.json({ error: error.message } satisfies ApiErrorResponse, { status: 409 });
    }

    throw error;
  }
}
