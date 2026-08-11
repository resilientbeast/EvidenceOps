const apiKey = process.env.AWS_BEARER_TOKEN_BEDROCK;
const region = process.env.AWS_REGION;
if (!apiKey || !region) throw new Error("AWS_BEARER_TOKEN_BEDROCK and AWS_REGION are required.");

const response = await fetch(`https://bedrock-mantle.${region}.api.aws/v1/models`, {
  headers: { Accept: "application/json", "x-api-key": apiKey },
});
const payload = await response.json();
if (!response.ok) {
  const message = typeof payload.error?.message === "string"
    ? payload.error.message
    : typeof payload.message === "string"
      ? payload.message
      : "Bedrock model listing failed.";
  throw new Error(`Bedrock returned HTTP ${response.status}: ${message}`);
}

const models = Array.isArray(payload.data) ? payload.data : [];
const anthropicModels = models
  .filter((model) => typeof model?.id === "string" && model.id.startsWith("anthropic."))
  .sort((left, right) => left.id.localeCompare(right.id));
if (!anthropicModels.length) throw new Error("Bedrock returned no Anthropic model records for this key.");

for (const model of anthropicModels) {
  console.log(`BEDROCK_MODEL status=${model.status ?? "unknown"} id=${model.id}`);
}
