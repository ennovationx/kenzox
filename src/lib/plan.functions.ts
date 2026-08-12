import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateWithKey, type AiPart } from "./ai-gateway.server";
import { resolveAiKeys } from "./ai-keys.server";



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
    if (!keys.length)
      throw new Error(
        "No Gemini API key is configured. An admin must add one in the admin panel (AI API Keys).",
      );

    const parts: AiPart[] = [{ type: "text", text: data.prompt }];
    for (const img of data.images ?? []) parts.push({ type: "image", image: img });

    const memoryBlock = (data.memory ?? []).length
      ? `\n\nThings you remember about this user:\n- ${(data.memory ?? []).join("\n- ")}`
      : "";
    const filesBlock = data.currentFiles?.["index.html"]
      ? `\n\nThe project already has code. Plan changes on top of it, don't restart from scratch.`
      : "";

    let lastErr: unknown = null;
    for (const k of keys) {
      try {
        const text = await generateWithKey({
          apiKey: k.api_key,
          modelId: "google/gemini-2.5-flash",
          system: PLANNER_SYSTEM + memoryBlock + filesBlock,
          parts,
          history: data.history ?? [],
          maxOutputTokens: 4000,
        });
        return { text: text.trim() };
      } catch (err) {
        lastErr = err;
        console.error("[planWithAI]", err instanceof Error ? err.message : String(err));
      }
    }
    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    if (msg.includes("429")) throw new Error("Rate limit reached. Please try again in a moment.");
    if (msg.includes("402")) throw new Error("AI credits exhausted for this workspace.");
    throw new Error(`Planning failed: ${msg}`);

  });
