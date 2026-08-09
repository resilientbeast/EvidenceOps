import type { RecordDecisionInput } from "@/src/adapters/incident-repository";
import type { Incident } from "@/src/domain/incident";

export type IncidentResponse = { incident: Incident };
export type ApiErrorResponse = { error: string };

export function parseDecisionCommand(
  incidentId: string,
  payload: unknown,
): RecordDecisionInput | null {
  if (!isRecord(payload)) return null;

  const { actorId, decision, idempotencyKey, planId, planVersion } = payload;
  if (
    typeof actorId !== "string" ||
    (decision !== "approved" && decision !== "review") ||
    typeof idempotencyKey !== "string" ||
    typeof planId !== "string" ||
    typeof planVersion !== "number" ||
    !Number.isInteger(planVersion)
  ) {
    return null;
  }

  return { incidentId, actorId, decision, idempotencyKey, planId, planVersion };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
