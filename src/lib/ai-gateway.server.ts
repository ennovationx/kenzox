import { createOpenAICompatible } from "@ai-sdk/openai-compatible";

/** Google AI Studio keys look like "AIza..." — those talk to Gemini directly. */
export function isGeminiApiKey(key: string) {
  return key.trim().startsWith("AIza");
}

export function createLovableAiGatewayProvider(lovableApiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://ai.gateway.lovable.dev/v1",
    headers: {
      "Lovable-API-Key": lovableApiKey,
      "X-Lovable-AIG-SDK": "vercel-ai-sdk",
    },
  });
}

function createGeminiProvider(apiKey: string) {
  return createOpenAICompatible({
    name: "lovable",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai",
    apiKey,
  });
}

/**
 * Build a model from whatever key the admin stored:
 * - a Gemini API key ("AIza...") calls Google directly (model id without the "google/" prefix)
 * - anything else is treated as a Lovable AI Gateway key
 */
export function createAiModel(apiKey: string, modelId: string) {
  const key = apiKey.trim();
  if (isGeminiApiKey(key)) {
    return createGeminiProvider(key)(modelId.replace(/^google\//, ""));
  }
  return createLovableAiGatewayProvider(key)(modelId);
}
