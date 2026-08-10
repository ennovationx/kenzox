import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { streamText, type ModelMessage } from "ai";
import { z } from "zod";
import { createAiModel } from "./ai-gateway.server";
import { resolveAiKeys, reportKeyExhausted } from "./ai-keys.server";


const SYSTEM = `You are Kenzo, a world-class AI web developer and product designer.
You author COMPLETE, production-quality, self-contained web apps as exactly three files: index.html, styles.css, script.js.

OUTPUT CONTRACT — follow EXACTLY, no JSON, no markdown fences:
<<<FILE:index.html>>>
...complete html...
<<<FILE:styles.css>>>
...complete css...
<<<FILE:script.js>>>
...complete js...
<<<SUMMARY>>>
One or two sentences describing what you built or changed.
<<<NAME>>>
A short 2-5 word project name (only when the user asked to rename the app/site, or when this is the first build).
<<<MEMORY>>>
One durable preference per line that you learned about this user (e.g. "prefers dark, minimal designs"). Omit this block entirely if nothing new.
<<<END>>>

- Emit the markers on their own lines, in that exact order. FILE and SUMMARY are required; NAME and MEMORY are optional.
- Write raw file contents between markers — never escape them, never wrap them in backticks.
- No commentary before the first marker or after <<<END>>>.
- Every file must be complete and runnable. Never emit placeholders, "..." elisions, or TODOs.

index.html
- Start with <!doctype html>. Include <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1">, a descriptive <title> and <meta name="description">.
- Link assets exactly as: <link rel="stylesheet" href="styles.css"> in <head> and <script src="script.js" defer></script> before </body>.
- Semantic HTML: header/nav/main/section/footer, one <h1>, labels tied to inputs, alt text, aria-labels on icon-only buttons.

styles.css
- Own the entire visual design here — no inline styles in the HTML.
- Define a token layer in :root (colors, radii, spacing, shadows, transitions) and support dark mode via [data-theme="dark"] or prefers-color-scheme.
- Modern layout with flexbox/grid, fluid typography with clamp(), generous whitespace, rounded corners, layered shadows, tasteful gradients, and hover/focus-visible states.
- Fully responsive: mobile-first, with breakpoints for tablet and desktop. Include subtle keyframe animations and honor prefers-reduced-motion.

script.js
- Vanilla ES6+ only, no frameworks, no build step, no CDN scripts. Wrap in an IIFE or use modules-free scoped code.
- Implement every interaction the UI implies: state, event handlers, validation, empty/loading/error states, keyboard support, and localStorage persistence when the app has data worth keeping.
- Guard DOM lookups and never throw on first load.

QUALITY BAR
- Distinctive, polished visual design — never a plain unstyled document.
- Real, plausible content instead of lorem ipsum.
- No external network calls except Google Fonts, which is allowed via a <link> in the head.
- Keep the code clean, commented where non-obvious, and free of dead code.
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
  images: z.array(z.string()).max(4).optional(),
  plan: z.string().max(8000).optional(),
  personality: z.string().optional(),
  verbosity: z.string().optional(),
  style: z.string().optional(),
  model: z.string().optional(),
});

const ALLOWED_MODELS = new Set([
  "google/gemini-3.6-flash",
  "google/gemini-3.5-flash",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-2.5-pro",
]);

const DEFAULT_MODEL = "google/gemini-2.5-flash-lite";

type Result = { html: string; css: string; js: string; summary: string; name?: string; memory: string[] };

function stripFences(s: string) {
  return s
    .replace(/^\s*```[a-z]*\s*\n?/i, "")
    .replace(/\n?```\s*$/i, "")
    .trim();
}

/** Parse the marker protocol; fall back to JSON, then to fenced code blocks. */
function parseResult(text: string): Result {
  const t = (text ?? "").replace(/\r\n/g, "\n");
  const STOP = "(?:FILE:|SUMMARY|NAME|MEMORY|END)";

  const grab = (name: string) => {
    const re = new RegExp(
      `<<<FILE:${name.replace(".", "\\.")}>>>\\n?([\\s\\S]*?)(?=\\n?<<<${STOP}|$)`,
      "i",
    );
    const m = t.match(re);
    return m ? stripFences(m[1]) : "";
  };

  const html = grab("index.html");
  const css = grab("styles.css");
  const js = grab("script.js");
  const sum = t.match(new RegExp(`<<<SUMMARY>>>\\n?([\\s\\S]*?)(?=\\n?<<<${STOP}|$)`, "i"));
  const nameM = t.match(new RegExp(`<<<NAME>>>\\n?([\\s\\S]*?)(?=\\n?<<<${STOP}|$)`, "i"));
  const memM = t.match(new RegExp(`<<<MEMORY>>>\\n?([\\s\\S]*?)(?=\\n?<<<${STOP}|$)`, "i"));

  const memory = (memM ? memM[1] : "")
    .split("\n")
    .map((l) => l.replace(/^[-*•]\s*/, "").trim())
    .filter((l) => l.length > 2 && l.length < 200)
    .slice(0, 5);

  if (html || css || js) {
    return {
      html,
      css,
      js,
      summary: (sum ? sum[1].trim() : "") || "Updated your app.",
      name: nameM ? nameM[1].trim().replace(/^["“]|["”]$/g, "").slice(0, 60) || undefined : undefined,
      memory,
    };
  }

  // Fallback 1: strict JSON payload
  try {
    let j = t.trim();
    if (j.startsWith("```")) j = stripFences(j);
    const first = j.indexOf("{");
    const last = j.lastIndexOf("}");
    if (first !== -1 && last !== -1) j = j.slice(first, last + 1);
    const parsed = JSON.parse(j);
    if (parsed && (parsed.html || parsed.css || parsed.js)) {
      return {
        html: String(parsed.html ?? ""),
        css: String(parsed.css ?? ""),
        js: String(parsed.js ?? ""),
        summary: String(parsed.summary ?? "Updated your app."),
        memory: [],
      };
    }
  } catch {
    /* keep going */
  }

  // Fallback 2: fenced code blocks by language
  const block = (langs: string[]) => {
    for (const l of langs) {
      const m = t.match(new RegExp("```" + l + "\\s*\\n([\\s\\S]*?)```", "i"));
      if (m) return m[1].trim();
    }
    return "";
  };
  const fHtml = block(["html"]);
  const fCss = block(["css"]);
  const fJs = block(["js", "javascript"]);
  if (fHtml || fCss || fJs) {
    return { html: fHtml, css: fCss, js: fJs, summary: "Updated your app.", memory: [] };
  }

  // Fallback 3: a bare HTML document
  const doc = t.match(/<!doctype html[\s\S]*<\/html>/i);
  if (doc) return { html: doc[0], css: "", js: "", summary: "Updated your app.", memory: [] };

  throw new Error("no-parse");
}

