import { IntakeReviewQueue } from "@/app/intakes/intake-review-queue";
import { authenticateLocalRequest } from "@/src/adapters/auth/local-auth";
import { getConfiguredSlackSettingsStore } from "@/src/application/configured-organization-settings";
import type { SlackIncidentIntake } from "@/src/adapters/settings/organization-slack-settings";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function IntakesPage() {
  const requestHeaders = await headers();
  const authentication = authenticateLocalRequest(new Request("http://internal.local/intakes", { headers: requestHeaders }));
  if (authentication.kind !== "authenticated") redirect("/sign-in?redirect_url=%2Fintakes");

  let intakes: SlackIncidentIntake[] = [];
  let initialError = "";
  try {
    intakes = await getConfiguredSlackSettingsStore().listIncidentIntakes(authentication.userId);
  } catch {
    initialError = "Slack incident intake is unavailable.";
  }
  return <IntakeReviewQueue initialIntakes={intakes} initialError={initialError} />;
}
