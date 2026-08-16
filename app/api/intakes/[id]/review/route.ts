import { requireAuthenticatedApiUser } from "@/app/api/auth";
import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import { SettingsConfigurationError, SettingsPersistenceError } from "@/src/adapters/settings/organization-slack-settings";
import { redactSlackMessage } from "@/src/adapters/slack/slack-event-guard";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const user = await requireAuthenticatedApiUser(request);
  if (user instanceof Response) return user;
  const { id } = await params;
  if (!isUuid(id)) return Response.json({ error: "Invalid intake ID." }, { status: 400 });

  const review = await parseReview(request);
  if (review instanceof Response) return review;

  try {
    const intake = await getConfiguredSlackSettingsStore().reviewIncidentIntake(user.userId, id, review);
    if (!intake) return Response.json({ error: "Intake is not pending review." }, { status: 409 });
    return Response.json({ intake });
  } catch (error) {
    if (error instanceof SettingsConfigurationError || error instanceof SettingsPersistenceError) {
      return Response.json({ error: "Slack incident intake is unavailable." }, { status: 503 });
    }
    return Response.json({ error: "Unable to review Slack incident intake." }, { status: 503 });
  }
}

async function parseReview(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Expected a JSON review payload." }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return Response.json({ error: "Expected a JSON review payload." }, { status: 400 });
  }
  const record = body as Record<string, unknown>;
  if (record.status !== "reviewed" && record.status !== "dismissed") {
    return Response.json({ error: "Review status must be reviewed or dismissed." }, { status: 400 });
  }
  if (record.note !== undefined && (typeof record.note !== "string" || record.note.length > 2_000)) {
    return Response.json({ error: "Review note is invalid." }, { status: 400 });
  }
  return {
    status: record.status,
    reviewNote: typeof record.note === "string" && record.note.trim() ? redactSlackMessage(record.note) : null,
  } as const;
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