export const generateCode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => Input.parse(data))
  .handler(async ({ data, context }) => {
    const keys = await resolveAiKeys();
    if (!keys.length)
      throw new Error(
        "No Gemini API key is configured. An admin must add one in the admin panel (AI API Keys).",
      );


    const modelId = data.model && ALLOWED_MODELS.has(data.model) ? data.model : DEFAULT_MODEL;

    const personality = data.personality ?? "balanced";
    const verbosity = data.verbosity ?? "normal";
    const style = data.style ?? "modern";
    const cf = data.currentFiles ?? {};
    const hasCurrent = cf["index.html"] || cf["styles.css"] || cf["script.js"];

    // Per-user long-term memory
    const { data: memRows } = await context.supabase
      .from("user_memory")
      .select("fact")
      .order("created_at", { ascending: false })
      .limit(25);
    const memory = (memRows ?? []).map((r) => r.fact as string);

    const CONTRACT = `Respond using the marker format only:
<<<FILE:index.html>>> … <<<FILE:styles.css>>> … <<<FILE:script.js>>> … <<<SUMMARY>>> … (optional <<<NAME>>>, <<<MEMORY>>>) … <<<END>>>`;

    const planBlock = data.plan ? `\n\nApproved plan to implement:\n${data.plan}\n` : "";
    const imageBlock = (data.images ?? []).length
      ? `\n\nThe user attached ${data.images!.length} reference image(s). Study them closely and match the layout, colours, spacing and mood as faithfully as you can.`
      : "";

    const userText = hasCurrent
      ? `Modify the app below to satisfy the user's request. Preserve working parts; keep the same architecture unless a change is required. Always return ALL THREE files in full.

Current index.html:
${cf["index.html"] ?? ""}

Current styles.css:
${cf["styles.css"] ?? ""}

Current script.js:
${cf["script.js"] ?? ""}

User request:
${data.prompt}
${planBlock}${imageBlock}

${CONTRACT}`
      : `Build a fresh, complete app for this request.\n\n${data.prompt}\n${planBlock}${imageBlock}\n\n${CONTRACT}`;

    const parts: Array<{ type: "text"; text: string } | { type: "image"; image: string }> = [
      { type: "text", text: userText },
    ];
    for (const img of data.images ?? []) parts.push({ type: "image", image: img });
    const messages: ModelMessage[] = [{ role: "user", content: parts }];

    const memBlock = memory.length ? `\n\nRemembered about this user:\n- ${memory.join("\n- ")}` : "";
    const sys = `${SYSTEM}\n\nUser preferences: personality=${personality}, verbosity=${verbosity}, style=${style}.${memBlock}`;

    const lovableOpts: Record<string, unknown> = {};
    if (modelId.startsWith("openai/gpt-5.6")) {
      lovableOpts.reasoningEffort = "none";
    }
    const providerOptions = { lovable: lovableOpts } as unknown as Parameters<typeof streamText>[0]["providerOptions"];

    try {
      // Streamed on the wire (consumed server-side) so long generations keep
      // bytes flowing and never trip the platform's idle-request timeout.
      // Try each configured key in priority order; fall back when one is
      // rate-limited or out of credits, and tell the admins about it.
      let text = "";
      let lastErr: unknown = null;
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i]!;
        try {
          const result = streamText({
            model: createLovableAiGatewayProvider(k.api_key)(modelId),
            system: sys,
            messages,
            maxOutputTokens: 32000,
            providerOptions,
          });
          text = await result.text;
          lastErr = null;
          break;
        } catch (e) {
          lastErr = e;
          const m = e instanceof Error ? e.message : String(e);
          const exhausted = m.includes("402") || m.includes("429") || m.includes("401");
          if (exhausted) await reportKeyExhausted(k, m);
          if (!exhausted || i === keys.length - 1) throw e;
        }
      }
      if (lastErr) throw lastErr;

      if (!text || !text.trim()) throw new Error("Empty response from AI");
      try {
        const parsed = parseResult(text);

        const fresh = parsed.memory.filter((f) => !memory.includes(f));
        if (fresh.length) {
          await context.supabase
            .from("user_memory")
            .insert(fresh.map((fact) => ({ user_id: context.userId, fact })));
        }

        // Keep unchanged files instead of blanking them out.
        return {
          html: parsed.html || cf["index.html"] || "",
          css: parsed.css || cf["styles.css"] || "",
          js: parsed.js || cf["script.js"] || "",
          summary: parsed.summary,
          name: parsed.name ?? null,
          memory: fresh,
        };
      } catch (parseErr) {
        console.error("[generateCode] parse failed:", parseErr, "raw:", text.slice(0, 800));
        throw new Error("The AI response could not be read. Please try again.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error("[generateCode] failure:", msg);
      if (msg.includes("429")) throw new Error("Rate limit reached. Please try again in a moment.");
      if (msg.includes("402"))
        throw new Error("AI credits exhausted for this workspace. Add credits to continue.");
      throw new Error(`Generation failed: ${msg}`);
    }
  });
