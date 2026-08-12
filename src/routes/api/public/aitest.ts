import { createFileRoute } from "@tanstack/react-router";
import { generateWithKey } from "@/lib/ai-gateway.server";
import { resolveAiKeys } from "@/lib/ai-keys.server";

export const Route = createFileRoute("/api/public/aitest")({
  server: {
    handlers: {
      GET: async () => {
        const keys = await resolveAiKeys();
        if (!keys.length) return Response.json({ ok: false, error: "no keys" });
        try {
          const text = await generateWithKey({
            apiKey: keys[0]!.api_key,
            modelId: "google/gemini-2.5-flash-lite",
            system: "Reply with one short word.",
            parts: [{ type: "text", text: "ping" }],
            maxOutputTokens: 200,
          });
          return Response.json({ ok: true, text: text.slice(0, 100) });
        } catch (e) {
          return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) });
        }
      },
    },
  },
});
