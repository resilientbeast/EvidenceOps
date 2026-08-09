import { z } from "zod";
import type { Incident } from "@/src/domain/incident";

const defaultModel = "openai/gpt-4.1-mini";
const unavailableModelIds = new Set(["aion-labs/aion-1.0"]);

const generatedHypothesisSchema = z.object({
  id: z.string(),
  confidence: z.number().int().min(0).max(100),
  verdict: z.enum(["Leading", "Weakened", "Unlikely"]),
  summary: z.string().min(12).max(280),
  supportingEvidenceIds: z.array(z.string()).max(4),
  contradictingEvidenceIds: z.array(z.string()).max(4),
  unknowns: z.union([
    z.array(z.string()).max(4),
    z.string().min(1).transform((value) => [value]),
  ]),
  reviewerFinding: z.string().min(12).max(360),
});

const agentFindingSchema = z.object({
  finding: z.string().min(12).max(360),
  evidenceIds: z.array(z.string()).min(1).max(4),
});

const investigationOutputSchema = z.object({
  hypotheses: z.array(generatedHypothesisSchema).length(3),
  investigator: agentFindingSchema,
  historian: agentFindingSchema,
  planner: agentFindingSchema,
  reviewer: agentFindingSchema,
});

type InvestigationOutput = z.infer<typeof investigationOutputSchema>;

export class AiInvestigationUnavailableError extends Error {
  constructor(message = "AIMLAPI_KEY is not configured. Add it to .env.local before running an AI investigation.") {
    super(message);
    this.name = "AiInvestigationUnavailableError";
  }
}

export class AiEvidenceValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiEvidenceValidationError";
  }
}

type ProviderToolCall = {
  id?: unknown;
  type?: unknown;
  function?: { name?: unknown; arguments?: unknown };
};

type ProviderMessage = {
  content?: unknown;
  tool_calls?: ProviderToolCall[];
};

function providerFailure(message: string): AiInvestigationUnavailableError {
  return new AiInvestigationUnavailableError(`The AI provider could not complete the investigation: ${message}`);
}

