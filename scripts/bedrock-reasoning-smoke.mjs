const bearerToken = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION;
const useMantle = process.argv.includes("--mantle");
const explicitModelId = process.argv.slice(2).find((argument) => !argument.startsWith("--"));
const modelId = explicitModelId ?? process.env.BEDROCK_REASONING_MODEL_ID;

if (!bearerToken || !region || !modelId) {
  throw new Error("AWS_BEARER_TOKEN_BEDROCK, AWS_REGION, and BEDROCK_REASONING_MODEL_ID are required.");
}

const endpoint = useMantle
  ? `https://bedrock-mantle.${region}.api.aws/anthropic/v1/messages`
  : `https://bedrock-runtime.${region}.amazonaws.com/model/${encodeURIComponent(modelId)}/invoke`;
const response = await fetch(endpoint, {
  method: "POST",
  headers: {
    Accept: "application/json",
    ...(useMantle ? { "x-api-key": bearerToken } : { Authorization: `Bearer ${bearerToken}` }),
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    ...(useMantle ? { model: modelId } : { anthropic_version: "bedrock-2023-05-31" }),
    max_tokens: 24,
    temperature: 0,
    messages: [{ role: "user", content: [{ type: "text", text: "Reply with exactly RECALL_OK." }] }],
  }),
});

const responseText = await response.text();
let payload;
try {
  payload = JSON.parse(responseText);
} catch {
  throw new Error(`Bedrock returned non-JSON with HTTP ${response.status}.`);
}

if (!response.ok) {
  const providerMessage = typeof payload.message === "string"
    ? payload.message
    : typeof payload.error?.message === "string"
      ? payload.error.message
      : typeof payload.error === "string"
        ? payload.error
        : `Bedrock invocation failed (${payload.type ?? "unknown error type"}).`;
  throw new Error(`Bedrock returned HTTP ${response.status}: ${providerMessage}`);
}

const textBlock = Array.isArray(payload.content)
  ? payload.content.find((block) => block?.type === "text" && typeof block.text === "string")
  : undefined;
if (!textBlock || !textBlock.text.includes("RECALL_OK")) {
  throw new Error("Bedrock returned an unexpected Anthropic response payload.");
}

console.log(`BEDROCK_REASONING_OK endpoint=${useMantle ? "bedrock-mantle" : "bedrock-runtime"} model=${modelId} region=${region} stop_reason=${payload.stop_reason ?? "unknown"}`);
