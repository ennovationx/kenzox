import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { streamText, type ModelMessage } from "ai";

/** Google AI Studio keys ("AIza..." legacy, "AQ." new format) talk to Gemini directly. */
export function isGeminiApiKey(key: string) {
  const k = key.trim();
  return k.startsWith("AIza") || k.startsWith("AQ.");
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

/** Model ids Google's own API accepts. Anything else falls back to a safe default. */
const GOOGLE_MODELS = new Set([
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.5-pro",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
]);

export function googleModelId(modelId: string) {
  const id = modelId.replace(/^google\//, "");
  return GOOGLE_MODELS.has(id) ? id : "gemini-2.5-flash-lite";
}

export type AiPart = { type: "text"; text: string } | { type: "image"; image: string };

function toGeminiParts(parts: AiPart[]) {
  return parts.map((p) => {
    if (p.type === "text") return { text: p.text };
    const m = p.image.match(/^data:([^;]+);base64,(.*)$/);
    return m
      ? { inline_data: { mime_type: m[1], data: m[2] } }
      : { inline_data: { mime_type: "image/png", data: p.image } };
  });
}

/**
 * Run one generation with whatever key the admin stored.
 * - "AIza..." keys hit Google's native REST API (most reliable, real error messages)
 * - anything else goes through the Lovable AI Gateway via the AI SDK
 * Throws Error whose message contains the HTTP status so callers can rotate keys.
 */
export async function generateWithKey(opts: {
  apiKey: string;
  modelId: string;
  system: string;
  parts: AiPart[];
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  maxOutputTokens?: number;
}): Promise<string> {
  const key = opts.apiKey.trim();
  const max = opts.maxOutputTokens ?? 32000;

  if (isGeminiApiKey(key)) {
    const model = googleModelId(opts.modelId);
    const contents = [
      ...(opts.history ?? []).map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: toGeminiParts(opts.parts) },
    ];
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "x-goog-api-key": key },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: opts.system }] },
          contents,
          generationConfig: { maxOutputTokens: max, temperature: 0.8 },
        }),
      },
    );
    const raw = await res.text();
    if (!res.ok) {
      let detail = raw.slice(0, 300);
      try {
        detail = JSON.parse(raw)?.error?.message ?? detail;
      } catch {
        /* keep raw */
      }
      throw new Error(`${res.status} ${detail}`);
    }
    let json: any;
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error("Malformed response from Gemini");
    }
    const cand = json?.candidates?.[0];
    const text: string = (cand?.content?.parts ?? [])
      .map((p: any) => p?.text ?? "")
      .join("");
    if (!text.trim()) {
      const reason = cand?.finishReason ?? json?.promptFeedback?.blockReason ?? "unknown";
      throw new Error(`Gemini returned no text (finishReason: ${reason})`);
    }
    return text;
  }

  // Lovable AI Gateway path
  const provider = createLovableAiGatewayProvider(key);
  const messages: ModelMessage[] = [
    ...((opts.history ?? []).map((h) => ({ role: h.role, content: h.content })) as ModelMessage[]),
    { role: "user", content: opts.parts as never },
  ];
  const result = streamText({
    model: provider(opts.modelId),
    system: opts.system,
    messages,
    maxOutputTokens: max,
  });
  let text = "";
  for await (const part of result.fullStream) {
    if (part.type === "text-delta") text += part.text;
    else if (part.type === "error") {
      const e: any = part.error;
      const status = e?.statusCode ?? e?.status ?? "";
      throw new Error(`${status} ${e?.message ?? String(e)}`.trim());
    }
  }
  if (!text.trim()) throw new Error("Empty response from AI gateway");
  return text;
}
