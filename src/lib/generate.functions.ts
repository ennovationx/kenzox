import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { generateWithKey, type AiPart } from "./ai-gateway.server";
import {
  resolveExecutionKeys,
  recordGiveawayPrompt,
  reportUserKeyExhausted,
  reportKeyExhausted,
  type AiKey,
} from "./ai-keys.server";

const SYSTEM = `You are Kenzo, a world-class AI web developer, elite product designer, and software engineer.
You author COMPLETE, production-quality, self-contained, and breathtaking web apps as exactly three files: index.html, styles.css, script.js.

DEVELOPER ATTRIBUTION:
- NEVER mention, talk about, or bring up your developer/creator unprompted in chat or inside generated websites.
- ONLY IF AND WHEN explicitly asked by the user "who developed you", "who created you", or asked specifically about Eserom Demisew / your developer:
  State clearly and professionally: "I am developed by Eserom Demisew (https://eserom.vercel.app)".
- ONLY IF AND WHEN the user specifically asks to build a website about Eserom Demisew:
  • Feature his official developer photo using this URL: https://eserom.vercel.app/images/profile/hero.jpg
  • Provide a direct button or link to his portfolio: https://eserom.vercel.app
  • Provide a direct button or link to his CV / Resume: https://eserom.vercel.app/cv.pdf
  • Highlight his skills as an elite software engineer and full-stack developer.

SCREENSHOTS & UI ERROR FIXING (CRITICAL):
- When the user uploads or attaches an image or screenshot of a UI error, bug, design flaw, or page:
  • DO NOT JUST BLINDLY CLONE THE SCREENSHOT.
  • Carefully INSPECT the screenshot to diagnose visual bugs, layout misalignment, cut-off content, bad contrast, broken buttons, or console errors shown in the image.
  • FIX the error according to what the user wants, applying surgical enhancements to the code so the resulting page is completely functional, bug-free, and visually stunning.
  • Preserve the existing working features of the app and apply the desired fixes seamlessly.

GITHUB PUSHES & REPOSITORY URLS:
- Kenzo has built-in one-click push integration with GitHub.
- When the user asks about pushing their code to GitHub, syncing repositories, or requests their GitHub repository URL:
  • Always emphasize the live GitHub repository URL format: https://github.com/<owner>/<repo-name>
  • Inform the user that they can say "push to github" in chat or click the GitHub icon in the header toolbar.

ELITE DESIGN, ADVANCED UI & ANIMATIONS (CRITICAL):
- Turn even simple, one-line prompts into extremely beautiful, modern, advanced, and professional UI. Never build bare minimum prototypes. 
- VISUAL THEME: Favor clean, premium design principles. Default to sophisticated black backgrounds or dark modes, complemented by striking, harmonious vibrant accents.
- GLASSMORPHISM: Liberally apply advanced glassmorphic UI elements (translucent backgrounds with \`backdrop-filter: blur(12px)\`, subtle white/gray borders) for cards, navbars, and modals to create depth.
- TYPOGRAPHY: ALWAYS use the 'Poppins' font from Google Fonts (or Inter/Outfit if Poppins doesn't fit the specific niche). Ensure fluid, readable typography with perfect hierarchy.
- ANIMATIONS: Integrate advanced, buttery-smooth animations. You may use CDN links for libraries like GSAP, Motion One (vanilla equivalent of Framer Motion), or rely on highly advanced native CSS keyframes and transitions. Implement scroll-reveals (via IntersectionObserver), hover states, magnetic buttons, and micro-interactions.
- Layout: Use CSS Grid/Flexbox, fluid whitespace, fully rounded corners, and layered drop-shadows. Mobile-first and 100% responsive on all screen sizes.

ZERO-ERROR POLICY & FUNCTIONAL PERFECTION:
- The code you write MUST be 100% functionally perfect. No bugs, no syntax errors, no missing tags.
- JavaScript must be rigorously checked: Guard all DOM lookups (e.g., \`if (!element) return;\`), handle empty states, prevent default behaviors correctly on forms, and never throw errors on initial load.
- Implement every feature implied by the UI. If there is a button, it must do something functional (even if it's a beautifully animated local UI state change or saving to localStorage).

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
- Never print raw CSS or JS code into <<<SUMMARY>>>. The summary is strictly plain English.
- Every file must be complete and runnable. Never emit placeholders, "..." elisions, or TODOs.

index.html
- Start with <!doctype html>. Include <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1">, descriptive <title>.
- WEBSITE MAIN ICON & FAVICON (MANDATORY):
  • In <head>, ALWAYS include a website favicon using a crisp SVG data URI tailored to the theme:
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>">
  • In the header / navbar, ALWAYS render a prominent main brand icon right beside the site title:
    <div class="logo"><span class="logo-icon material-symbols-rounded">rocket_launch</span> <span class="logo-text">AppName</span></div>
- Link assets exactly as: <link rel="stylesheet" href="styles.css"> in <head> and <script type="module" src="script.js" defer></script> before </body>.
- Semantic HTML only.

styles.css
- Own the entire visual design here — no inline styles in the HTML.
- Define a token layer in :root (colors, radii, spacing). 
- Must be fully responsive with breakpoints for tablet and desktop.

script.js
- Vanilla ES6+ (or ESM modules if importing animation libraries via CDN like \`import { animate } from "https://cdn.skypack.dev/motion"\`). 
- Wrap logic to avoid global scope pollution.
- Persist data in localStorage where appropriate.

ICONS & ASSETS — MANDATORY
- ICONS: Every icon in the app MUST be a Google Material Symbol. 
  • Load in <head>: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
  • Use as: <span class="material-symbols-rounded" aria-hidden="true">search</span>.
- IMAGES: Every page must contain contextually relevant, breathtaking photography. Never ship an image-free page or placeholder boxes.
  • Use ONLY these always-working sources:
    - https://images.unsplash.com/photo-<id>?w=1200&q=80 (if you absolutely know the ID)
    - https://source.unsplash.com/1200x800/?<context-keyword> (e.g., /?technology, /?dental, /?cyberpunk)
    - https://picsum.photos/seed/<unique-keyword>/1200/800 (fallback deterministic photo)
  • Give every <img> loading="lazy", alt text, and an onerror fallback.

GOOGLE MAPS & REAL BUSINESS DATA EXTRACTION:
- When the user pastes raw text from Google Maps, Apple Maps, Yelp, or business listings:
  • Automatically parse the business metadata and NEVER discard real pasted business details with placeholder names.
  • Construct an elite, high-converting digital storefront & web app for this exact business featuring Hero Showcases, Dynamic Open/Closed Status, Interactive Location Cards, and Real Reviews Carousels.
`;

