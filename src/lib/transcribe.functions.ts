import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveExecutionKeys } from "./ai-keys.server";

const Input = z.object({
  audio: z.string().min(32), // base64 (no data: prefix)
  mime: z.string().default("audio/wav"),
});

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    // 1. Gather all potential Gemini keys to try (user BYOK, giveaway keys, environment)
    const { userKeys, adminKeys, isGiveawayAllowed } = await resolveExecutionKeys(context.userId);
    const candidateKeys: string[] = [];

    // User's own keys first
    userKeys.forEach((k) => {
      if (k.api_key && !candidateKeys.includes(k.api_key)) candidateKeys.push(k.api_key);
    });

    // Admin giveaway keys
    if (isGiveawayAllowed) {
      adminKeys.forEach((k) => {
        if (k.api_key && !candidateKeys.includes(k.api_key)) candidateKeys.push(k.api_key);
      });
    }

    // Environment GEMINI_API_KEY fallback
    if (process.env.GEMINI_API_KEY && !candidateKeys.includes(process.env.GEMINI_API_KEY)) {
      candidateKeys.push(process.env.GEMINI_API_KEY);
    }

    const baseMime = (data.mime ? data.mime.split(";")[0].trim() : "") || "audio/wav";
    const cleanAudio = data.audio.replace(/\s+/g, "");

    const modelsToTry = [
      "gemini-3.5-flash-lite",
      "gemini-flash-latest",
      "gemini-3.7-flash",
      "gemini-2.5-flash",
      "gemini-2.0-flash",
    ];

    let lastError: unknown = null;

    // Try Gemini audio transcription first
    for (const key of candidateKeys) {
      for (const model of modelsToTry) {
        try {
          const makeRequest = async (targetModel: string) => {
            return await fetch(
              `https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent`,
              {
                method: "POST",
                headers: {
                  "content-type": "application/json",
                  "x-goog-api-key": key.trim(),
                },
                body: JSON.stringify({
                  contents: [
                    {
                      role: "user",
                      parts: [
                        {
                          inline_data: {
                            mime_type: baseMime,
                            data: cleanAudio,
                          },
                        },
                        {
                          text: "Transcribe this voice audio recording verbatim into text with accurate spelling and punctuation. Return ONLY the transcribed words. Do not add any preface, quotes, timestamps, or markdown.",
                        },
                      ],
                    },
                  ],
                  generationConfig: {
                    temperature: 0.1,
                    maxOutputTokens: 2048,
                  },
                }),
              }
            );
          };

          let res = await makeRequest(model);

          if (!res.ok) {
            const raw = await res.text();
            lastError = new Error(`Gemini ${res.status}: ${raw.slice(0, 200)}`);
            // If Google 404 suggests a newer model (e.g. gemini-3.5-flash-lite), try it immediately
            const suggested = raw.match(/use\s+models\/([a-z0-9.\-]+)/i)?.[1];
            if (suggested && suggested !== model) {
              const retryRes = await makeRequest(suggested);
              if (retryRes.ok) {
                res = retryRes;
              } else {
                continue;
              }
            } else {
              continue;
            }
          }

          const json = await res.json();
          const cand = json?.candidates?.[0];
          const text = (cand?.content?.parts ?? []).map((p: any) => p?.text ?? "").join("").trim();
          if (text) {
            return { text };
          }
        } catch (err) {
          lastError = err;
        }
      }
    }

    // 2. Fallback to Lovable AI gateway if LOVABLE_API_KEY exists
    const lovableKey = process.env.LOVABLE_API_KEY;
    if (lovableKey) {
      try {
        const bin = atob(data.audio);
        const buf = new ArrayBuffer(bin.length);
        const bytes = new Uint8Array(buf);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);

        const form = new FormData();
        form.append("model", "openai/gpt-4o-mini-transcribe");
        form.append("file", new Blob([bytes], { type: baseMime }), "recording.wav");

        const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
          method: "POST",
          headers: { Authorization: `Bearer ${lovableKey}` },
          body: form,
        });

        if (res.ok) {
          const json = (await res.json()) as { text?: string };
          const text = (json.text ?? "").trim();
          if (text) return { text };
        }
      } catch (lErr) {
        lastError = lErr;
      }
    }

    if (!candidateKeys.length && !lovableKey) {
      throw new Error(
        "No AI API key found for voice transcription. Please configure your free Gemini API key in Settings → API Keys to enable speech-to-text."
      );
    }

    throw new Error(
      lastError instanceof Error
        ? `Transcription failed: ${lastError.message}`
        : "Could not transcribe audio. Please speak clearly and try again."
    );
  });