async function callAimlApi(
  apiKey: string,
  body: Record<string, unknown>,
  environment: Record<string, string | undefined>,
): Promise<ProviderMessage> {
  const bridgeUrl = environment.AIMLAPI_BRIDGE_URL ?? "http://127.0.0.1:7332/v1/chat/completions";
  const bridgeToken = environment.AIMLAPI_BRIDGE_TOKEN ?? apiKey;
  let response: Response;
  try {
    response = await fetch(bridgeUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridgeToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw providerFailure("network request failed");
  }

  if (!response.ok) throw providerFailure(`request returned HTTP ${response.status}`);

  let payload: { choices?: Array<{ message?: ProviderMessage }> };
  try {
    payload = await response.json();
  } catch {
    throw providerFailure("response was not valid JSON");
  }

  const message = payload.choices?.[0]?.message;
  if (!message) throw providerFailure("response did not include a completion message");
  return message;
}

function aiInstructions(): string {
  return [
    "You are RecallOps' bounded incident investigator, historian, planner, and adversarial reviewer.",
    "First call read_incident_evidence. Use only that tool output; do not invent facts, evidence IDs, asset state, historical outcomes, or actions.",
    "Return all three supplied hypothesis IDs exactly once. Every hypothesis and every agent finding must cite at least one supplied evidence ID.",
    "Historical memory is a diagnostic lead, never authority. Preserve changed context and non-transferable assumptions.",
    "No execution, write, or approval is permitted. The reviewer must retain an independently verified precondition before a human approves the simulation.",
  ].join(" ");
}

function outputInstructions(): string {
  return [
    "Return JSON only, with no markdown. The object must have hypotheses, investigator, historian, planner, and reviewer.",
    "Each hypothesis must contain id, confidence (integer 0 to 100), verdict (Leading, Weakened, or Unlikely), summary, supportingEvidenceIds, contradictingEvidenceIds, unknowns, and reviewerFinding.",
    "Each of investigator, historian, planner, and reviewer must contain finding and evidenceIds.",
  ].join(" ");
}

async function generateStructuredInvestigation(
  apiKey: string,
  model: string,
  evidenceBundle: ReturnType<typeof readOnlyEvidenceBundle>,
  environment: Record<string, string | undefined>,
): Promise<InvestigationOutput> {
  const evidenceTool = {
    type: "function",
    function: {
      name: "read_incident_evidence",
      description: "Read the complete, immutable incident evidence bundle. This is the only available tool and it cannot write or execute an action.",
      parameters: { type: "object", properties: {}, additionalProperties: false },
    },
  };
  const prompt = "Investigate the active incident using the required read-only evidence tool.";
  const initialMessage = await callAimlApi(apiKey, {
    model,
    messages: [
      { role: "system", content: aiInstructions() },
      { role: "user", content: prompt },
    ],
    tools: [evidenceTool],
    tool_choice: { type: "function", function: { name: "read_incident_evidence" } },
  }, environment);
  const toolCalls = initialMessage.tool_calls;
  const toolCall = toolCalls?.[0];
  if (
    toolCalls?.length !== 1
    || toolCall?.type !== "function"
    || toolCall.function?.name !== "read_incident_evidence"
    || typeof toolCall.id !== "string"
  ) {
    throw new AiEvidenceValidationError("The model did not make the required read-only evidence call.");
  }

  const outputMessage = await callAimlApi(apiKey, {
    model,
    max_tokens: 1_200,
    messages: [
      { role: "system", content: aiInstructions() },
      { role: "user", content: prompt },
      {
        role: "assistant",
        content: typeof initialMessage.content === "string" ? initialMessage.content : null,
        tool_calls: [{
          id: toolCall.id,
          type: "function",
          function: {
            name: "read_incident_evidence",
            arguments: typeof toolCall.function.arguments === "string" ? toolCall.function.arguments : "{}",
          },
        }],
      },
      { role: "tool", tool_call_id: toolCall.id, content: JSON.stringify(evidenceBundle) },
      { role: "user", content: outputInstructions() },
    ],
    response_format: { type: "json_object" },
  }, environment);

  if (typeof outputMessage.content !== "string") {
    throw new AiEvidenceValidationError("The model did not return a structured investigation.");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(outputMessage.content);
  } catch {
    throw new AiEvidenceValidationError("The model returned invalid JSON.");
  }
  const validated = investigationOutputSchema.safeParse(parsed);
  if (!validated.success) {
    const issueSummary = validated.error.issues
      .slice(0, 4)
      .map((issue) => `${issue.path.join(".") || "output"}: ${issue.message}`)
      .join("; ");
    throw new AiEvidenceValidationError(`The model output did not match the investigation contract: ${issueSummary}`);
  }
  return validated.data;
}

function readOnlyEvidenceBundle(incident: Incident) {
  return {
    incident: {
      id: incident.id,
      title: incident.title,
      severity: incident.severity,
      assertionName: incident.assertionName,
      sourceAssetUrn: incident.sourceAssetUrn,
      policy: incident.policy,
      blastRadius: incident.blastRadius.map(({ id, name, type, status, evidenceId }) => ({
        id, name, type, status, evidenceId,
      })),
    },
    evidence: incident.evidence.map(({ id, kind, sourceSystem, observedAt, summary }) => ({
      id, kind, sourceSystem, observedAt, summary,
    })),
    historicalMemory: {
      match: incident.historicalMatch,
      matchDelta: incident.matchDelta,
      storedResolutionCount: incident.historicalMemoryCount,
    },
    existingHypothesisIds: incident.hypotheses.map((hypothesis) => hypothesis.id),
    safety: {
      actionsAreSimulationOnly: true,
      requiresHumanApproval: true,
      noWriteToolsAreAvailable: true,
    },
  };
}

function validateGrounding(output: InvestigationOutput, incident: Incident): void {
  const expectedHypotheses = new Set(incident.hypotheses.map((hypothesis) => hypothesis.id));
  const outputHypotheses = new Set(output.hypotheses.map((hypothesis) => hypothesis.id));
  if (outputHypotheses.size !== expectedHypotheses.size || [...expectedHypotheses].some((id) => !outputHypotheses.has(id))) {
    throw new AiEvidenceValidationError("The model did not return exactly the supplied competing hypotheses.");
  }

  const evidenceIds = new Set(incident.evidence.map((evidence) => evidence.id));
  for (const hypothesis of output.hypotheses) {
    const citedEvidenceIds = [...hypothesis.supportingEvidenceIds, ...hypothesis.contradictingEvidenceIds];
    if (citedEvidenceIds.length === 0) {
      throw new AiEvidenceValidationError(`The model did not cite evidence for hypothesis ${hypothesis.id}.`);
    }
    for (const evidenceId of citedEvidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new AiEvidenceValidationError(`The model cited an unknown evidence ID: ${evidenceId}.`);
      }
    }
  }

  for (const finding of [output.investigator, output.historian, output.planner, output.reviewer]) {
    for (const evidenceId of finding.evidenceIds) {
      if (!evidenceIds.has(evidenceId)) {
        throw new AiEvidenceValidationError(`The model cited an unknown evidence ID: ${evidenceId}.`);
      }
    }
  }
}

