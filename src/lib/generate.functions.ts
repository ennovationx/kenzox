import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateText } from "ai";
import { z } from "zod";
import { createLovableAiGatewayProvider } from "./ai-gateway.server";

const SYSTEM = `You are Kenzo, an expert AI web developer.
You produce COMPLETE, self-contained single-page web apps as three files: index.html, styles.css, script.js.

Rules:
- Respond ONLY with strict JSON matching: {"html":"...","css":"...","js":"...","summary":"..."}
- No markdown fences, no prose outside JSON.
- index.html must reference the css and js files via <link rel="stylesheet" href="styles.css"> and <script src="script.js" defer></script>. Include <!doctype html>, <meta charset="utf-8">, viewport meta.
- Beautiful, modern, responsive UI. Use CSS variables, gradients, subtle shadows. Prefer system-ui / Inter font.
- No external network/CDN dependencies except Google Fonts if useful.
- Vanilla JS only unless the user asks otherwise. No build step.
- Fully functional; no TODOs. Add interactivity when relevant.
`;

const Input = z.object({
  prompt: z.string().min(1).max(6000),
  currentFiles: z
    .object({
      "index.html": z.string().optional(),
      "styles.css": z.string().optional(),
      "script.js": z.string().optional(),
    })
    .optional(),
  personality: z.string().optional(),
  verbosity: z.string().optional(),
  style: z.string().optional(),
  model: z.string().optional(),
});

const ALLOWED_MODELS = new Set([
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash",
  "openai/gpt-5.4",
  "openai/gpt-5.4-mini",
  "openai/gpt-5-mini",
]);

function extractJson(text: string): { html: string; css: string; js: string; summary: string } {
  let t = text.trim();
  if (t.startsWith("```")) t = t.replace(/^```(?:json)?/i, "").replace(/```$/, "").trim();
  const first = t.indexOf("{");
  const last = t.lastIndexOf("}");
  if (first !== -1 && last !== -1) t = t.slice(first, last + 1);
  const parsed = JSON.parse(t);
  return {
    html: String(parsed.html ?? ""),
    css: String(parsed.css ?? ""),
    js: String(parsed.js ?? ""),
    summary: String(parsed.summary ?? "Updated your app."),
  };
}

export const generateCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data }) => {
    const key = process.env.LOVABLE_API_KEY;
    if (!key) throw new Error("Missing LOVABLE_API_KEY");

    const modelId = data.model && ALLOWED_MODELS.has(data.model) ? data.model : "openai/gpt-5.4";
    const gateway = createLovableAiGatewayProvider(key);
    const model = gateway(modelId);

    const personality = data.personality ?? "balanced";
    const verbosity = data.verbosity ?? "normal";
    const style = data.style ?? "modern";
    const cf = data.currentFiles ?? {};
    const hasCurrent = cf["index.html"] || cf["styles.css"] || cf["script.js"];

    const userMsg = hasCurrent
      ? `Modify the app below to satisfy the user's request. Preserve working parts; keep the same architecture unless a change is required.

Current index.html:
\`\`\`html
${cf["index.html"] ?? ""}
\`\`\`
Current styles.css:
\`\`\`css
${cf["styles.css"] ?? ""}
\`\`\`
Current script.js:
\`\`\`js
${cf["script.js"] ?? ""}
\`\`\`

User request:
${data.prompt}`
      : `Build a fresh app for this request:\n\n${data.prompt}`;

    const sys = `${SYSTEM}\n\nUser preferences: personality=${personality}, verbosity=${verbosity}, style=${style}.`;

    try {
      const { text } = await generateText({
        model,
        messages: [
          { role: "system", content: sys },
          { role: "user", content: userMsg },
        ],
        providerOptions: modelId.startsWith("openai/gpt-5.6")
          ? { lovable: { reasoningEffort: "none" } }
          : undefined,
      });
      return extractJson(text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes("429")) throw new Error("Rate limit reached. Please try again in a moment.");
      if (msg.includes("402"))
        throw new Error("AI credits exhausted for this workspace. Add credits to continue.");
      throw new Error(`Generation failed: ${msg}`);
    }
  });
