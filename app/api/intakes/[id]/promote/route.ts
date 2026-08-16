import { requireAuthenticatedApiUser } from "@/app/api/auth";
import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import { SettingsConfigurationError, SettingsPersistenceError } from "@/src/adapters/settings/organization-slack-settings";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireAuthenticatedApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Invalid intake ID." }, { status: 400 });

  try {
    const incidentId = await getConfiguredSlackSettingsStore().promoteIncidentIntake(user.userId, id);
    if (!incidentId) return Response.json({ error: "Only a reviewed intake can be promoted once." }, { status: 409 });
    return Response.json({ incidentId });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsPersistenceError) {
      return Response.json({ error: "Slack intake promotion is unavailable." }, { status: 503 });
    }
    return Response.json({ error: "Unable to promote Slack intake." }, { status: 503 });
  }
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
