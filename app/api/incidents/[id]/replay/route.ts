import { IncidentNotFoundError } from "@/src/application/errors";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { readIncidentReplay } from "@/src/application/read-incident-replay";
import { requireAuthenticatedApiUser } from "@/app/api/auth";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const authentication = await requireAuthenticatedApiUser(request);
  if (authentication instanceof Response) return authentication;
  const { id } = await params;

  try {
    return Response.json({ replay: await readIncidentReplay(id, getConfiguredIncidentRepository()) });
  } catch (error) {
    if (error instanceof IncidentNotFoundError) {
      return Response.json({ error: error.message }, { status: 404 });
    }
    throw error;
  }
}
