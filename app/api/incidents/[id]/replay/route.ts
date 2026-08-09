import { IncidentNotFoundError } from "@/src/application/errors";
import { getConfiguredIncidentRepository } from "@/src/application/configured-incident-repository";
import { readIncidentReplay } from "@/src/application/read-incident-replay";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
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
