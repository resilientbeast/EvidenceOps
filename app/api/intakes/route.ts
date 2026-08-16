import { requireAuthenticatedApiUser } from "@/app/api/auth";
import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import { SettingsConfigurationError, SettingsPersistenceError } from "@/src/adapters/settings/organization-slack-settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await requireAuthenticatedApiUser(request);
  if (user instanceof Response) return user;

  try {
    const intakes = await getConfiguredSlackSettingsStore().listIncidentIntakes(user.userId);
    return Response.json({ intakes });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsPersistenceError) {
      return Response.json({ error: "Slack incident intake is unavailable." }, { status: 503 });
    }
    return Response.json({ error: "Unable to load Slack incident intake." }, { status: 503 });
  }
}