const Input = z.object({
  projectId: z.string().uuid().optional(),
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
  "auto",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3.7-flash",
  "google/gemini-3.6-flash",
  "google/gemini-3.1-flash-lite",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-flash-latest",
]);

const DEFAULT_MODEL = "auto";

/** Auto mode tries Google models in sensible fallback order */
const AUTO_CHAIN = [
  "google/gemini-3.7-flash",
  "google/gemini-3.6-flash",
  "google/gemini-flash-latest",
  "google/gemini-2.5-flash",
  "google/gemini-2.5-flash-lite",
  "google/gemini-3.1-pro-preview",
];

function modelChain(chosen: string): string[] {
  if (chosen === "auto" || !ALLOWED_MODELS.has(chosen)) return AUTO_CHAIN;
  return [chosen, ...AUTO_CHAIN.filter((m) => m !== chosen)];
}

function cleanCodeBlock(code: string, type: "html" | "css" | "js"): string {
  if (!code) return "";
  let s = code.trim();
  // Strip markdown code fences if model wrapped them
  s = s.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*\$/i, "").trim();
  // Strip any accidental markers leaking inside the code
  s = s.replace(/<<<[A-Za-z0-9_.:\s-]+>>>[\s\S]*\$/i, "").trim();

  if (type === "html") {
    // If </html> exists and raw css/js follows it, strip anything after </html>
    const closeIdx = s.toLowerCase().lastIndexOf("</html>");
    if (closeIdx !== -1) {
      const after = s.slice(closeIdx + 7).trim();
      if (
        after.startsWith(":root") ||
        after.startsWith("body") ||
        after.startsWith("/*") ||
        after.startsWith("/**") ||
        after.startsWith("<style") ||
        after.startsWith("<<")
      ) {
        s = s.slice(0, closeIdx + 7);
      }
    }
  } else if (type === "css") {
    s = s.replace(/<\/?style[^>]*>/gi, "").trim();
  } else if (type === "js") {
    s = s.replace(/<\/?script[^>]*>/gi, "").trim();
  }
  return s;
}

