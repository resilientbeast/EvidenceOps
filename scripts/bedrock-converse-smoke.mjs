const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION;
const modelId = process.argv[2] ?? process.env.BEDROCK_REASONING_MODEL_ID;
if (!bearerToken || !region || !modelId) {
  throw new Error("AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, and a model ID are required.");
}

const endpoint = `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/converse`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Accept: "application/json",
    Authorization: `Bearer ${bearerToken}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    messages: [{ role: "user", content: [{ text: "Reply with exactly RECALL_OK." }] }],
    inferenceConfig: { maxTokens: 128, temperature: 0 },
  }),
});

const payload = await response.json();
if (!response.ok) {
  const message = typeof payload.message === "string"
    ? payload.message
    : typeof payload.error?.message === "string"
      ? payload.error.message
      : "Bedrock Converse invocation failed.";
  throw new Error(`Bedrock returned HTTP ${response.status}: ${message}`);
}

const text = payload.output?.message?.content?.find((block) => typeof block?.text === "string")?.text;
if (typeof text !== "string" || !text.includes("RECALL_OK")) {
  throw new Error(`Bedrock Converse returned no expected text (stop reason: ${payload.stopReason ?? "unknown"}).`);
}

console.log(`BEDROCK_CONVERSE_OK model=${modelId} region=${region} stop_reason=${payload.stopReason ?? "unknown"}`);
