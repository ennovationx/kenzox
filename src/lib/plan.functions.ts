import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";
import { resolveAiKeys, reportKeyExhausted, NO_KEYS_MESSAGE } from "./ai-keys.server";

const PLANNER_SYSTEM = `You are Kenzo in PLANNER MODE — a friendly senior product designer and web architect.

You do NOT write the app yet. You talk with the user and produce a crisp build plan
for a static site made of exactly three files: index.html, styles.css, script.js.

Rules:
- Be conversational and warm. Ask at most 2 sharp questions when something important is genuinely unclear.
- Otherwise, make confident decisions and present the plan.
- Scope the plan strictly to what HTML, CSS and vanilla JS can do. No backends, no frameworks, no databases.
- Keep it tight: markdown with short bullets, never walls of text.

Plan format:
**What we're building** — one or two sentences.
**Sections** — bullets of the page sections/screens.
**Design** — palette, typography, mood, motion.
**Interactions (script.js)** — bullets of the behaviours.
**Content & images** — real copy direction and which image URLs to use.

End every plan with: _Switch to Build and send to make it real._`;

const Input = z.object({
  prompt: z.string().min(1).max(6000),
  history: z
    .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string() }))
    .max(30)
    .optional(),
  images: z.array(z.string()).max(4).optional(),
  memory: z.array(z.string()).max(30).optional(),
  currentFiles: z.record(z.string(), z.string()).optional(),
});

export const planWithAI = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const keys = await resolveAiKeys();
    if (!keys.length) throw new Error(NO_KEYS_MESSAGE);


    const messages: ModelMessage[] = [];
    for (const h of data.history ?? []) messages.push({ role: h.role, content: h.content });

    const parts: Array<
      { type: "text"; text: string } | { type: "image"; image: string }
    > = [{ type: "text", text: data.prompt }];
    for (const img of data.images ?? []) parts.push({ type: "image", image: img });
    messages.push({ role: "user", content: parts });

    const memoryBlock = (data.memory ?? []).length
      ? `\n\nThings you remember about this user:\n- ${(data.memory ?? []).join("\n- ")}`
      : "";
    const filesBlock = data.currentFiles?.["index.html"]
      ? `\n\nThe project already has code. Plan changes on top of it, don't restart from scratch.`
      : "";

    let lastErr: unknown = null;
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i]!;
      try {
        const result = streamText({
          model: createLovableAiGatewayProvider(k.api_key)("google/gemini-3.6-flash"),
          system: PLANNER_SYSTEM + memoryBlock + filesBlock,
          messages,
          maxOutputTokens: 4000,
        });
        const text = await result.text;
        if (!text.trim()) throw new Error("Empty response from AI");
        return { text: text.trim() };
      } catch (err) {
        lastErr = err;
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[planWithAI]", msg);
        const exhausted = msg.includes("401") || msg.includes("402") || msg.includes("429");
        if (exhausted) await reportKeyExhausted(k, msg);
        if (!exhausted || i === keys.length - 1) {
          if (msg.includes("429")) throw new Error("Rate limit reached. Please try again in a moment.");
          if (msg.includes("402")) throw new Error("AI credits exhausted for this key.");
          throw new Error(`Planning failed: ${msg}`);
        }
      }
    }
    throw new Error(lastErr instanceof Error ? lastErr.message : "Planning failed.");
  });
