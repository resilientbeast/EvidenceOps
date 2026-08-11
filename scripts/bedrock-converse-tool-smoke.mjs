const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION;
const modelId = process.argv[2] ?? process.env.BEDROCK_REASONING_MODEL_ID;
if (!bearerToken || !region || !modelId) {
  throw new Error("AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, and a model ID argument are required.");
}

const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
const toolConfig = {
  tools: [{
    toolSpec: {
      name: "read_incident_evidence",
      description: "Read an immutable incident evidence bundle.",
      inputSchema: { json: { type: "object", properties: {}, additionalProperties: false } },
    },
  }],
};

async function converse(body) {
  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${bearerToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok) {
    const message = typeof payload.message === "string" ? payload.message : "Bedrock Converse failed.";
    throw new Error(`Bedrock returned HTTP ${response.status}: ${message}`);
  }
  return payload;
}

const first = await converse({
  messages: [{ role: "user", content: [{ text: "Call read_incident_evidence before answering." }] }],
  inferenceConfig: { maxTokens: 256, temperature: 0 },
  toolConfig: { ...toolConfig, toolChoice: { tool: { name: "read_incident_evidence" } } },
});
const toolUse = first.output?.message?.content?.find((block) => block?.toolUse)?.toolUse;
if (first.stopReason !== "tool_use" || toolUse?.name !== "read_incident_evidence") {
  throw new Error(`Model did not make the required tool call (stop reason: ${first.stopReason ?? "unknown"}).`);
}

const second = await converse({
  messages: [
    { role: "user", content: [{ text: "Call read_incident_evidence before answering." }] },
    first.output.message,
    {
      role: "user",
      content: [
        { toolResult: { toolUseId: toolUse.toolUseId, content: [{ json: { evidenceIds: ["EVD-001"] } }] } },
        { text: "Return JSON only: {\"evidenceId\":\"EVD-001\"}." },
      ],
    },
  ],
  inferenceConfig: { maxTokens: 256, temperature: 0 },
  toolConfig,
});
const outputText = second.output?.message?.content
  ?.filter((block) => typeof block?.text === "string")
  .map((block) => block.text)
  .join("\n");
if (typeof outputText !== "string" || !outputText.includes("EVD-001")) {
  throw new Error(`Model did not return grounded output (stop reason: ${second.stopReason ?? "unknown"}).`);
}

console.log(`BEDROCK_CONVERSE_TOOL_OK model=${modelId} region=${region} tool=${toolUse.name} stop_reason=${second.stopReason ?? "unknown"}`);
