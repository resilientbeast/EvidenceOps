import { z } from "zod";
import type { ClusterHealthEvidenceProvider } from "@/src/adapters/cluster-health/ccloud-cluster-health";
import type { TableStatisticsEvidenceProvider } from "@/src/adapters/table-statistics/cockroach-table-statistics";
import type { Incident } from "@/src/domain/incident";

const defaultMaxTokens = 4_096;

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
  constructor(message = "AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, and BEDROCK_REASONING_MODEL_ID must be configured before running an AI investigation.") {
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

type ConverseContentBlock = {
  text?: string;
  toolUse?: { toolUseId?: string; name?: string; input?: unknown };
  [key: string]: unknown;
};

type ConverseMessage = {
  role: "user" | "assistant";
  content: ConverseContentBlock[];
};

type ConverseResponse = {
  output?: { message?: ConverseMessage };
  stopReason?: string;
};

function providerFailure(message: string): AiInvestigationUnavailableError {
  return new AiInvestigationUnavailableError(`The AI provider could not complete the investigation: ${message}`);
}

async function callBedrockConverse(
  bearerToken: string,
  model: string,
  body: Record<string, unknown>,
  environment: Record<string, string | undefined>,
): Promise<ConverseResponse> {
  const region = environment.AWS_REGION;
  if (!region) throw new AiInvestigationUnavailableError();
  const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(model)}/converse`;
  let response: Response;
  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    throw providerFailure("network request failed");
  }

  let payload: ConverseResponse & { message?: unknown };
  try {
    payload = await response.json();
  } catch {
    throw providerFailure("response was not valid JSON");
  }
  if (!response.ok) {
    const providerMessage = typeof payload.message === "string"
      ? payload.message
      : `request returned HTTP ${response.status}`;
    throw providerFailure(providerMessage);
  }
  if (!payload.output?.message || !Array.isArray(payload.output.message.content)) {
    throw providerFailure("response did not include a Bedrock Converse message");
  }
  return payload;
}

function aiInstructions(): string {
  return [
    "You are EvidenceOps' bounded incident investigator, historian, planner, and adversarial reviewer.",
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

function parseJsonObject(outputText: string): unknown {
  const candidates = [outputText];
  const fenced = outputText.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  if (fenced) candidates.push(fenced.trim());
  const strayLeadingBrace = outputText.match(/^\s*{\s*({[\s\S]*})\s*$/)?.[1];
  if (strayLeadingBrace) candidates.push(strayLeadingBrace);
  const firstBrace = outputText.indexOf("{");
  const lastBrace = outputText.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(outputText.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
    } catch {
      // Try the next bounded representation; Zod still validates the result.
    }
  }
  throw new AiEvidenceValidationError("The model returned invalid JSON.");
}

async function generateStructuredInvestigation(
  bearerToken: string,
  model: string,
  evidenceBundle: ReturnType<typeof readOnlyEvidenceBundle>,
  environment: Record<string, string | undefined>,
): Promise<InvestigationOutput> {
  const evidenceTool = {
    toolSpec: {
      name: "read_incident_evidence",
      description: "Read the complete, immutable incident evidence bundle. This is the only available tool and it cannot write or execute an action.",
      inputSchema: { json: { type: "object", properties: {}, additionalProperties: false } },
    },
  };
  const prompt = "Investigate the active incident using the required read-only evidence tool.";
  const userMessage: ConverseMessage = {
    role: "user",
    content: [{ text: prompt }],
  };
  const initialMessage = await callBedrockConverse(bearerToken, model, {
    system: [{ text: aiInstructions() }],
    messages: [
      userMessage,
    ],
    inferenceConfig: { maxTokens: 256, temperature: 0 },
    toolConfig: {
      tools: [evidenceTool],
      toolChoice: { tool: { name: "read_incident_evidence" } },
    },
  }, environment);
  const assistantMessage = initialMessage.output?.message;
  const toolCalls = assistantMessage?.content
    .map((block) => block.toolUse)
    .filter((toolUse): toolUse is NonNullable<typeof toolUse> => Boolean(toolUse)) ?? [];
  const toolCall = toolCalls[0];
  const toolInput = toolCall?.input;
  if (
    !assistantMessage
    || !toolCall
    || initialMessage.stopReason !== "tool_use"
    || toolCalls.length !== 1
    || toolCall.name !== "read_incident_evidence"
    || typeof toolCall.toolUseId !== "string"
    || !toolInput
    || typeof toolInput !== "object"
    || Array.isArray(toolInput)
    || Object.keys(toolInput).length !== 0
  ) {
    throw new AiEvidenceValidationError("The model did not make the required read-only evidence call.");
  }

  const configuredMaxTokens = Number.parseInt(environment.BEDROCK_REASONING_MAX_TOKENS ?? "", 10);
  const maxTokens = Number.isInteger(configuredMaxTokens) && configuredMaxTokens > 0
    ? Math.min(configuredMaxTokens, 8_192)
    : defaultMaxTokens;
  const outputMessage = await callBedrockConverse(bearerToken, model, {
    system: [{ text: aiInstructions() }],
    messages: [
      userMessage,
      assistantMessage,
      {
        role: "user",
        content: [
          {
            toolResult: {
              toolUseId: toolCall.toolUseId,
              content: [{ json: evidenceBundle }],
              status: "success",
            },
          },
          { text: outputInstructions() },
        ],
      },
    ],
    inferenceConfig: { maxTokens, temperature: 0 },
    toolConfig: { tools: [evidenceTool] },
    additionalModelRequestFields: { response_format: { type: "json_object" } },
  }, environment);

  const outputAssistant = outputMessage.output?.message;
  if (!outputAssistant) {
    throw new AiEvidenceValidationError("The model did not return a structured investigation.");
  }
  const outputText = outputAssistant.content
    .filter((block) => typeof block.text === "string")
    .map((block) => block.text)
    .join("\n")
    .trim();
  if (!outputText) {
    throw new AiEvidenceValidationError("The model did not return a structured investigation.");
  }

  const parsed = parseJsonObject(outputText);
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
      provider: "bedrock",
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
        actor: "EvidenceOps AI agent",
        source: "agent",
      },
    ],
  };
}

export function isAiInvestigationConfigured(environment: Record<string, string | undefined> = process.env): boolean {
  return Boolean(
    environment.AWS_BEARER_TOKEN_BEDROCK
    && environment.AWS_REGION
    && environment.BEDROCK_REASONING_MODEL_ID,
  );
}

export async function runAiInvestigation(
  incident: Incident,
  environment: Record<string, string | undefined> = process.env,
  clusterHealth: ClusterHealthEvidenceProvider,
  tableStatistics: TableStatisticsEvidenceProvider,
): Promise<Incident> {
  const bearerToken = environment.AWS_BEARER_TOKEN_BEDROCK;
  const model = environment.BEDROCK_REASONING_MODEL_ID;
  if (!bearerToken || !environment.AWS_REGION || !model) throw new AiInvestigationUnavailableError();

  const [clusterHealthEvidence, tableStatisticsEvidence] = await Promise.all([
    clusterHealth.observe(),
    tableStatistics.observe(),
  ]);
  const incidentWithClusterHealth: Incident = {
    ...incident,
    evidence: [
      ...incident.evidence.filter((evidence) => (
        evidence.id !== clusterHealthEvidence.id && evidence.id !== tableStatisticsEvidence.id
      )),
      clusterHealthEvidence,
      tableStatisticsEvidence,
    ],
  };
  const evidenceBundle = readOnlyEvidenceBundle(incidentWithClusterHealth);
  const output = await generateStructuredInvestigation(bearerToken, model, evidenceBundle, environment);
  return applyAiInvestigation(incidentWithClusterHealth, output, model);
}
