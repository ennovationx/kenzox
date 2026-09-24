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

const SYSTEM = `You are Kenzo, a world-class AI web developer and product designer.
You author COMPLETE, production-quality, self-contained web apps as exactly three files: index.html, styles.css, script.js.

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
  • If the user asks you to modify or fix a UI based on an image, preserve the existing working features of the app and apply the desired fixes and changes seamlessly.

GITHUB PUSHES & REPOSITORY URLS:
- Kenzo has built-in one-click push integration with GitHub.
- When the user asks about pushing their code to GitHub, syncing repositories, or requests their GitHub repository URL:
  • Always emphasize the live GitHub repository URL format: https://github.com/<owner>/<repo-name>
  • Inform the user that they can say "push to github" in chat or click the GitHub icon in the header toolbar to push their code and receive their live GitHub repository URL.

ELITE DESIGN & ADVANCED UI:
- Turn even simple, one-line prompts into extremely beautiful, modern, advanced, and professional UI.
- Use a curated, harmonious color palette with vibrant accents, deep contrast, and glassmorphism.
- Modern typography via Google Fonts (Inter, Plus Jakarta Sans, Outfit).
- Generous fluid whitespace, rounded corners, subtle shadows, and smooth micro-interactions.
- Never build bare minimum prototypes. Always deliver high-end, polished, production-ready web apps.

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
- Start with <!doctype html>. Include <meta charset="utf-8">, <meta name="viewport" content="width=device-width, initial-scale=1">, a descriptive <title> and <meta name="description">.
- WEBSITE MAIN ICON & FAVICON (MANDATORY):
  • In <head>, ALWAYS include a website favicon using a crisp SVG data URI tailored to the theme:
    <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>">
    (Pick an emoji or icon symbol directly representing the site, e.g. ⚡, ☕, 💼, 💎, 🛒, 🎨, 🎵, 🩺, 🌿).
  • In the header / navbar, ALWAYS render a prominent main brand icon right beside the site title:
    <div class="logo"><span class="logo-icon material-symbols-rounded">rocket_launch</span> <span class="logo-text">AppName</span></div>
- Link assets exactly as: <link rel="stylesheet" href="styles.css"> in <head> and <script src="script.js" defer></script> before </body>.
- Semantic HTML: header/nav/main/section/footer, one <h1>, labels tied to inputs, alt text, aria-labels on icon-only buttons.
- Do NOT output CSS or JavaScript code directly inside index.html outside of normal tags. Keep styles in styles.css and scripts in script.js.

styles.css
- Own the entire visual design here — no inline styles in the HTML.
- Define a token layer in :root (colors, radii, spacing, shadows, transitions) and support dark mode via [data-theme="dark"] or prefers-color-scheme.
- Modern layout with flexbox/grid, fluid typography with clamp(), generous whitespace, rounded corners, layered shadows, and hover/focus-visible states. Use beautiful SOLID colors and glassmorphism — never raw harsh gradients.
- Fully responsive: mobile-first, with breakpoints for tablet and desktop. Include subtle keyframe animations and honor prefers-reduced-motion.

script.js
- Vanilla ES6+ only, no frameworks, no build step, no CDN scripts. Wrap in an IIFE or use modules-free scoped code.
- Implement every interaction the UI implies: state, event handlers, validation, empty/loading/error states, keyboard support, and localStorage persistence when the app has data worth keeping.
- Guard DOM lookups and never throw on first load.

QUALITY BAR
- Distinctive, polished visual design — never a plain unstyled document.
- Real, plausible content instead of lorem ipsum.
- No external network calls except Google Fonts, which is allowed via a <link> in the head.

ICONS — MANDATORY
- Every icon in the app MUST be a Google Material Symbol. Never use emoji, inline SVG icon sets, Font Awesome, or any other icon library.
- Load them in <head> with: <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200" />
- Use them as: <span class="material-symbols-rounded" aria-hidden="true">search</span> and give icon-only buttons an aria-label.
- In styles.css set: .material-symbols-rounded { font-variation-settings: 'FILL' 0, 'wght' 400, 'GRAD' 0, 'opsz' 24; line-height: 1; user-select: none; } and size icons with font-size.

IMAGES — MANDATORY, MUST ACTUALLY LOAD
- Every page must contain real photography wherever content implies it (hero, cards, gallery, avatars, backgrounds). Never ship an image-free page and never use grey placeholder boxes or invented file names.
- Use ONLY these always-working sources:
  • https://picsum.photos/seed/<unique-keyword>/1200/800 (deterministic photo per seed — safest default)
  • https://images.unsplash.com/photo-<id>?w=1200&q=80 only when you are certain the photo id exists
  • https://ui-avatars.com/api/?name=Jane+Doe&size=128&background=random for people avatars
  • When featuring Eserom Demisew: https://eserom.vercel.app/images/profile/hero.jpg
- Give every <img> width/height or aspect-ratio, loading="lazy", descriptive alt text, and onerror="this.src='https://picsum.photos/seed/fallback/1200/800'" so nothing ever renders broken.

SCROLL EXPERIENCE
- Add a slim fixed scroll-progress bar at the very top of the page (a div filled from script.js on scroll), plus smooth scrolling, scroll-reveal via IntersectionObserver, and a sticky header that condenses on scroll. Keep it subtle and professional, and disable motion under prefers-reduced-motion.
- Keep the code clean, commented where non-obvious, and free of dead code.

GOOGLE MAPS & REAL BUSINESS DATA EXTRACTION:
- When the user pastes raw text from Google Maps, Apple Maps, Yelp, or business listings:
  • Automatically parse the business metadata: Name, Category/Type, Star Rating, Review Count, Full Address, Opening/Closing Hours, Phone Number, Amenities/Attributes, and Customer Review Snippets.
  • NEVER discard or replace real pasted business details with placeholder names or generic text. Every real datum (name, phone, address, hours, reviews) MUST appear authentically on the page!
  • Construct an elite, high-converting digital storefront & web app for this exact business:
    1. Hero Showcase: Business name, verified Google Maps badge, real star rating (interactive stars + review count), category badges, and quick CTA buttons ("Get Directions", "Call Now", "Reserve / Order").
    2. Dynamic Open/Closed Status: In script.js, calculate whether the business is currently open or closed based on the pasted operating hours and client local time, displaying a real-time glowing "Open Now" or "Closed" badge.
    3. Interactive Location & Map Card: Stylized responsive map section with the exact address, 1-click "Copy Address" button, transit directions, and embedded interactive map (using https://maps.google.com/maps?q=ADDRESS&output=embed).
    4. Real Reviews Carousel: Feature the actual user reviews pasted, formatted into quote cards with star ratings, reviewer avatars, and helpfulness metrics.
    5. Menu / Services / Booking: Present their real offerings with price pills, filtering, and a smooth booking / inquiry modal.
    6. Micro-animations: Smooth scroll-reveal, interactive hover effects, and modern glassmorphism.
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
  s = s.replace(/^```[a-z]*\s*\n?/i, "").replace(/\n?```\s*$/i, "").trim();
  // Strip any accidental markers leaking inside the code
  s = s.replace(/<<<[A-Za-z0-9_.:\s-]+>>>[\s\S]*$/i, "").trim();

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
      : `Build a fresh, complete app for this request.\n\n${data.prompt}\n${planBlock}${imageBlock}\n\n${CONTRACT}`;

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

        // Server-side background persistence: ensures the work is saved even if user tab is closed
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