function parseResult(raw: string): {
  html: string;
  css: string;
  js: string;
  summary: string;
  name?: string | null;
  memory: string[];
} {
  const t = raw.trim();

  // Primary contract: <<<FILE:...>>> markers (case-insensitive and matches any marker in lookahead)
  const match = (pattern: string) => {
    const re = new RegExp(`<<<\\s*${pattern}\\s*>>>([\\s\\S]*?)(?=<<<\\s*[A-Za-z0-9_.:-]+\\s*>>>|$)`, "i");
    const m = t.match(re);
    return m ? m[1].trim() : "";
  };

  let html = match("FILE:index.html") || match("index.html");
  let css = match("FILE:styles.css") || match("styles.css");
  let js = match("FILE:script.js") || match("script.js");
  let summary = match("SUMMARY");
  const name = match("NAME");
  const memRaw = match("MEMORY");
  const memory = memRaw
    ? memRaw
        .split("\n")
        .map((s) => s.replace(/^[-*•]\s*/, "").trim())
        .filter(Boolean)
    : [];

  if (html && css) {
    html = cleanCodeBlock(html, "html");
    css = cleanCodeBlock(css, "css");
    js = cleanCodeBlock(js, "js");

    // Ensure website has a main favicon icon in <head>
    if (html && !html.includes('rel="icon"') && !html.includes("rel='icon'")) {
      html = html.replace(/<head[^>]*>/i, (m) => `${m}\n  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>✨</text></svg>">`);
    }

    // Clean summary from code leakage
    if (summary) {
      summary = summary.replace(/<<<[A-Za-z0-9_.:\s-]+>>>[\s\S]*/gi, "").trim();
      summary = summary.replace(/```[\s\S]*?```/gi, "").trim();
      if (summary.includes(":root") || summary.includes("function()") || summary.length > 500) {
        summary = summary.split("\n")[0] || "Updated your app.";
      }
    }

    return {
      html,
      css,
      js,
      summary: summary || "Updated your app.",
      name: name || null,
      memory,
    };
  }

  // Fallback 1: JSON payload
  try {
    const jsonMatch = t.match(/\{[\s\S]*"index\.html"[\s\S]*\}/);
    if (jsonMatch) {
      const p = JSON.parse(jsonMatch[0]);
      return {
        html: cleanCodeBlock(p["index.html"] || "", "html"),
        css: cleanCodeBlock(p["styles.css"] || "", "css"),
        js: cleanCodeBlock(p["script.js"] || "", "js"),
        summary: p.summary || "Updated your app.",
        name: p.name || null,
        memory: Array.isArray(p.memory) ? p.memory : [],
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
    return {
      html: cleanCodeBlock(fHtml, "html"),
      css: cleanCodeBlock(fCss, "css"),
      js: cleanCodeBlock(fJs, "js"),
      summary: "Updated your app.",
      memory: [],
    };
  }

  // Fallback 3: a bare HTML document
  const doc = t.match(/<!doctype html[\s\S]*<\/html>/i);
  if (doc) {
    let rawHtml = doc[0];
    let extractedCss = "";
    let extractedJs = "";

    // Extract inline <style> into css
    const styleMatch = rawHtml.match(/<style[^>]*>([\s\S]*?)<\/style>/i);
    if (styleMatch) {
      extractedCss = styleMatch[1].trim();
    }
    // Extract inline <script> into js
    const scriptMatch = rawHtml.match(/<script(?![^>]*src)[^>]*>([\s\S]*?)<\/script>/i);
    if (scriptMatch) {
      extractedJs = scriptMatch[1].trim();
    }

    return {
      html: cleanCodeBlock(rawHtml, "html"),
      css: cleanCodeBlock(extractedCss, "css"),
      js: cleanCodeBlock(extractedJs, "js"),
      summary: "Updated your app.",
      memory: [],
    };
  }

  throw new Error("no-parse");
}

export const generateCode = createServerFn({ method: "POST" })
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
          "Daily free prompt limit reached (3/3 used). Add your free Gemini API key in Settings (or wait for the daily reset) to continue building.",
        );
      }
      throw new Error(
        "No AI API key is configured. Please add your Gemini API key in Settings (or ask an admin to configure backup keys).",
      );
    }

    const chain = modelChain(data.model ?? DEFAULT_MODEL);

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
      : `Build a fresh, complete, extremely advanced and perfectly functional web app for this request.\n\n${data.prompt}\n${planBlock}${imageBlock}\n\n${CONTRACT}`;

    const parts: AiPart[] = [{ type: "text", text: userText }];
    for (const img of data.images ?? []) parts.push({ type: "image", image: img });

    const memBlock = memory.length ? `\n\nRemembered about this user:\n- ${memory.join("\n- ")}` : "";
    const sys = `${SYSTEM}\n\nUser preferences: personality=${personality}, verbosity=${verbosity}, style=${style}.${memBlock}`;

    try {
      let text = "";
      let lastErr: unknown = null;
      let usedGiveaway = false;

      outer: for (const modelId of chain) {
        for (const item of keysToTry) {
          const k = item.key;
          try {
            text = await generateWithKey({
              apiKey: k.api_key,
              modelId,
              system: sys,
              parts,
              maxOutputTokens: 32000,
            });
            usedGiveaway = item.isGiveaway;
            lastErr = null;
            break outer;
          } catch (e) {
            lastErr = e;
            const m = e instanceof Error ? e.message : String(e);
            console.error(`[generateCode] ${modelId} / key "${k.label}" failed:`, m);
            const exhausted = m.includes("402") || m.includes("429") || m.includes("401") || m.includes("403");
            if (exhausted) {
              if (k.isUserKey) await reportUserKeyExhausted(k, m);
              else await reportKeyExhausted(k, m);
            }
          }
        }
      }
      if (lastErr) throw lastErr;

      if (usedGiveaway) {
        await recordGiveawayPrompt(context.userId);
      }

      if (!text || !text.trim()) throw new Error("Empty response from AI");
      try {
        const parsed = parseResult(text);

        const fresh = parsed.memory.filter((f) => !memory.includes(f));
        if (fresh.length) {
          await context.supabase
            .from("user_memory")
            .insert(fresh.map((fact) => ({ user_id: context.userId, fact })));
        }

        const finalFiles = {
          "index.html": parsed.html || cf["index.html"] || "",
          "styles.css": parsed.css || cf["styles.css"] || "",
          "script.js": parsed.js ?? cf["script.js"] ?? "",
        };

        const asstMessageId = crypto.randomUUID();
        // Server-side background persistence: ensures the work is saved even if user tab is closed
        if (data.projectId) {
          try {
            const updatePayload: Record<string, unknown> = {
              files: finalFiles,
              updated_at: new Date().toISOString(),
            };
            if (parsed.name) updatePayload.name = parsed.name;
            await context.supabase.from("projects").update(updatePayload).eq("id", data.projectId);

            await context.supabase.from("chat_messages").insert({
              id: asstMessageId,
              project_id: data.projectId,
              user_id: context.userId,
              role: "assistant",
              content: parsed.summary || "Done.",
              mode: "build",
              snapshot: finalFiles,
            });
          } catch (dbErr) {
            console.error("[generateCode] background db save error:", dbErr);
          }
        }

        return {
          html: finalFiles["index.html"],
          css: finalFiles["styles.css"],
          js: finalFiles["script.js"],
          summary: parsed.summary,
          name: parsed.name ?? null,
          memory: fresh,
          messageId: asstMessageId,
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
        throw new Error("AI credits exhausted. Please check your API key in Settings.");
      throw new Error(`Generation failed: ${msg}`);
    }
  });
