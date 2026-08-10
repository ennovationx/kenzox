import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { resolveAiKeys, reportKeyExhausted, NO_KEYS_MESSAGE } from "./ai-keys.server";

const Input = z.object({
  audio: z.string().min(32), // base64 (no data: prefix)
  mime: z.string().default("audio/webm"),
});

const EXT: Record<string, string> = {
  "audio/webm": "webm",
  "audio/ogg": "ogg",
  "audio/mp4": "mp4",
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
};

function b64ToBytes(b64: string): Uint8Array<ArrayBuffer> {
  const bin = atob(b64);
  const buf = new ArrayBuffer(bin.length);
  const out = new Uint8Array(buf);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

export const transcribeAudio = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const keys = await resolveAiKeys();
    if (!keys.length) throw new Error(NO_KEYS_MESSAGE);

    const base = data.mime.split(";")[0];
    const ext = EXT[base] ?? "webm";
    const bytes = b64ToBytes(data.audio);
    if (bytes.byteLength < 1024) throw new Error("That recording was empty — please try again.");

    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      const form = new FormData();
      form.append("model", "openai/gpt-4o-mini-transcribe");
      form.append("file", new Blob([bytes], { type: base }), `recording.${ext}`);

      const res = await fetch("https://ai.gateway.lovable.dev/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${k.api_key}` },
        body: form,
      });

      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error("[transcribeAudio]", res.status, body);
        const exhausted = res.status === 401 || res.status === 402 || res.status === 429;
        if (exhausted) await reportKeyExhausted(k, `${res.status} ${body.slice(0, 200)}`);
        if (!exhausted || i === keys.length - 1) {
          if (res.status === 429) throw new Error("Rate limit reached — try again in a moment.");
          if (res.status === 402) throw new Error("AI credits exhausted for this key.");
          throw new Error("Could not transcribe that recording. Please try again.");
        }
        continue;
      }

      const json = (await res.json()) as { text?: string };
      const text = (json.text ?? "").trim();
      if (!text) throw new Error("No speech detected. Try recording again.");
      return { text };
    }
    throw new Error("Could not transcribe that recording. Please try again.");
  });
