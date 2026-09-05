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
  "gemini-3.1-pro-preview",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.1-flash-lite",
  "gemini-2.5-flash",
  "gemini-2.5-flash-lite",
  "gemini-2.0-flash",
  "gemini-2.0-flash-lite",
  "gemini-flash-latest",
  "gemini-flash-lite-latest",
]);

/** Models Google retired for new keys → their current replacement. */
const RETIRED: Record<string, string> = {
  "gemini-2.5-pro": "gemini-3.1-pro-preview",
  "gemini-1.5-flash": "gemini-flash-latest",
  "gemini-1.5-pro": "gemini-3.1-pro-preview",
  "gemini-3.5-flash": "gemini-flash-latest",
};

export function googleModelId(modelId: string) {
  const raw = modelId.replace(/^google\//, "");
  const id = RETIRED[raw] ?? raw;
  return GOOGLE_MODELS.has(id) ? id : "gemini-flash-latest";
}

/** Google 404s name their replacement — pull it out so we can retry once. */
function suggestedModel(message: string) {
  const m = message.match(/use\s+models\/([a-z0-9.\-]+)/i);
  return m ? m[1] : null;
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
    const contents = [
      ...(opts.history ?? []).map((h) => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }],
      })),
      { role: "user", parts: toGeminiParts(opts.parts) },
    ];

    const call = async (model: string) => {
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
        const err = new Error(`${res.status} ${detail}`);
        (err as any).status = res.status;
        throw err;
      }
      let json: any;
      try {
        json = JSON.parse(raw);
      } catch {
        throw new Error("Malformed response from Gemini");
      }
      const cand = json?.candidates?.[0];
      const text: string = (cand?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("");
      if (!text.trim()) {
        const reason = cand?.finishReason ?? json?.promptFeedback?.blockReason ?? "unknown";
        throw new Error(`Gemini returned no text (finishReason: ${reason})`);
      }
      return text;
    };

    const first = googleModelId(opts.modelId);
    try {
      return await call(first);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Retired / unavailable model → retry once with Google's own suggestion,
      // then with the always-available flash alias.
      if (msg.startsWith("404")) {
        const next = suggestedModel(msg);
        for (const alt of [next, "gemini-flash-latest"]) {
          if (!alt || alt === first) continue;
          try {
            return await call(alt);
          } catch {
            /* try the next candidate */
          }
        }
      }
      throw e;
    }
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
