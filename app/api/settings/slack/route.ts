import { requireAuthenticatedApiUser } from "@/app/api/auth";
import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import { SettingsConfigurationError, SettingsPersistenceError } from "@/src/adapters/settings/organization-slack-settings";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  const user = await requireAuthenticatedApiUser(request);
  if (user instanceof Response) return user;

  try {
    const settings = await getConfiguredSlackSettingsStore().read(user.userId);
    return Response.json({ settings });
  } catch (error) {
    return settingsError(error);
  }
}

export async function PUT(request: Request): Promise<Response> {
  const user = await requireAuthenticatedApiUser(request);
  if (user instanceof Response) return user;

  const parsed = await parseUpdate(request);
  if (parsed instanceof Response) return parsed;

  try {
    const settings = await getConfiguredSlackSettingsStore().update(user.userId, parsed);
    return Response.json({ settings });
  } catch (error) {
    return settingsError(error);
  }
}

async function parseUpdate(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON settings payload." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON settings payload." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  const update: { botToken?: string; appToken?: string; signingSecret?: string; botUserId?: string; allowedChannelIds?: string[] } = {};
  if ("botToken" in record) {
    if (typeof record.botToken !== "string" || record.botToken.length > 512) {
      return Response.json({ error: "The Slack bot token is invalid." }, { status: 400 });
    }
    update.botToken = record.botToken.trim();
  }
  if ("appToken" in record) {
    if (typeof record.appToken !== "string" || record.appToken.length > 512) {
      return Response.json({ error: "The Slack app token is invalid." }, { status: 400 });
    }
    update.appToken = record.appToken.trim();
  }
  if ("signingSecret" in record) {
    if (typeof record.signingSecret !== "string" || record.signingSecret.length > 512) {
      return Response.json({ error: "The Slack signing secret is invalid." }, { status: 400 });
    }
    update.signingSecret = record.signingSecret.trim();
  }
  if ("botUserId" in record) {
    if (typeof record.botUserId !== "string" || !/^(?:U|W)[A-Z0-9]{8,}$/.test(record.botUserId.trim())) {
      return Response.json({ error: "The Slack bot user ID is invalid." }, { status: 400 });
    }
    update.botUserId = record.botUserId.trim();
  }
  if ("allowedChannelIds" in record) {
    if (!Array.isArray(record.allowedChannelIds) || record.allowedChannelIds.length > 50) {
      return Response.json({ error: "Provide up to 50 Slack channel IDs." }, { status: 400 });
    }
    const channelIds = record.allowedChannelIds.map((value) => typeof value === "string" ? value.trim() : "");
    if (channelIds.some((id) => !/^C[A-Z0-9]{8,}$/.test(id))) {
      return Response.json({ error: "Each Slack channel ID must use Slack's C-prefixed format." }, { status: 400 });
    }
    update.allowedChannelIds = [...new Set(channelIds)];
  }
  if (Object.keys(update).length === 0) {
    return Response.json({ error: "Provide at least one setting to update." }, { status: 400 });
  }
  return update;
}

function settingsError(error: unknown): Response {
  if (error instanceof SettingsConfigurationError || error instanceof SettingsPersistenceError) {
    return Response.json({ error: error.message }, { status: 503 });
  }
  return Response.json({ error: "Unable to save persistent Slack settings." }, { status: 500 });
}
