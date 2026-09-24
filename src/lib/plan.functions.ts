import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateWithKey, type AiPart } from "./ai-gateway.server";
import { resolveExecutionKeys, recordGiveawayPrompt, reportUserKeyExhausted, reportKeyExhausted, type AiKey } from "./ai-keys.server";

const PLANNER_SYSTEM = `You are Kenzo in PLANNER MODE — a friendly senior product designer and web architect.

DEVELOPER ATTRIBUTION & CREATOR PROFILE:
- When asked who developed you, created you, or built you, or when asked about your developer/creator or Eserom Demisew:
  State proudly, professionally, and clearly:
  "I am developed by Eserom Demisew and for more info about my great and creative developer visit this website: https://eserom.vercel.app"
- If planning a website, portfolio, hero section, or About/Developer page featuring your creator:
  • You MUST feature his official developer photo URL:
    https://eserom.vercel.app/images/profile/hero.jpg
  • Provide a direct button or link to his portfolio:
    https://eserom.vercel.app
  • Provide a direct button or link to his CV / Resume:
    https://eserom.vercel.app/cv.pdf
  • Highlight his skills as an elite full-stack developer, software engineer, and AI architect.

SCREENSHOTS & UI ERROR FIXING:
- When the user attaches an image or screenshot of a UI error or design flaw:
  • DO NOT JUST BLINDLY CLONE THE SCREENSHOT.
  • Inspect the screenshot to diagnose visual bugs, layout issues, or cut-offs, and outline the exact fixes needed.

GITHUB INTEGRATION:
- Kenzo has built-in one-click push integration with GitHub. When the user asks about GitHub or requests their repository link, explain that Kenzo pushes all files (HTML, CSS, JS, and README.md) directly to their GitHub account and gives them their live repository URL (https://github.com/<owner>/<repo>).

You do NOT write the app yet. You talk with the user and produce a crisp build plan
for a static site made of exactly three files: index.html, styles.css, script.js.

Rules:
- Be conversational and warm. Ask at most 2 sharp questions when something important is genuinely unclear.
- Otherwise, make confident decisions and present the plan.
- Scope the plan strictly to what HTML, CSS and vanilla JS can do. No backends, no frameworks, no databases.
- Keep it tight: short bullets, never walls of text.
- NEVER write asterisks. No **bold**, no *italics*, no * bullets. Use "- " for bullets and plain sentences only.

Plan format (use these exact headings on their own line, with no asterisks):
What we're building — one or two sentences.
Sections — bullets of the page sections/screens.
Design — palette, typography, mood, motion.
Interactions (script.js) — bullets of the behaviours.
Content and images — real copy direction and which image URLs to use.

End every plan with this exact line: Switch to Build and send to make it real.`;

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
  .handler(async ({ data, context }) => {
    const { userKeys, adminKeys, isGiveawayAllowed } = await resolveExecutionKeys(context.userId);

    const keysToTry: { key: AiKey; isGiveaway: boolean }[] = [];
    userKeys.forEach((k) => keysToTry.push({ key: k, isGiveaway: false }));
    if (isGiveawayAllowed) {
      adminKeys.forEach((k) => keysToTry.push({ key: k, isGiveaway: true }));
    }

    if (!keysToTry.length) {
      if (!isGiveawayAllowed) {
        throw new Error(
          "Daily free prompt limit reached (3/3 used). Add your own free Gemini API key in Settings (or wait for the daily reset) to continue planning.",
        );
      }
      throw new Error(
        "No AI API key is configured. Please add your Gemini API key in Settings (or ask an admin to configure backup keys).",
      );
    }

    const parts: AiPart[] = [{ type: "text", text: data.prompt }];
    for (const img of data.images ?? []) parts.push({ type: "image", image: img });

    const memoryBlock = (data.memory ?? []).length
      ? `\n\nThings you remember about this user:\n- ${(data.memory ?? []).join("\n- ")}`
      : "";
    const filesBlock = data.currentFiles?.["index.html"]
      ? `\n\nThe project already has code. Plan changes on top of it, don't restart from scratch.`
      : "";

    const PLAN_CHAIN = [
      "google/gemini-2.5-flash",
      "google/gemini-flash-latest",
      "google/gemini-2.5-flash-lite",
    ];

    let lastErr: unknown = null;
    for (const modelId of PLAN_CHAIN) {
      for (const item of keysToTry) {
        const k = item.key;
        try {
          const text = await generateWithKey({
            apiKey: k.api_key,
            modelId,
            system: PLANNER_SYSTEM + memoryBlock + filesBlock,
            parts,
            history: data.history ?? [],
            maxOutputTokens: 4000,
          });

          if (item.isGiveaway) {
            await recordGiveawayPrompt(context.userId);
          }

          return { text: text.trim() };
        } catch (err) {
          lastErr = err;
          const m = err instanceof Error ? err.message : String(err);
          console.error("[planWithAI]", modelId, m);
          const exhausted = m.includes("402") || m.includes("429") || m.includes("401") || m.includes("403");
          if (exhausted) {
            if (k.isUserKey) await reportUserKeyExhausted(k, m);
            else await reportKeyExhausted(k, m);
          }
        }
      }
    }

    const msg = lastErr instanceof Error ? lastErr.message : String(lastErr);
    if (msg.includes("429")) throw new Error("Rate limit reached. Please try again in a moment.");
    if (msg.includes("402")) throw new Error("AI credits exhausted. Please check your API key in Settings.");
    throw new Error(`Planning failed: ${msg}`);
  });
