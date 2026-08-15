import { readConfiguredLiveDataHubContext } from "@/src/adapters/datahub/live-context";
import { requireAuthenticatedApiUser } from "@/app/api/auth";

const defaultSourceUrn = "urn:li:dataset:(urn:li:dataPlatform:hive,fct_users_created,PROD)";

export async function GET(request: Request) {
  const authentication = await requireAuthenticatedApiUser(request);
  if (authentication instanceof Response) return authentication;
  try {
    const sourceUrn = process.env.DATAHUB_LIVE_SOURCE_URN ?? defaultSourceUrn;
    return Response.json({ context: await readConfiguredLiveDataHubContext(sourceUrn) });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Live DataHub context is unavailable.";
    return Response.json({ error: { code: "DATAHUB_CONTEXT_UNAVAILABLE", message } }, { status: 503 });
  }
}