function applyAiInvestigation(
  incident: Incident,
  output: InvestigationOutput,
  model: string,
): Incident {
  validateGrounding(output, incident);
  const byId = new Map(output.hypotheses.map((hypothesis) => [hypothesis.id, hypothesis]));
  const findings = new Map([
    ["investigator", output.investigator],
    ["historian", output.historian],
    ["planner", output.planner],
    ["reviewer", output.reviewer],
  ]);
  const generatedAt = new Date().toISOString();

  return {
    ...incident,
    hypotheses: incident.hypotheses.map((hypothesis) => {
      const generated = byId.get(hypothesis.id);
      if (!generated) return hypothesis;
      return { ...hypothesis, ...generated };
    }),
    investigation: incident.investigation.map((step) => {
      const generated = findings.get(step.agent);
      return {
        ...step,
        finding: generated?.finding ?? step.finding,
        evidenceIds: generated?.evidenceIds ?? step.evidenceIds,
        status: step.agent === "reviewer" ? "challenged" : "grounded",
      };
    }),
    agentRun: {
      provider: "aimlapi",
      model,
      generatedAt,
      toolsUsed: ["read_incident_evidence"],
      evidenceValidated: true,
    },
    events: [
      ...incident.events,
      {
        id: `EVT-${String(incident.events.length + 1).padStart(3, "0")}`,
        sequence: incident.events.length + 1,
        occurredAt: new Intl.DateTimeFormat("en-SG", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date()),
        label: "AI investigation completed and evidence-validated",
        actor: "RecallOps AI agent",
        source: "agent",
      },
    ],
  };
}

export function isAiInvestigationConfigured(environment: Record<string, string | undefined> = process.env): boolean {
  return Boolean(environment.AIMLAPI_KEY);
}

export async function runAiInvestigation(
  incident: Incident,
  environment: Record<string, string | undefined> = process.env,
): Promise<Incident> {
  const apiKey = environment.AIMLAPI_KEY;
  if (!apiKey) throw new AiInvestigationUnavailableError();

  const configuredModel = environment.AIMLAPI_MODEL;
  const model = configuredModel && !unavailableModelIds.has(configuredModel)
    ? configuredModel
    : defaultModel;
  const evidenceBundle = readOnlyEvidenceBundle(incident);
  const output = await generateStructuredInvestigation(apiKey, model, evidenceBundle, environment);
  return applyAiInvestigation(incident, output, model);
}
