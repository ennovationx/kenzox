import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatars, ShareDialog } from "@/components/ShareDialog";
import { PublishMenu } from "@/components/PublishMenu";
import { GithubMenu } from "@/components/GithubMenu";
import { getGithubConnection, pushProjectToGithub } from "@/lib/github.functions";
import { getNetlifyConnection, publishProject } from "@/lib/netlify.functions";
import { getGiveawayQuota } from "@/lib/user-keys.functions";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCode } from "@/lib/generate.functions";
import { planWithAI } from "@/lib/plan.functions";
import { transcribeAudio } from "@/lib/transcribe.functions";
import { claimInvites, listCollaborators, requestAccess } from "@/lib/share.functions";
import {
  Plus, Send, RefreshCw, Download, ExternalLink, Trash2, Settings, LogOut,
  FileCode, Palette, FileText, Loader2, Menu, X, Sparkles, Search, Share2,
  Monitor, Tablet, Smartphone, ChevronDown, FileArchive, Copy, Mic, Square,
  ImagePlus, Terminal, History, ThumbsUp, ThumbsDown, Pencil, Check, Hammer,
  ClipboardList, Image as ImageIcon, MessageSquare, FolderTree, Camera, AlertTriangle,
  Coffee, CheckSquare, Briefcase, BarChart3, Gamepad2, Headphones, UtensilsCrossed,
  Flame, TrendingUp, Compass, Dumbbell, Shuffle, ArrowUpRight, Rocket, Wand2, Eye,
  Code2,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/app")({
  head: () => ({
    meta: [
      { title: "Workspace — Kenzo" },
      { name: "description", content: "Chat with AI, edit code, and preview your app live." },
      { property: "og:title", content: "Workspace — Kenzo" },
      { property: "og:description", content: "Chat with AI, edit code, and preview your app live." },
    ],
  }),
  component: Workspace,
});

type Files = { "index.html": string; "styles.css": string; "script.js": string };
type ProjectRow = { id: string; name: string; files: Files; updated_at: string; user_id: string };
type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  mode?: string;
  snapshot?: Files | null;
  feedback?: string | null;
  attachments?: string[];
};
type Profile = { display_name: string | null; ai_personality: string; ai_verbosity: string; ai_style: string; ai_model: string };
type LogLine = { id: number; level: string; text: string };

const DEFAULT_FILES: Files = {
  "index.html": `<!doctype html>\n<html>\n  <head><meta charset="utf-8"><title>New app</title><link rel="stylesheet" href="styles.css"></head>\n  <body>\n    <main>\n      <h1>Hello from Kenzo</h1>\n      <p>Ask the assistant to build something amazing.</p>\n    </main>\n    <script src="script.js" defer></script>\n  </body>\n</html>`,
  "styles.css": `body{font-family:system-ui;margin:0;padding:3rem;background:#0e0e11;color:#fff;min-height:100vh}h1{font-size:2.5rem;margin:0 0 .5rem}p{opacity:.85}`,
  "script.js": `console.log("Kenzo ready");`,
};

const MAX_CHARS = 6000;

type PromptIdea = {
  id: string;
  title: string;
  badge: string;
  subtitle: string;
  prompt: string;
  icon: React.ComponentType<{ className?: string }>;
  color: string;
};

const PROMPT_IDEAS: PromptIdea[] = [
  {
    id: "coffee",
    title: "Landing page for a coffee shop",
    badge: "Food & Drink",
    subtitle: "Artisan roastery with warm aesthetic, roast menu & online ordering",
    prompt: "Landing page for an artisan coffee shop with dark warm aesthetics, interactive coffee roast menu, brewing guide, customer reviews, and a smooth table reservation & pickup ordering modal.",
    icon: Coffee,
    color: "from-amber-500/20 to-orange-500/10 text-amber-400 border-amber-500/30",
  },
  {
    id: "todo",
    title: "Interactive todo list with dark mode",
    badge: "Productivity",
    subtitle: "Kanban task manager with priority tags, filters & local storage",
    prompt: "Interactive todo list with dark mode toggle, priority badges, category filtering (Work, Personal, Urgent), search, smooth completion animations, and localStorage persistence.",
    icon: CheckSquare,
    color: "from-emerald-500/20 to-teal-500/10 text-emerald-400 border-emerald-500/30",
  },
  {
    id: "portfolio",
    title: "Portfolio with hero and projects grid",
    badge: "Showcase",
    subtitle: "Creative developer portfolio with live preview modal & skills badges",
    prompt: "Portfolio with hero and projects grid, interactive case studies with image preview modals, tech stack pill badges, client testimonials, and a sleek contact form.",
    icon: Briefcase,
    color: "from-blue-500/20 to-indigo-500/10 text-blue-400 border-blue-500/30",
  },
  {
    id: "dashboard",
    title: "SaaS Analytics Dashboard",
    badge: "Business",
    subtitle: "Live revenue metrics, SVG chart widgets, user growth & recent activity",
    prompt: "Modern dark-themed SaaS analytics dashboard with interactive SVG revenue chart, MRR/churn metric cards with trend indicators, recent user activity table, and date range filters.",
    icon: BarChart3,
    color: "from-violet-500/20 to-purple-500/10 text-violet-400 border-violet-500/30",
  },
  {
    id: "arcade",
    title: "Retro Arcade Mini-Games",
    badge: "Gaming",
    subtitle: "Playable 8-bit games, canvas animations, sound effects & leaderboard",
    prompt: "Retro neon arcade web app featuring playable mini-games (Snake and Pong), dynamic canvas renderer, Web Audio API sound effects, high score leaderboard, and CRT scanline filter.",
    icon: Gamepad2,
    color: "from-fuchsia-500/20 to-pink-500/10 text-fuchsia-400 border-fuchsia-500/30",
  },
  {
    id: "lofi",
    title: "Lo-Fi Focus & Soundboard",
    badge: "Audio & Focus",
    subtitle: "Layered rain, vinyl & café sounds with pomodoro focus timer",
    prompt: "Lo-Fi focus soundboard with synthesised ambient sounds (rain, campfire, vinyl crackle, waves) using Web Audio API, volume sliders for each track, a built-in Pomodoro timer, and calming animated visualizer.",
    icon: Headphones,
    color: "from-indigo-500/20 to-cyan-500/10 text-indigo-400 border-indigo-500/30",
  },
  {
    id: "food",
    title: "Gourmet Food Delivery App",
    badge: "E-Commerce",
    subtitle: "Dish cards, dietary filters, interactive cart & checkout drawer",
    prompt: "Modern food delivery landing and ordering app with dietary filters (Vegan, Gluten-Free, Chef's Special), calorie/macro breakdown, interactive sliding cart drawer, and order tracking timeline.",
    icon: UtensilsCrossed,
    color: "from-rose-500/20 to-red-500/10 text-rose-400 border-rose-500/30",
  },
  {
    id: "habits",
    title: "Daily Habit & Streak Tracker",
    badge: "Lifestyle",
    subtitle: "GitHub-style activity heatmap, daily streaks & motivational badges",
    prompt: "Addictive daily habit tracker featuring a GitHub-style activity contribution grid, streak counters, milestone badges, daily reminder checklist, and confetti celebration on 100% completion.",
    icon: Flame,
    color: "from-amber-500/20 to-yellow-500/10 text-amber-400 border-amber-500/30",
  },
  {
    id: "studio",
    title: "AI Photo Studio & Editor",
    badge: "Creative Tool",
    subtitle: "Canvas image filters, crop tool, preset LUTs & instant download",
    prompt: "In-browser photo studio with HTML5 canvas image editing: brightness, contrast, saturation, retro filters, sticker overlays, text watermark generator, and 1-click PNG export.",
    icon: Sparkles,
    color: "from-pink-500/20 to-purple-500/10 text-pink-400 border-pink-500/30",
  },
  {
    id: "crypto",
    title: "Live Market & Crypto Ticker",
    badge: "FinTech",
    subtitle: "Real-time simulated price candles, watchlist & portfolio calculator",
    prompt: "Sleek financial market tracker with simulated real-time candlestick charts, multi-currency watchlist, 24h gainers/losers, profit/loss calculator, and breaking market news feed.",
    icon: TrendingUp,
    color: "from-emerald-500/20 to-cyan-500/10 text-emerald-400 border-emerald-500/30",
  },
  {
    id: "travel",
    title: "Interactive Travel Itinerary",
    badge: "Travel",
    subtitle: "Day-by-day journey timeline, packing checklist & budget estimator",
    prompt: "Luxury travel planner with interactive day-by-day itinerary cards, destination weather widget, packing checklist with checkoff sound, expense splitting calculator, and photo gallery.",
    icon: Compass,
    color: "from-cyan-500/20 to-blue-500/10 text-cyan-400 border-cyan-500/30",
  },
  {
    id: "fitness",
    title: "HIIT & Workout Companion",
    badge: "Health & Fitness",
    subtitle: "Interval timer with voice cues, exercise animation cards & log",
    prompt: "Fitness companion app featuring an automated HIIT interval countdown timer with audio beeps, animated exercise demonstration cards, reps/sets tracker, and rest-time stopwatch.",
    icon: Dumbbell,
    color: "from-orange-500/20 to-red-500/10 text-orange-400 border-orange-500/30",
  },
];

const CONSOLE_BRIDGE = `<script>(function(){
  var send=function(level,args){try{parent.postMessage({__kenzo:1,level:level,text:Array.prototype.map.call(args,function(a){
    try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" ")},"*")}catch(e){}};
  ["log","info","warn","error","debug"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o&&o.apply(console,arguments)}});
  window.addEventListener("error",function(e){send("error",[e.message+" ("+(e.filename||"script")+":"+e.lineno+")"])});
  window.addEventListener("unhandledrejection",function(e){send("error",["Unhandled promise rejection: "+e.reason])});
})();<\/script>`;

function cleanHtml(raw: string): string {
  if (!raw) return "";
  let h = raw;
  // Remove any leaked markers and their trailing code if present
  h = h.replace(/<<<FILE:styles\.css>>>[\s\S]*?(?=(?:<<<FILE:script\.js>>>|<\/html>|$))/gi, "");
  h = h.replace(/<<<FILE:script\.js>>>[\s\S]*?(?=(?:<<<[A-Za-z0-9_.:\s-]+>>>|<\/html>|$))/gi, "");
  h = h.replace(/<<<[A-Za-z0-9_.:\s-]+>>>/gi, "");
  // If </html> is present, strip any leaked CSS or JS after </html>
  const closeIdx = h.toLowerCase().lastIndexOf("</html>");
  if (closeIdx !== -1) {
    const after = h.slice(closeIdx + 7).trim();
    if (
      after.startsWith(":root") ||
      after.startsWith("body") ||
      after.startsWith("/*") ||
      after.startsWith("/**") ||
      after.startsWith("<style") ||
      after.startsWith("<<")
    ) {
      h = h.slice(0, closeIdx + 7);
    }
  }
  return h;
}

function getVisualEditBridge(initActive = false): string {
  return `<script>(function(){
  var active = ${initActive ? "true" : "false"};
  var style = document.createElement('style');
  style.id = '__kenzo_ve_style';
  style.textContent = \`
    .kenzo-ve-hover {
      outline: 2px dashed #10b981 !important;
      outline-offset: 3px !important;
      cursor: text !important;
      position: relative !important;
      transition: outline-color 0.15s ease !important;
    }
    .kenzo-ve-hover::after {
      content: "✏️ Visual Edit: Click to edit text";
      position: absolute;
      top: -26px;
      left: 0;
      background: #10b981;
      color: #ffffff;
      font-size: 11px;
      font-weight: 600;
      font-family: system-ui, -apple-system, sans-serif;
      padding: 3px 8px;
      border-radius: 4px;
      pointer-events: none;
      z-index: 999999;
      white-space: nowrap;
      box-shadow: 0 4px 14px rgba(0,0,0,0.35);
      animation: kenzoVeFade 0.15s ease;
    }
    .kenzo-ve-hover.kenzo-ve-top::after {
      top: auto;
      bottom: -26px;
    }
    @keyframes kenzoVeFade {
      from { opacity: 0; transform: translateY(3px); }
      to { opacity: 1; transform: translateY(0); }
    }
    [contenteditable="true"] {
      outline: 2px solid #10b981 !important;
      outline-offset: 3px !important;
      background: rgba(16, 185, 129, 0.08) !important;
      border-radius: 2px !important;
      cursor: text !important;
    }
  \`;
  document.head.appendChild(style);
  style.disabled = !active;

  function initVe() {
    var targets = document.querySelectorAll('h1, h2, h3, h4, h5, h6, p, a, button, span, li, blockquote, label, small, strong, em, b');
    targets.forEach(function(el) {
      if (el.children.length === 0 || (el.children.length === 1 && (el.children[0].tagName === 'SPAN' || el.children[0].tagName === 'B'))) {
        el.addEventListener('mouseenter', function() {
          if (active && el.contentEditable !== "true") {
            var rect = el.getBoundingClientRect();
            if (rect.top < 32) {
              el.classList.add('kenzo-ve-top');
            } else {
              el.classList.remove('kenzo-ve-top');
            }
            el.classList.add('kenzo-ve-hover');
          }
        });
        el.addEventListener('mouseleave', function() {
          el.classList.remove('kenzo-ve-hover');
          el.classList.remove('kenzo-ve-top');
        });
        el.addEventListener('click', function(e) {
          if (!active) return;
          e.preventDefault();
          e.stopPropagation();
          el.classList.remove('kenzo-ve-hover');
          el.classList.remove('kenzo-ve-top');
          el.contentEditable = "true";
          el.focus();
          if (!el.getAttribute('data-original-text')) {
            el.setAttribute('data-original-text', el.innerText.trim());
          }
        });
        el.addEventListener('blur', function() {
          if (el.contentEditable === "true") {
            el.contentEditable = "false";
            var newText = el.innerText.trim();
            var oldText = el.getAttribute('data-original-text') || '';
            if (newText && oldText && newText !== oldText) {
              el.setAttribute('data-original-text', newText);
              try {
                parent.postMessage({
                  __kenzo_visual_edit: true,
                  oldText: oldText,
                  newText: newText
                }, '*');
              } catch(err){}
            }
          }
        });
        el.addEventListener('keydown', function(e) {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            el.blur();
          }
        });
      }
    });
  }

  window.addEventListener('message', function(e) {
    if (e.data && e.data.__toggle_visual_edit !== undefined) {
      active = Boolean(e.data.__toggle_visual_edit);
      style.disabled = !active;
      if (!active) {
        document.querySelectorAll('[contenteditable="true"]').forEach(function(el) {
          el.contentEditable = "false";
          el.classList.remove('kenzo-ve-hover');
          el.classList.remove('kenzo-ve-top');
        });
      }
    }
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initVe);
  } else {
    initVe();
  }
})();</script>`;
}

function highlightSyntax(code: string, file: string): string {
  if (!code) return "";
  let s = code
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  if (file === "index.html") {
    s = s.replace(/(&lt;!--[\s\S]*?--&gt;)/g, '§C§$1§/§');
    s = s.replace(/(&lt;\/?[a-zA-Z0-9\-]+)/g, '§T§$1§/§');
    s = s.replace(/(\/?&gt;)/g, '§T§$1§/§');
    s = s.replace(/(\s+)([a-zA-Z0-9\-:]+)(?==)/g, '$1§A§$2§/§');
    s = s.replace(/="([^"]*)"/g, '=§S§"$1"§/§');
    s = s
      .replace(/§C§(.*?)§\/§/gs, '<span style="color:#6a9955;font-style:italic">$1</span>')
      .replace(/§T§(.*?)§\/§/g, '<span style="color:#569cd6">$1</span>')
      .replace(/§A§(.*?)§\/§/g, '<span style="color:#9cdcfe">$1</span>')
      .replace(/§S§(.*?)§\/§/g, '<span style="color:#ce9178">$1</span>');
  } else if (file === "styles.css") {
    s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '§C§$1§/§');
    s = s.replace(/(#[a-fA-F0-9]{3,8}|"[^"]*"|'[^']*')/g, '§S§$1§/§');
    s = s.replace(/([a-zA-Z0-9\-]+)\s*:/g, '§P§$1§/§:');
    s = s.replace(/\b(\d+(?:\.\d+)?(?:px|rem|em|%|vh|vw|s|ms|deg|fr)?)\b/g, '§N§$1§/§');
    s = s.replace(/(^|[{}\n\r])([.#]?[a-zA-Z0-9_\-:[\]=^$*~>+,\s]+)(?=\s*\{)/gm, '$1§K§$2§/§');
    s = s
      .replace(/§C§(.*?)§\/§/gs, '<span style="color:#6a9955;font-style:italic">$1</span>')
      .replace(/§S§(.*?)§\/§/g, '<span style="color:#ce9178">$1</span>')
      .replace(/§P§(.*?)§\/§/g, '<span style="color:#9cdcfe">$1</span>')
      .replace(/§N§(.*?)§\/§/g, '<span style="color:#b5cea8">$1</span>')
      .replace(/§K§(.*?)§\/§/g, '<span style="color:#d7ba7d">$1</span>');
  } else if (file === "script.js") {
    s = s.replace(/(\/\/.*$)/gm, '§C§$1§/§');
    s = s.replace(/(\/\*[\s\S]*?\*\/)/g, '§C§$1§/§');
    s = s.replace(/("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*'|`[^`\\]*(?:\\.[^`\\]*)*`)/g, '§S§$1§/§');
    s = s.replace(/\b(const|let|var|function|return|if|else|for|while|async|await|try|catch|new|class|import|export|from|default|switch|case|break|typeof|instanceof)\b/g, '§K§$1§/§');
    s = s.replace(/\b(true|false|null|undefined|NaN|document|window|console)\b/g, '§B§$1§/§');
    s = s.replace(/\b(\d+(?:\.\d+)?)\b/g, '§N§$1§/§');
    s = s.replace(/([a-zA-Z0-9_$]+)(?=\()/g, '§F§$1§/§');
    s = s
      .replace(/§C§(.*?)§\/§/gs, '<span style="color:#6a9955;font-style:italic">$1</span>')
      .replace(/§S§(.*?)§\/§/g, '<span style="color:#ce9178">$1</span>')
      .replace(/§K§(.*?)§\/§/g, '<span style="color:#c586c0;font-weight:600">$1</span>')
      .replace(/§B§(.*?)§\/§/g, '<span style="color:#569cd6">$1</span>')
      .replace(/§N§(.*?)§\/§/g, '<span style="color:#b5cea8">$1</span>')
      .replace(/§F§(.*?)§\/§/g, '<span style="color:#dcdcaa">$1</span>');
  }
  return s;
}

function buildSrcDoc(f: Files, visualEdit = false): string {
  let html = cleanHtml(f["index.html"] || "");
  const css = (f["styles.css"] || "").replace(/<\/?style[^>]*>/gi, "").replace(/<<<[A-Za-z0-9_.:\s-]+>>>/gi, "");
  const js = (f["script.js"] || "").replace(/<\/?script[^>]*>/gi, "").replace(/<<<[A-Za-z0-9_.:\s-]+>>>/gi, "");
  html = html.replace(/<link\s+[^>]*href=["']styles\.css["'][^>]*>/i, `<style>${css}</style>`);
  html = html.replace(/<script\s+[^>]*src=["']script\.js["'][^>]*><\/script>/i, `<script>${js}</script>`);
  if (!/<style>/.test(html) && css) html = html.replace("</head>", `<style>${css}</style></head>`);
  if (!/<script>/.test(html) && js) html = html.replace("</body>", `<script>${js}</script></body>`);
  const bridges = CONSOLE_BRIDGE + getVisualEditBridge(visualEdit);
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + bridges);
  else html = bridges + html;
  return html;
}

/** Every remote asset referenced by the generated code. */
function collectAssets(f: Files) {
  const out: Array<{ url: string; kind: string; file: string }> = [];
  const push = (url: string, kind: string, file: string) => {
    if (!url || url.startsWith("data:")) return;
    if (out.some((a) => a.url === url)) return;
    out.push({ url, kind, file });
  };
  for (const m of f["index.html"].matchAll(/<img[^>]+src=["']([^"']+)["']/gi)) push(m[1], "image", "index.html");
  for (const m of f["index.html"].matchAll(/<source[^>]+srcset=["']([^"'\s]+)/gi)) push(m[1], "image", "index.html");
  for (const m of f["index.html"].matchAll(/<link[^>]+href=["'](https?:\/\/[^"']+)["']/gi)) push(m[1], "stylesheet", "index.html");
  for (const m of f["styles.css"].matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/gi)) push(m[1], "image", "styles.css");
  for (const m of f["script.js"].matchAll(/["'](https?:\/\/[^"']+\.(?:png|jpe?g|gif|svg|webp))["']/gi)) push(m[1], "image", "script.js");
  return out;
}

function encodeWav(chunks: Float32Array[], sampleRate: number): Blob {
  const len = chunks.reduce((n, c) => n + c.length, 0);
  const data = new Float32Array(len);
  let off = 0;
  for (const c of chunks) { data.set(c, off); off += c.length; }
  const buf = new ArrayBuffer(44 + data.length * 2);
  const view = new DataView(buf);
  const str = (o: number, s: string) => { for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i)); };
  str(0, "RIFF"); view.setUint32(4, 36 + data.length * 2, true); str(8, "WAVE"); str(12, "fmt ");
  view.setUint32(16, 16, true); view.setUint16(20, 1, true); view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true); view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true); view.setUint16(34, 16, true); str(36, "data");
  view.setUint32(40, data.length * 2, true);
  let p = 44;
  for (let i = 0; i < data.length; i++, p += 2) {
    const s = Math.max(-1, Math.min(1, data[i]));
    view.setInt16(p, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Blob([buf], { type: "audio/wav" });
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result).split(",")[1] ?? "");
    r.onerror = rej;
    r.readAsDataURL(blob);
  });
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(String(r.result));
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

/** Minimal markdown → HTML for assistant messages and plans. Never leaks raw ** or ## markers, renders clickable links. */
function md(text: string) {
  let esc = (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  esc = esc.replace(/```[a-z]*\n?([\s\S]*?)```/g, '<pre class="rounded-lg bg-input p-2.5 my-1.5 overflow-auto text-[11px] font-mono">$1</pre>');
  esc = esc.replace(/`([^`]+)`/g, '<code class="rounded bg-input px-1 py-0.5 text-[11px] font-mono">$1</code>');
  esc = esc.replace(/^#{4,}\s*(.*)$/gm, '<h4 class="font-semibold mt-2">$1</h4>');
  esc = esc.replace(/^###\s*(.*)$/gm, '<h4 class="font-semibold mt-2">$1</h4>');
  esc = esc.replace(/^##\s*(.*)$/gm, '<h3 class="font-semibold text-sm mt-3">$1</h3>');
  esc = esc.replace(/^#\s*(.*)$/gm, '<h3 class="font-semibold text-sm mt-3">$1</h3>');
  esc = esc.replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>");
  esc = esc.replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>");
  esc = esc.replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1<em>$2</em>");

  // Markdown links: [text](https://...)
  esc = esc.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '###LINK_START###$2###SEP###$1###LINK_END###');
  // Raw URLs: (only if not preceded by token)
  esc = esc.replace(/(^|[\s(]|&gt;)(https?:\/\/[^\s<)]+)/g, '$1###LINK_START###$2###SEP###$2###LINK_END###');
  // Convert link tokens to clickable <a> tags
  esc = esc.replace(/###LINK_START###(.*?)###SEP###(.*?)###LINK_END###/g, '<a href="$1" target="_blank" rel="noopener noreferrer" class="text-primary underline font-medium hover:opacity-80 inline-flex items-center gap-1">$2</a>');

  esc = esc.replace(/^\s*\d+\.\s+(.*)$/gm, '<li class="ml-4 list-decimal">$1</li>');
  esc = esc.replace(/^\s*[-*•]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>');
  esc = esc.replace(/\*+/g, ""); // drop any stray asterisks the model left behind
  esc = esc.replace(/\n/g, "<br/>");
  return esc;
}

function Workspace() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [draft, setDraft] = useState(false); // unsaved "new project"
  const [draftName, setDraftName] = useState("New project");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<Files>(DEFAULT_FILES);
  const [activeFile, setActiveFile] = useState<keyof Files>("index.html");
  const [rightTab, setRightTab] = useState<"code" | "preview" | "assets">("preview");
  const [typing, setTyping] = useState<{ file: keyof Files; text: string } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const isTyping = typing !== null && typing.file === activeFile;
  const editorValue: string = isTyping ? typing!.text : files[activeFile];

  const checkGithubConnection = useServerFn(getGithubConnection);
  const pushToGithubServerFn = useServerFn(pushProjectToGithub);
  const [githubMenuOpen, setGithubMenuOpen] = useState(false);
  const [githubRepoUrl, setGithubRepoUrl] = useState<string | null>(null);
  const [githubRepoName, setGithubRepoName] = useState<string | null>(null);

  const fetchQuota = useServerFn(getGiveawayQuota);
  const checkNetlifyConnection = useServerFn(getNetlifyConnection);
  const publishToNetlifyServerFn = useServerFn(publishProject);
  const [quota, setQuota] = useState<{
    isAdmin: boolean;
    hasUserKey: boolean;
    remaining: number;
    dailyLimit: number;
  } | null>(null);
  const [publishMenuOpen, setPublishMenuOpen] = useState(false);
  const [livePublishUrl, setLivePublishUrl] = useState<string | null>(null);

  const refreshQuota = useCallback(async () => {
    if (!user) return;
    try {
      const q = await fetchQuota();
      setQuota(q);
    } catch {}
  }, [user, fetchQuota]);

  useEffect(() => {
    void refreshQuota();
  }, [refreshQuota]);

  async function handleGithubPushed(repoUrl: string, repoFullName: string) {
    setGithubRepoUrl(repoUrl);
    setGithubRepoName(repoFullName);
    if (!activeId) return;

    const asst: Msg = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `🎉 **Successfully pushed to GitHub!**\n\nHere is your live GitHub repository URL:\n🔗 [${repoUrl}](${repoUrl})\n\n• **Repository:** \`${repoFullName}\`\n• **Clone Command:**\n\`\`\`bash\ngit clone ${repoUrl}.git\n\`\`\`\n• All files (\`index.html\`, \`styles.css\`, \`script.js\`, and \`README.md\`) have been synchronized to GitHub.`,
      mode: "build",
    };
    setMessages((m) => [...m, asst]);
    await persistMsg(activeId, asst);
  }

  async function handleWebsitePublished(url: string) {
    setLivePublishUrl(url);
    if (!activeId) return;

    const asst: Msg = {
      id: crypto.randomUUID(),
      role: "assistant",
      content: `🎉 **Website successfully deployed and live!**\n\nHere is your live website URL:\n🔗 [${url}](${url})\n\n• **Live URL:** \`${url}\`\n• **Hosting:** Netlify Edge CDN (Global, SSL Secured)\n• Your project is live worldwide! You can ask me to re-deploy or update it anytime.`,
      mode: "build",
    };
    setMessages((m) => [...m, asst]);
    await persistMsg(activeId, asst);
  }

  /** Reveal freshly generated code in the editor with a live typing effect. */
  const animateCode = async (next: Files) => {
    const order: (keyof Files)[] = ["index.html", "styles.css", "script.js"];
    setRightTab("code");
    for (const name of order) {
      const full = next[name];
      if (!full) continue;
      setActiveFile(name);
      const steps = 26;
      const chunk = Math.max(24, Math.ceil(full.length / steps));
      for (let i = chunk; i < full.length; i += chunk) {
        setTyping({ file: name, text: full.slice(0, i) });
        const el = editorRef.current;
        if (el) el.scrollTop = el.scrollHeight;
        await new Promise((r) => setTimeout(r, 22));
      }
      setTyping({ file: name, text: full });
      await new Promise((r) => setTimeout(r, 120));
    }
    setTyping(null);
    setActiveFile("index.html");
    setRightTab("preview");
  };



  const [input, setInput] = useState("");
  const [mode, setMode] = useState<"build" | "plan">("build");
  const [modeFx, setModeFx] = useState(false);
  const [modeMenu, setModeMenu] = useState(false);
  const [attachments, setAttachments] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try { return localStorage.getItem("kenzo:sidebarCollapsed") === "true"; } catch { return false; }
  });
  const [mobileTab, setMobileTab] = useState<"chat" | "preview">("chat");
  const [viewingImage, setViewingImage] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [exportOpen, setExportOpen] = useState(false);
  const [zipping, setZipping] = useState(false);
  const [device, setDevice] = useState<"desktop" | "tablet" | "mobile">("desktop");
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [chatWidth, setChatWidth] = useState(416);
  const [dragging, setDragging] = useState(false);
  const [logs, setLogs] = useState<LogLine[]>([]);
  const [consoleOpen, setConsoleOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState("");
  const [shareOpen, setShareOpen] = useState(false);
  const [collabs, setCollabs] = useState<Array<{ id: string; email: string; role: string; status: string; display_name: string | null; avatar_url: string | null }>>([]);
  const [recording, setRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [steps, setSteps] = useState<string[]>([]);
  const [thinkOpen, setThinkOpen] = useState(true);
  const [elapsed, setElapsed] = useState(0);
  const [activeIdeaIndices, setActiveIdeaIndices] = useState<number[]>([0, 1, 2, 3]);
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [backgroundGeneratingProjectId, setBackgroundGeneratingProjectId] = useState<string | null>(null);
  const activeIdRef = useRef<string | null>(activeId);
  useEffect(() => { activeIdRef.current = activeId; }, [activeId]);

  const shuffleIdeas = useCallback(() => {
    const total = PROMPT_IDEAS.length;
    const indices: number[] = [];
    while (indices.length < 4) {
      const idx = Math.floor(Math.random() * total);
      if (!indices.includes(idx)) indices.push(idx);
    }
    setActiveIdeaIndices(indices);
  }, []);

  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    if (stepTimer.current) clearInterval(stepTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    stepTimer.current = null;
    tickTimer.current = null;
    setBusy(false);
    setBackgroundGeneratingProjectId(null);
    setTyping(null);
    toast.info("AI generation stopped", {
      description: "You stopped the AI. Your current progress and files have been preserved.",
    });
  }, []);

  const splitRef = useRef<HTMLElement | null>(null);
  const gutterRef = useRef<HTMLDivElement | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const logId = useRef(0);
  const rec = useRef<{ ctx: AudioContext; node: ScriptProcessorNode; src: MediaStreamAudioSourceNode; stream: MediaStream; chunks: Float32Array[] } | null>(null);

  const generate = useServerFn(generateCode);
  const plan = useServerFn(planWithAI);
  const transcribe = useServerFn(transcribeAudio);
  const claim = useServerFn(claimInvites);
  const askAccess = useServerFn(requestAccess);
  const fetchCollabs = useServerFn(listCollaborators);

  const activeProject = projects.find((p) => p.id === activeId) ?? null;
  const isOwner = !!(activeProject && user && activeProject.user_id === user.id);
  const canEdit = draft || isOwner || collabs.some((c) => c.role === "editor" && c.email.toLowerCase() === (user?.email ?? "").toLowerCase());
  const projectName = draft ? draftName : activeProject?.name ?? "";

  /* ---------- layout ---------- */
  useEffect(() => {
    const saved = Number(localStorage.getItem("kenzo:chatWidth"));
    if (saved >= 280 && saved <= 900) setChatWidth(saved);
  }, []);

  /* ---------- persist sidebar collapsed ---------- */
  useEffect(() => {
    try { localStorage.setItem("kenzo:sidebarCollapsed", String(sidebarCollapsed)); } catch {}
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (e: MouseEvent) => {
      const left = splitRef.current?.getBoundingClientRect().left ?? 0;
      const totalWidth = splitRef.current?.clientWidth ?? 1200;
      const minChat = 280;
      const minPreview = 360;
      const maxChat = Math.max(minChat, totalWidth - minPreview);
      const targetWidth = e.clientX - left;
      setChatWidth(Math.max(minChat, Math.min(maxChat, targetWidth)));
    };
    const onTouchMove = (e: TouchEvent) => {
      if (!e.touches?.[0]) return;
      const left = splitRef.current?.getBoundingClientRect().left ?? 0;
      const totalWidth = splitRef.current?.clientWidth ?? 1200;
      const minChat = 280;
      const minPreview = 360;
      const maxChat = Math.max(minChat, totalWidth - minPreview);
      const targetWidth = e.touches[0].clientX - left;
      setChatWidth(Math.max(minChat, Math.min(maxChat, targetWidth)));
    };
    const onUp = () => {
      setDragging(false);
      setChatWidth((w) => {
        try { localStorage.setItem("kenzo:chatWidth", String(w)); } catch {}
        return w;
      });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onTouchMove, { passive: true });
    window.addEventListener("touchend", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onTouchMove);
      window.removeEventListener("touchend", onUp);
    };
  }, [dragging]);

  const [visualEditMode, setVisualEditMode] = useState(false);
  const [codeViewMode, setCodeViewMode] = useState<"syntax" | "edit">("syntax");
  const [cursorPos, setCursorPos] = useState({ line: 1, col: 1 });

  /* ---------- console bridge & visual edit listener ---------- */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as any;
      if (!d) return;
      if (d.__kenzo === 1) {
        setLogs((prev) => [...prev.slice(-199), { id: ++logId.current, level: d.level ?? "log", text: d.text ?? "" }]);
      }
      if (d.__kenzo_visual_edit && d.newText) {
        const oldText = d.oldText;
        const newText = d.newText;
        setFiles((current) => {
          const raw = current["index.html"] || "";
          if (oldText && raw.includes(oldText)) {
            const next = raw.replace(oldText, newText);
            const nextFiles = { ...current, "index.html": next };
            scheduleSave(nextFiles);
            toast.success("Visual Edit Saved", {
              description: `"${oldText.slice(0, 24)}" → "${newText.slice(0, 24)}" updated in code`,
            });
            return nextFiles;
          } else if (oldText) {
            const trimmedOld = oldText.trim();
            const decodedOld = trimmedOld
              .replace(/&/g, "&amp;")
              .replace(/</g, "&lt;")
              .replace(/>/g, "&gt;");
            if (raw.includes(trimmedOld)) {
              const next = raw.replace(trimmedOld, newText);
              const nextFiles = { ...current, "index.html": next };
              scheduleSave(nextFiles);
              toast.success("Visual Edit Saved", {
                description: `"${trimmedOld.slice(0, 24)}" → "${newText.slice(0, 24)}" updated in code`,
              });
              return nextFiles;
            } else if (raw.includes(decodedOld)) {
              const next = raw.replace(decodedOld, newText);
              const nextFiles = { ...current, "index.html": next };
              scheduleSave(nextFiles);
              toast.success("Visual Edit Saved", {
                description: `"${trimmedOld.slice(0, 24)}" → "${newText.slice(0, 24)}" updated in code`,
              });
              return nextFiles;
            }
          }
          return current;
        });
      }
      if (d.__kenzo_open_publish) {
        setPublishMenuOpen(true);
      }
      if (d.__kenzo_open_github) {
        setGithubMenuOpen(true);
      }
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => {
    const iframe = document.querySelector('iframe[title="Preview"]') as HTMLIFrameElement | null;
    iframe?.contentWindow?.postMessage({ __toggle_visual_edit: visualEditMode }, "*");
  }, [visualEditMode, previewNonce]);

  /* ---------- boot ---------- */
  const wordCount = useMemo(() => (input.trim() ? input.trim().split(/\s+/).length : 0), [input]);

  /** Only the signed-in user's own projects plus ones explicitly shared with them. */
  const loadProjects = useCallback(async (uid?: string) => {
    const me = uid ?? (await supabase.auth.getUser()).data.user?.id;
    if (!me) return [] as ProjectRow[];

    const { data: shares } = await supabase
      .from("project_shares")
      .select("project_id")
      .eq("user_id", me);
    const sharedIds = (shares ?? []).map((s) => s.project_id as string);

    const base = () =>
      supabase
        .from("projects")
        .select("id, name, files, updated_at, user_id")
        .eq("is_draft", false)
        .order("updated_at", { ascending: false });

    const [own, shared] = await Promise.all([
      base().eq("user_id", me),
      sharedIds.length ? base().in("id", sharedIds) : Promise.resolve({ data: [] as unknown[] }),
    ]);

    const seen = new Set<string>();
    const rows: ProjectRow[] = [];
    for (const r of [...(own.data ?? []), ...(shared.data ?? [])] as ProjectRow[]) {
      if (seen.has(r.id)) continue;
      seen.add(r.id);
      rows.push(r);
    }
    return rows.sort((a, b) => (a.updated_at < b.updated_at ? 1 : -1));
  }, []);


  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUser({ id: u.user.id, email: u.user.email ?? undefined });
      try { await claim({}); } catch { /* ignore */ }

      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, ai_personality, ai_verbosity, ai_style, ai_model")
        .eq("id", u.user.id)
        .maybeSingle();
      setProfile(p as Profile | null);

      const list = await loadProjects(u.user.id);
      setProjects(list);

      const wanted = new URLSearchParams(window.location.search).get("project");
      if (wanted) {
        const found = list.find((x) => x.id === wanted);
        if (found) { openProject(found); return; }
        try {
          await askAccess({ data: { projectId: wanted } });
          toast.info("Access requested — the owner has been notified.");
        } catch { toast.error("That project link is not available."); }
      }

      // Restore last session: remember open project or fresh draft across reloads
      const remembered = localStorage.getItem("kenzo:activeProject");
      if (remembered === "draft") {
        startDraft();
        return;
      }
      if (remembered) {
        const found = list.find((x) => x.id === remembered);
        if (found) { openProject(found); return; }
      }
      if (list.length) openProject(list[0]);
      else startDraft();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, busy]);
  useEffect(() => { inputRef.current?.focus(); }, [activeId, draft]);

  useEffect(() => {
    if (!activeId || draft) { setCollabs([]); return; }
    fetchCollabs({ data: { projectId: activeId } })
      .then((r) => setCollabs(r.collaborators))
      .catch(() => setCollabs([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, draft]);

  /* ---------- background generation resilient sync ---------- */
  useEffect(() => {
    const handleSync = async () => {
      if (document.visibilityState === "visible" && activeId && !draft) {
        try {
          const { data: proj } = await supabase
            .from("projects")
            .select("id, name, files, updated_at")
            .eq("id", activeId)
            .single();
          if (proj?.files) {
            setFiles((prev) => {
              const prevStr = JSON.stringify(prev);
              const nextStr = JSON.stringify(proj.files);
              if (prevStr !== nextStr) {
                setPreviewNonce((n) => n + 1);
                return { ...DEFAULT_FILES, ...(proj.files as Files) };
              }
              return prev;
            });
            if (proj.name) {
              setProjects((prev) =>
                prev.map((p) => (p.id === activeId ? { ...p, name: proj.name, files: proj.files as Files } : p))
              );
            }
          }
          const { data: msgs } = await supabase
            .from("chat_messages")
            .select("id, role, content, mode, snapshot, feedback, attachments")
            .eq("project_id", activeId)
            .order("created_at");
          if (msgs && msgs.length) {
            setMessages((prev) => {
              if (msgs.length > prev.length) {
                setBusy(false);
                if (stepTimer.current) clearInterval(stepTimer.current);
                if (tickTimer.current) clearInterval(tickTimer.current);
                stepTimer.current = null;
                tickTimer.current = null;
                return msgs as Msg[];
              }
              return prev;
            });
          }
        } catch {
          // ignore background sync errors
        }
      }
    };
    document.addEventListener("visibilitychange", handleSync);
    window.addEventListener("focus", handleSync);
    return () => {
      document.removeEventListener("visibilitychange", handleSync);
      window.removeEventListener("focus", handleSync);
    };
  }, [activeId, draft]);

  /* ---------- projects ---------- */
  async function openProject(p: ProjectRow) {
    setDraft(false);
    setActiveId(p.id);
    activeIdRef.current = p.id;
    setFiles({ ...DEFAULT_FILES, ...(p.files as Files) });
    setLogs([]);
    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, content, mode, snapshot, feedback, attachments")
      .eq("project_id", p.id)
      .order("created_at");
    setMessages((data ?? []) as Msg[]);
    setSidebarOpen(false);
    setPreviewNonce((n) => n + 1);
    if (backgroundGeneratingProjectId === p.id) {
      setBusy(true);
    } else {
      setBusy(false);
    }
    try { localStorage.setItem("kenzo:activeProject", p.id); } catch {}
  }

  /** A new project lives only in memory until the first prompt is sent. */
  function startDraft() {
    if (draft && messages.length === 0) {
      toast.info("You already have an empty new project — describe it to get started.");
      inputRef.current?.focus();
      return;
    }
    setDraft(true);
    setActiveId(null);
    activeIdRef.current = null;
    setDraftName("New project");
    setMessages([]);
    setFiles(DEFAULT_FILES);
    setLogs([]);
    setBusy(false);
    setSidebarOpen(false);
    try { localStorage.setItem("kenzo:activeProject", "draft"); } catch {}
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function renameProject(name: string) {
    if (draft) { setDraftName(name); return; }
    if (!activeId) return;
    setProjects((prev) => prev.map((p) => (p.id === activeId ? { ...p, name } : p)));
    await supabase.from("projects").update({ name }).eq("id", activeId);
  }

  async function confirmDelete() {
    const id = deleteTarget?.id;
    if (!id) return;
    setDeleteTarget(null);
    await supabase.from("projects").delete().eq("id", id);
    const rest = projects.filter((p) => p.id !== id);
    setProjects(rest);
    if (activeId === id) {
      if (rest.length) openProject(rest[0]);
      else startDraft();
    }
    toast.success("Project deleted");
  }

  function scheduleSave(next: Files) {
    if (!activeId || draft) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      await supabase.from("projects").update({ files: next }).eq("id", activeId);
    }, 500);
  }

  function updateFile(name: keyof Files, value: string) {
    const next = { ...files, [name]: value };
    setFiles(next);
    scheduleSave(next);
  }

  /* ---------- chat ---------- */
  async function persistMsg(projectId: string, m: Msg) {
    if (!user) return;
    await supabase.from("chat_messages").insert({
      id: m.id,
      project_id: projectId,
      user_id: user.id,
      role: m.role,
      content: m.content,
      mode: m.mode ?? "build",
      snapshot: m.snapshot ?? null,
      attachments: m.attachments ?? [],
    });
  }

  const BUILD_STEPS = [
    "Reading your request",
    "Reviewing the current files",
    "Designing the layout & styles",
    "Writing HTML, CSS and JavaScript",
    "Polishing details and responsiveness",
    "Finishing up",
  ];
  const PLAN_STEPS = [
    "Reading your request",
    "Exploring approaches",
    "Shaping the sections",
    "Choosing palette & typography",
    "Writing the plan",
  ];

  function startSteps(kind: "build" | "plan") {
    const list = kind === "plan" ? PLAN_STEPS : BUILD_STEPS;
    setSteps([list[0]!]);
    setElapsed(0);
    setThinkOpen(true);
    let i = 1;
    stepTimer.current = setInterval(() => {
      if (i >= list.length) return;
      const next = list[i++]!;
      setSteps((s) => [...s, next]);
    }, 4500);
    tickTimer.current = setInterval(() => setElapsed((e) => e + 1), 1000);
  }

  function stopSteps() {
    if (stepTimer.current) clearInterval(stepTimer.current);
    if (tickTimer.current) clearInterval(tickTimer.current);
    stepTimer.current = null;
    tickTimer.current = null;
  }

  useEffect(() => () => stopSteps(), []);

  async function run(prompt: string, imgs: string[], history: Msg[]) {

    if (!user) return;

    // Materialise a draft project on the first real prompt.
    let projectId = activeId;
    if (draft || !projectId) {
      const { data, error } = await supabase
        .from("projects")
        .insert({ user_id: user.id, name: prompt.slice(0, 48) || "New project", files, is_draft: false })
        .select("id, name, files, updated_at, user_id")
        .single();
      if (error) { toast.error(error.message); return; }
      const row = data as ProjectRow;
      projectId = row.id;
      setProjects((prev) => [row, ...prev]);
      setActiveId(row.id);
      setDraft(false);
      try { localStorage.setItem("kenzo:activeProject", row.id); } catch {}
    }

    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: prompt, mode, attachments: imgs };
    setMessages((m) => [...m, userMsg]);
    abortControllerRef.current = new AbortController();
    setBusy(true);
    setBackgroundGeneratingProjectId(projectId);
    activeIdRef.current = projectId;
    startSteps(mode);
    await persistMsg(projectId, userMsg);

    try {
      const isSidebarRequest =
        /\b(open|show|toggle)\b.*\b(sidebar|menu|projects?\s*list|drawer)\b/i.test(prompt) ||
        /^(show|open)\s+(the\s+)?(sidebar|projects|menu)$/i.test(prompt.trim()) ||
        /^(sidebar|projects?\s*list)$/i.test(prompt.trim());

      if (isSidebarRequest) {
        setSidebarOpen(true);
        if (sidebarCollapsed) setSidebarCollapsed(false);
        const asst: Msg = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `I've opened the sidebar for you! Here you can browse and search your projects, create new ones, or access your settings.`,
          mode: "build",
        };
        setMessages((m) => [...m, asst]);
        await persistMsg(projectId, asst);
        stopSteps();
        setBusy(false);
        return;
      }

      const isDeployRequest =
        /\b(deploy|publish|host|launch|go live)\b.*\b(website|site|app|project|netlify)?\b/i.test(prompt) ||
        /\b(netlify)\b.*\b(deploy|publish|url|link)\b/i.test(prompt) ||
        /\b(give|show|what is|get|where is)\b.*\b(live|publish(ed)?|deploy(ed)?)\b.*\b(url|link|site|website)\b/i.test(prompt);

      if (isDeployRequest) {
        if (livePublishUrl && /\b(url|link|what is|give|show|where)\b/i.test(prompt) && !/\b(re-deploy|re-publish|deploy|publish)\b/i.test(prompt)) {
          const asst: Msg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Here is your live website URL:\n🔗 [${livePublishUrl}](${livePublishUrl})\n\n• **Status:** Published & Live Worldwide`,
            mode: "build",
          };
          setMessages((m) => [...m, asst]);
          await persistMsg(projectId, asst);
          stopSteps();
          setBusy(false);
          return;
        }

        try {
          const netlifyConn = (await checkNetlifyConnection()) as { connected: boolean };
          if (!netlifyConn.connected) {
            setPublishMenuOpen(true);
            const asst: Msg = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠️ **Netlify is not connected yet.**\n\nTo publish your website to a live URL:\n1. Click **Connect Netlify** in the dialog that just opened (or visit **Settings → Deployments & GitHub**).\n2. Once connected, prompt me: **"deploy website"**, and I will instantly publish your site and provide your live URL!`,
              mode: "build",
            };
            setMessages((m) => [...m, asst]);
            await persistMsg(projectId, asst);
            return;
          }

          toast.info("Deploying website to Netlify...");
          const res = await publishToNetlifyServerFn({ data: { projectId } });
          const url = res?.url ?? null;
          if (url) setLivePublishUrl(url);

          toast.success("Website is live!", {
            description: url ?? undefined,
            action: url
              ? {
                  label: "Open Site",
                  onClick: () => window.open(url, "_blank"),
                }
              : undefined,
          });

          const asst: Msg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `🎉 **Website successfully deployed and live!**\n\nHere is your live website URL:\n🔗 [${url}](${url})\n\n• **Live URL:** \`${url}\`\n• **Hosting:** Netlify Edge CDN (Global, SSL Secured)\n• All files (\`index.html\`, \`styles.css\`, \`script.js\`) are deployed. You can re-deploy anytime by asking me to **"deploy website"**!`,
            mode: "build",
          };
          setMessages((m) => [...m, asst]);
          await persistMsg(projectId, asst);
          return;
        } catch (netErr: any) {
          const errMsg = netErr?.message || "Failed to deploy website";
          toast.error(errMsg);
          const asst: Msg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ **Deployment encountered an issue:** ${errMsg}\n\nYou can also click the rocket icon in the header toolbar to check deploy history or reconfigure settings.`,
            mode: "build",
          };
          setMessages((m) => [...m, asst]);
          await persistMsg(projectId, asst);
          return;
        } finally {
          stopSteps();
          setBusy(false);
          inputRef.current?.focus();
        }
      }

      if (quota && !quota.isAdmin && !quota.hasUserKey && quota.remaining <= 0) {
        const asst: Msg = {
          id: crypto.randomUUID(),
          role: "assistant",
          content: `⚠️ **Daily Prompt Limit Reached (3/3 Free Prompts Used)**\n\nTo continue building without limits, please add your free personal Gemini API key in **Settings → API Keys & Giveaway**.\n\nPersonal keys are 100% free from Google AI Studio and grant unlimited daily builds!`,
          mode: "build",
        };
        setMessages((m) => [...m, asst]);
        await persistMsg(projectId, asst);
        stopSteps();
        setBusy(false);
        return;
      }

      const isGithubPushRequest =
        /\b(push|sync|export|upload|commit|send)\b.*\b(github|repo|repository)\b/i.test(prompt) ||
        /\b(github)\b.*\b(push|sync|export|repo|repository|url|link)\b/i.test(prompt) ||
        /\b(give|show|what is|get|where is)\b.*\b(github)\b.*\b(url|link|repo)\b/i.test(prompt);

      if (isGithubPushRequest) {
        if (githubRepoUrl && /\b(url|link|what is|give|show|where)\b/i.test(prompt) && !/\b(push|sync|export|re-push)\b/i.test(prompt)) {
          const asst: Msg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `Here is your GitHub repository URL:\n🔗 [${githubRepoUrl}](${githubRepoUrl})\n\n• **Repository:** \`${githubRepoName || "GitHub Repository"}\`\n• **Clone:** \`git clone ${githubRepoUrl}.git\``,
            mode: "build",
          };
          setMessages((m) => [...m, asst]);
          await persistMsg(projectId, asst);
          stopSteps();
          setBusy(false);
          return;
        }

        try {
          const ghConn = await checkGithubConnection();
          if (!ghConn.connected) {
            setGithubMenuOpen(true);
            const asst: Msg = {
              id: crypto.randomUUID(),
              role: "assistant",
              content: `⚠️ **GitHub is not connected yet.**\n\nTo push this project to your GitHub and get your live repository URL:\n1. Click **Connect GitHub Account** in the dialog that just opened (or click the GitHub icon in the top toolbar).\n2. Once connected, prompt me again: **"push to github"**, and I will automatically commit your project and provide the live repository URL!`,
              mode: "build",
            };
            setMessages((m) => [...m, asst]);
            await persistMsg(projectId, asst);
            return;
          }

          const slug = (projectName || "kenzo-app")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");

          toast.info("Pushing to your GitHub account...");
          const res = await pushToGithubServerFn({
            data: {
              projectId,
              repoName: slug || "kenzo-app",
              isNew: true,
              isPrivate: false,
              description: `${projectName} — built with Kenzo AI`,
            },
          });

          setGithubRepoUrl(res.repoUrl);
          setGithubRepoName(res.repoFullName);

          toast.success(`Pushed to GitHub: ${res.repoFullName}`, {
            description: res.repoUrl,
            action: {
              label: "Open Repo",
              onClick: () => window.open(res.repoUrl, "_blank"),
            },
          });

          const asst: Msg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `🎉 **Successfully pushed to GitHub!**\n\nHere is your live GitHub repository URL:\n🔗 [${res.repoUrl}](${res.repoUrl})\n\n• **Repository:** \`${res.repoFullName}\`\n• **Clone Command:**\n\`\`\`bash\ngit clone ${res.repoUrl}.git\n\`\`\`\n• All files (\`index.html\`, \`styles.css\`, \`script.js\`, and \`README.md\`) have been committed directly to your GitHub repository.`,
            mode: "build",
          };
          setMessages((m) => [...m, asst]);
          await persistMsg(projectId, asst);
          return;
        } catch (ghErr: any) {
          const errMsg = ghErr?.message || "Failed to push to GitHub";
          toast.error(errMsg);
          const asst: Msg = {
            id: crypto.randomUUID(),
            role: "assistant",
            content: `⚠️ **GitHub push encountered an issue:** ${errMsg}\n\nYou can also click the **GitHub** icon in the header toolbar to configure repository details and retry.`,
            mode: "build",
          };
          setMessages((m) => [...m, asst]);
          await persistMsg(projectId, asst);
          return;
        } finally {
          stopSteps();
          setBusy(false);
          inputRef.current?.focus();
        }
      }

      if (mode === "plan") {
        const r = await plan({
          data: {
            prompt,
            images: imgs,
            currentFiles: files as unknown as Record<string, string>,
            history: history
              .filter((h) => h.role === "user" || h.role === "assistant")
              .slice(-10)
              .map((h) => ({ role: h.role as "user" | "assistant", content: h.content })),
          },
        });
        const asst: Msg = { id: crypto.randomUUID(), role: "assistant", content: r.text, mode: "plan" };
        setMessages((m) => [...m, asst]);
        await persistMsg(projectId, asst);
        return;
      }

      const lastPlan = [...history].reverse().find((h) => h.role === "assistant" && h.mode === "plan");
      const result = await generate({
        data: {
          projectId,
          prompt,
          images: imgs,
          plan: lastPlan?.content,
          currentFiles: files,
          personality: profile?.ai_personality,
          verbosity: profile?.ai_verbosity,
          style: profile?.ai_style,
          model: profile?.ai_model,
        },
      });

      const nextFiles: Files = {
        "index.html": result.html || files["index.html"],
        "styles.css": result.css || files["styles.css"],
        "script.js": result.js ?? files["script.js"],
      };
      await supabase.from("projects").update({ files: nextFiles, assets: collectAssets(nextFiles) }).eq("id", projectId);

      if (result.name) {
        setProjects((prev) => prev.map((p) => (p.id === projectId ? { ...p, name: result.name as string } : p)));
        await supabase.from("projects").update({ name: result.name }).eq("id", projectId);
      }
      if (result.memory?.length) toast.success(`Remembered: ${result.memory[0]}`);

      const asst: Msg = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: result.summary || "Done.",
        mode: "build",
        snapshot: nextFiles,
      };
      await persistMsg(projectId, asst);

      if (activeIdRef.current === projectId) {
        setFiles(nextFiles);
        setLogs([]);
        void animateCode(nextFiles);
        setMessages((m) => [...m, asst]);
        setPreviewNonce((n) => n + 1);
        setMobileTab("preview");
      } else {
        setProjects((prev) =>
          prev.map((p) =>
            p.id === projectId
              ? { ...p, files: nextFiles, name: (result.name as string) || p.name }
              : p
          )
        );
        const pName = (result.name as string) || projectName || "Project";
        toast.success(`Kenzo finished building "${pName}"!`, {
          description: "Your project is ready in the background.",
          action: {
            label: "Open Project",
            onClick: () => {
              const target = projects.find((p) => p.id === projectId) || {
                id: projectId,
                name: pName,
                files: nextFiles,
                updated_at: new Date().toISOString(),
                user_id: user?.id || "",
              };
              openProject(target as ProjectRow);
            },
          },
          duration: 9000,
        });
      }
    } catch (err: any) {
      if (err?.name === "AbortError" || abortControllerRef.current === null) {
        return;
      }
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg);
      if (activeIdRef.current === projectId) {
        setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${msg}` }]);
      }
    } finally {
      abortControllerRef.current = null;
      stopSteps();
      setBackgroundGeneratingProjectId(null);
      if (activeIdRef.current === projectId) {
        setBusy(false);
        inputRef.current?.focus();
      }
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy || !user) return;
    if (isQuotaExhausted) {
      toast.info("Daily prompt limit reached (3/3). Add your free Gemini API key in Settings to enjoy unlimited building!");
      return;
    }
    if (prompt.length > MAX_CHARS) {
      toast.error(`Prompt exceeds maximum limit of ${MAX_CHARS.toLocaleString()} characters.`);
      return;
    }
    if (!draft && !canEdit) return toast.error("You have view-only access to this project.");
    const imgs = attachments;
    setInput("");
    setAttachments([]);
    await run(prompt, imgs, messages);
  }

  /** Save an edited prompt: drop everything after it and re-run. */
  async function saveEdit(m: Msg) {
    const text = editText.trim();
    setEditingId(null);
    if (!text || text === m.content) return;
    const idx = messages.findIndex((x) => x.id === m.id);
    const keep = messages.slice(0, idx);
    const drop = messages.slice(idx).map((x) => x.id);
    setMessages(keep);
    if (activeId) await supabase.from("chat_messages").delete().in("id", drop);
    await run(text, m.attachments ?? [], keep);
  }

  async function react(m: Msg, value: "up" | "down") {
    const next = m.feedback === value ? null : value;
    setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, feedback: next } : x)));
    await supabase.from("chat_messages").update({ feedback: next }).eq("id", m.id);
    if (next) toast.success(next === "up" ? "Thanks for the feedback!" : "Noted — I'll do better.");
  }

  async function restore(m: Msg) {
    if (!m.snapshot) return;
    setFiles(m.snapshot);
    setPreviewNonce((n) => n + 1);
    if (activeId) await supabase.from("projects").update({ files: m.snapshot }).eq("id", activeId);
    toast.success("Restored this version of the code");
  }

  /* ---------- voice ---------- */
  async function startRecording() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const ctx = new AudioContext();
      const src = ctx.createMediaStreamSource(stream);
      const node = ctx.createScriptProcessor(4096, 1, 1);
      const chunks: Float32Array[] = [];
      node.onaudioprocess = (e) => chunks.push(new Float32Array(e.inputBuffer.getChannelData(0)));
      src.connect(node);
      node.connect(ctx.destination);
      rec.current = { ctx, node, src, stream, chunks };
      setRecording(true);
    } catch {
      toast.error("Microphone access is needed to record.");
    }
  }

  async function stopRecording() {
    const r = rec.current;
    rec.current = null;
    setRecording(false);
    if (!r) return;
    r.stream.getTracks().forEach((t) => t.stop());
    r.node.disconnect();
    r.src.disconnect();
    const blob = encodeWav(r.chunks, r.ctx.sampleRate);
    await r.ctx.close();
    if (blob.size < 4096) return toast.error("That recording was too short — try again.");
    setTranscribing(true);
    try {
      const b64 = await blobToBase64(blob);
      const { text } = await transcribe({ data: { audio: b64, mime: "audio/wav" } });
      setInput((v) => (v ? `${v} ${text}` : text));
      inputRef.current?.focus();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Transcription failed");
    } finally {
      setTranscribing(false);
    }
  }

  /* ---------- images ---------- */
  async function onPickImages(list: FileList | null) {
    if (!list?.length) return;
    const picked: string[] = [];
    for (const f of Array.from(list).slice(0, 4)) {
      if (!f.type.startsWith("image/")) continue;
      if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is larger than 5 MB`); continue; }
      picked.push(await fileToDataUrl(f));
    }
    if (picked.length) setAttachments((a) => [...a, ...picked].slice(0, 4));
  }

  async function handlePaste(e: React.ClipboardEvent<HTMLTextAreaElement>) {
    const items = e.clipboardData?.items;
    if (!items) return;
    const imgFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.type && item.type.startsWith("image/")) {
        const file = item.getAsFile();
        if (file) imgFiles.push(file);
      }
    }
    if (imgFiles.length > 0) {
      e.preventDefault();
      const picked: string[] = [];
      const remaining = 4 - attachments.length;
      for (const f of imgFiles.slice(0, remaining)) {
        if (f.size > 5 * 1024 * 1024) { toast.error(`${f.name} is larger than 5 MB`); continue; }
        picked.push(await fileToDataUrl(f));
      }
      if (picked.length) {
        setAttachments((a) => [...a, ...picked].slice(0, 4));
        toast.info("Image pasted from clipboard");
      }
      return;
    }

    const pastedText = e.clipboardData?.getData("text");
    if (pastedText && pastedText.length + input.length > MAX_CHARS) {
      e.preventDefault();
      const allowed = Math.max(0, MAX_CHARS - input.length);
      if (allowed > 0) {
        setInput((prev) => prev + pastedText.slice(0, allowed));
        toast.info(`Pasted text clamped to ${MAX_CHARS.toLocaleString()} character limit.`);
      } else {
        toast.error(`Character limit of ${MAX_CHARS.toLocaleString()} reached.`);
      }
    }
  }

  function fixErrorWithAi(errText: string) {
    const prompt = `Please fix this runtime error in the app:\n\`\`\`\n${errText.slice(0, 600)}\n\`\`\``;
    setInput(prompt);
    setMobileTab("chat");
    setConsoleOpen(false);
    setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  }

  async function takeScreenshot() {
    try {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        toast.info("Please use file upload or paste (Ctrl+V) to attach your screenshot.");
        fileInputRef.current?.click();
        return;
      }
      toast.info("Select the window or screen tab to capture...");
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
      });
      const track = stream.getVideoTracks()[0];
      if (!track) return;

      const video = document.createElement("video");
      video.srcObject = stream;
      await video.play();

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth || 1280;
      canvas.height = video.videoHeight || 720;
      const ctx = canvas.getContext("2d");
      ctx?.drawImage(video, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL("image/png");

      track.stop();
      stream.getTracks().forEach((t) => t.stop());

      if (dataUrl && dataUrl.length > 100) {
        setAttachments((prev) => [...prev, dataUrl].slice(0, 4));
        setMobileTab("chat");
        if (!input.trim()) {
          setInput("Please inspect this screenshot of the UI, identify any visual or functional errors, and fix them in the code:");
        }
        setTimeout(() => {
          inputRef.current?.focus();
          inputRef.current?.scrollIntoView({ behavior: "smooth" });
        }, 100);
        toast.success("Screenshot captured and attached!");
      }
    } catch (e: any) {
      if (e?.name !== "NotAllowedError") {
        fileInputRef.current?.click();
      }
    }
  }

  /* ---------- export ---------- */
  function projectSlug() {
    return (projectName || "kenzo-app").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "kenzo-app";
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  async function downloadZip() {
    try {
      setZipping(true);
      const { default: JSZip } = await import("jszip");
      const zip = new JSZip();
      zip.file("index.html", files["index.html"]);
      zip.file("styles.css", files["styles.css"]);
      zip.file("script.js", files["script.js"]);
      zip.file("README.md", `# ${projectName || "Kenzo app"}\n\nGenerated with Kenzo.\n\n## Run locally\n\nOpen \`index.html\` in your browser, or serve the folder:\n\n\`\`\`bash\nnpx serve .\n\`\`\`\n`);
      triggerDownload(await zip.generateAsync({ type: "blob" }), `${projectSlug()}.zip`);
      toast.success("Downloaded project ZIP");
    } catch {
      toast.error("Could not build the ZIP file");
    } finally {
      setZipping(false);
      setExportOpen(false);
    }
  }

  function downloadSingleHtml() {
    triggerDownload(new Blob([buildSrcDoc(files, false)], { type: "text/html" }), `${projectSlug()}.html`);
    toast.success("Downloaded single-file HTML");
    setExportOpen(false);
  }

  function formatCurrentFile() {
    const raw = files[activeFile];
    if (!raw) return;
    try {
      const lines = raw.split("\n");
      let indent = 0;
      const formatted = lines
        .map((line) => {
          const trimmed = line.trim();
          if (trimmed.startsWith("</") || trimmed.startsWith("}") || trimmed.startsWith("]")) {
            indent = Math.max(0, indent - 1);
          }
          const res = "  ".repeat(indent) + trimmed;
          if (
            (trimmed.startsWith("<") &&
              !trimmed.startsWith("</") &&
              !trimmed.endsWith("/>") &&
              !trimmed.includes("</")) ||
            trimmed.endsWith("{") ||
            trimmed.endsWith("[")
          ) {
            indent++;
          }
          return res;
        })
        .join("\n");
      updateFile(activeFile, formatted);
      toast.success(`Formatted ${activeFile}`);
    } catch {
      toast.error("Could not format file");
    }
  }

  function openExternalPreview() {
    const w = window.open("", "_blank");
    if (!w) {
      toast.error("Popup blocked — please allow popups for external preview");
      return;
    }
    const currentDoc = buildSrcDoc(files, visualEditMode);
    const projTitle = projectName || "Kenzo App";

    const externalHtml = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${projTitle} — Live Preview | Kenzo</title>
  <link rel="icon" type="image/svg+xml" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🚀</text></svg>">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      background: #0b0c10;
      color: #f8fafc;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      height: 100vh;
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }
    header {
      height: 54px;
      background: rgba(18, 20, 29, 0.95);
      backdrop-filter: blur(12px);
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 16px;
      z-index: 100;
    }
    .brand-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .logo-badge {
      display: flex;
      align-items: center;
      gap: 8px;
      font-weight: 700;
      font-size: 15px;
      color: #ffffff;
    }
    .logo-badge span {
      background: linear-gradient(135deg, #6366f1, #a855f7);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
    }
    .project-name {
      font-size: 13px;
      font-weight: 500;
      color: #94a3b8;
      border-left: 1px solid rgba(255, 255, 255, 0.12);
      padding-left: 12px;
      max-width: 220px;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .device-controls {
      display: flex;
      align-items: center;
      background: rgba(0, 0, 0, 0.4);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 3px;
      gap: 3px;
    }
    .device-btn {
      background: transparent;
      border: 0;
      color: #94a3b8;
      font-size: 12px;
      font-weight: 500;
      padding: 5px 12px;
      border-radius: 6px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .device-btn:hover { color: #fff; }
    .device-btn.active {
      background: rgba(255, 255, 255, 0.12);
      color: #ffffff;
      box-shadow: 0 1px 3px rgba(0,0,0,0.2);
    }
    .actions-section {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .status-pill {
      display: flex;
      align-items: center;
      gap: 6px;
      font-size: 11px;
      font-weight: 600;
      color: #10b981;
      background: rgba(16, 185, 129, 0.1);
      border: 1px solid rgba(16, 185, 129, 0.25);
      padding: 4px 10px;
      border-radius: 9999px;
    }
    .status-dot {
      width: 6px;
      height: 6px;
      border-radius: 50%;
      background: #10b981;
      box-shadow: 0 0 8px #10b981;
      animation: pulse 2s infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.5; transform: scale(0.85); } }
    .publish-btn {
      display: inline-flex;
      align-items: center;
      gap: 7px;
      background: linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%);
      color: #ffffff;
      font-weight: 600;
      font-size: 13px;
      padding: 7px 18px;
      border-radius: 8px;
      border: none;
      cursor: pointer;
      box-shadow: 0 4px 14px rgba(99, 102, 241, 0.35);
      transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    }
    .publish-btn:hover {
      transform: translateY(-1px);
      box-shadow: 0 6px 20px rgba(99, 102, 241, 0.5);
      opacity: 0.95;
    }
    .publish-btn:active {
      transform: translateY(0);
    }
    .preview-canvas {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 16px;
      overflow: auto;
      background: radial-gradient(circle at 50% 50%, #151722 0%, #0b0c10 100%);
    }
    .frame-wrapper {
      width: 100%;
      height: 100%;
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      background: #ffffff;
      border-radius: 12px;
      box-shadow: 0 20px 40px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.08);
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }
    iframe {
      width: 100%;
      height: 100%;
      border: none;
      background: #ffffff;
    }
    .modal-overlay {
      display: none;
      position: fixed;
      inset: 0;
      background: rgba(0,0,0,0.75);
      backdrop-filter: blur(6px);
      z-index: 999;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal-card {
      background: #181a24;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 16px;
      max-width: 440px;
      width: 100%;
      padding: 24px;
      box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
      text-align: left;
    }
    .modal-title { font-size: 18px; font-weight: 700; color: #fff; margin-bottom: 8px; }
    .modal-desc { font-size: 13px; color: #94a3b8; line-height: 1.5; margin-bottom: 20px; }
    .deploy-option {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 14px;
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 10px;
      margin-bottom: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .deploy-option:hover {
      background: rgba(255,255,255,0.08);
      border-color: #6366f1;
    }
    .deploy-btn-text { font-size: 14px; font-weight: 600; color: #fff; }
    .deploy-btn-sub { font-size: 11px; color: #94a3b8; }
    .close-btn {
      width: 100%;
      padding: 10px;
      border-radius: 8px;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.1);
      color: #94a3b8;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      margin-top: 8px;
    }
    .close-btn:hover { color: #fff; background: rgba(255,255,255,0.1); }
  </style>
</head>
<body>
  <header>
    <div class="brand-section">
      <div class="logo-badge">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="color:#6366f1"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>
        <span>Kenzo</span>
      </div>
      <div class="project-name">${projTitle}</div>
    </div>

    <div class="device-controls">
      <button class="device-btn active" onclick="setViewport('desktop', this)">Desktop</button>
      <button class="device-btn" onclick="setViewport('tablet', this)">Tablet (768px)</button>
      <button class="device-btn" onclick="setViewport('mobile', this)">Mobile (375px)</button>
    </div>

    <div class="actions-section">
      <div class="status-pill">
        <div class="status-dot"></div>
        <span>Live Staging</span>
      </div>
      <button class="publish-btn" onclick="openPublishModal()">
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/></svg>
        Publish
      </button>
    </div>
  </header>

  <main class="preview-canvas">
    <div id="frameWrapper" class="frame-wrapper" style="max-width: 100%;">
      <iframe id="previewIframe" title="Live Preview"></iframe>
    </div>
  </main>

  <div id="publishModal" class="modal-overlay" onclick="if(event.target===this)closePublishModal()">
    <div class="modal-card">
      <h3 class="modal-title">Publish & Deploy Website</h3>
      <p class="modal-desc">Launch your website live worldwide on high-speed global Edge CDN or push directly to GitHub.</p>
      
      <div class="deploy-option" onclick="deployNetlify()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#25c2a0" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="m4.93 4.93 4.24 4.24"/><path d="m14.83 9.17 4.24-4.24"/><path d="m14.83 14.83 4.24 4.24"/><path d="m9.17 14.83-4.24 4.24"/></svg>
        <div>
          <div class="deploy-btn-text">Publish to Netlify</div>
          <div class="deploy-btn-sub">Instant global SSL hosting & live public link</div>
        </div>
      </div>

      <div class="deploy-option" onclick="deployGithub()">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#6366f1" stroke-width="2"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22"/></svg>
        <div>
          <div class="deploy-btn-text">Push to GitHub</div>
          <div class="deploy-btn-sub">Commit all 3 files + README to your GitHub repo</div>
        </div>
      </div>

      <button class="close-btn" onclick="closePublishModal()">Close</button>
    </div>
  </div>

  <script>
    var currentDoc = ${JSON.stringify(currentDoc)};
    var iframe = document.getElementById('previewIframe');
    iframe.srcdoc = currentDoc;

    function setViewport(device, btn) {
      document.querySelectorAll('.device-btn').forEach(function(b){ b.classList.remove('active'); });
      btn.classList.add('active');
      var wrapper = document.getElementById('frameWrapper');
      if (device === 'mobile') {
        wrapper.style.maxWidth = '375px';
      } else if (device === 'tablet') {
        wrapper.style.maxWidth = '768px';
      } else {
        wrapper.style.maxWidth = '100%';
      }
    }

    function openPublishModal() {
      document.getElementById('publishModal').style.display = 'flex';
    }

    function closePublishModal() {
      document.getElementById('publishModal').style.display = 'none';
    }

    function deployNetlify() {
      if (window.opener) {
        window.opener.postMessage({ __kenzo_open_publish: true }, '*');
        window.opener.focus();
        closePublishModal();
      } else {
        alert("Please return to the Kenzo editor tab to complete Netlify publication!");
      }
    }

    function deployGithub() {
      if (window.opener) {
        window.opener.postMessage({ __kenzo_open_github: true }, '*');
        window.opener.focus();
        closePublishModal();
      } else {
        alert("Please return to the Kenzo editor tab to push to GitHub!");
      }
    }
  </script>
</body>
</html>`;

    w.document.open();
    w.document.write(externalHtml);
    w.document.close();
  }

  async function copyActiveFile() {
    await navigator.clipboard.writeText(files[activeFile]);
    toast.success(`${activeFile} copied`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const srcDoc = useMemo(() => buildSrcDoc(files, visualEditMode), [files, visualEditMode]);
  const assets = useMemo(() => collectAssets(files), [files]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? projects.filter((p) => p.name.toLowerCase().includes(q)) : projects;
  }, [projects, query]);
  const errorCount = logs.filter((l) => l.level === "error").length;

  /* Code/preview/console only appear once the chat has started AND we are in Build mode. */
  const workspaceVisible = messages.length > 0 && mode === "build";

  /* ---------- greeting + mode switching + composer ---------- */

  const displayName = profile?.display_name?.trim() || "";
  const firstName = (displayName || "there").split(" ")[0];
  const greeting = mode === "plan" ? `Let's plan it out, ${firstName}` : `What should we build, ${firstName}?`;

  /** Switch Plan <-> Build with a short cross-fade, optionally prefilling the box. */
  function switchMode(next: "build" | "plan", prefill?: string) {
    if (next === mode && !prefill) return;
    setModeFx(true);
    setMode(next);
    if (prefill) setInput(prefill);
    setModeMenu(false);
    window.setTimeout(() => setModeFx(false), 420);
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  const charCount = input.length;
  const overLimit = charCount > MAX_CHARS;
  const isQuotaExhausted = Boolean(quota && !quota.isAdmin && !quota.hasUserKey && quota.remaining <= 0);

  const composer = (
    <form
      onSubmit={send}
      className={`rounded-2xl glass-strong border border-glass-border shadow-lift transition-all duration-300 ${modeFx ? "scale-[0.985] opacity-70" : "scale-100 opacity-100"} ${mode === "plan" ? "ring-1 ring-primary/30" : ""}`}
    >
      {isQuotaExhausted && (
        <div className="mx-3 mt-3 p-3 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2 text-amber-500 font-medium">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            <span>Daily free limit reached (3/3 prompts used). Add your free Gemini API key in Settings to enjoy unlimited prompts!</span>
          </div>
          <Link
            to="/settings"
            className="shrink-0 px-3 py-1.5 rounded-lg gradient-brand text-primary-foreground font-semibold hover:opacity-90 transition active:scale-95 text-xs"
          >
            Add Key
          </Link>
        </div>
      )}

      {attachments.length > 0 && (
        <div className="flex gap-2 flex-wrap px-3 pt-3">
          {attachments.map((src, i) => (
            <div key={i} className="relative group/thumb">
              <img
                src={src}
                alt="Attachment"
                onClick={() => setViewingImage(src)}
                className="h-14 w-14 rounded-lg object-cover border border-glass-border cursor-pointer hover:opacity-80 transition"
                title="Click to view full size"
              />
              <button
                type="button"
                aria-label="Remove attachment"
                onClick={() => setAttachments((a) => a.filter((_, j) => j !== i))}
                className="absolute -top-1.5 -right-1.5 rounded-full bg-background border border-glass-border p-0.5 hover:bg-surface transition"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <textarea
        ref={inputRef}
        value={input}
        maxLength={MAX_CHARS}
        disabled={busy || isQuotaExhausted}
        onChange={(e) => {
          if (e.target.value.length <= MAX_CHARS) {
            setInput(e.target.value);
          }
        }}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
        }}
        rows={3}
        placeholder={
          isQuotaExhausted
            ? "Daily free prompt limit reached. Add your Gemini API key in Settings to continue…"
            : mode === "plan"
            ? "Describe the idea — Kenzo will plan it first…"
            : "Describe what to build or change… (you can paste images)"
        }
        className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none placeholder:text-muted-foreground disabled:opacity-60"
      />

      {recording && (
        <div
          onClick={() => void stopRecording()}
          className="mx-3 mb-2 px-3 py-1.5 rounded-xl bg-destructive/15 border border-destructive/30 flex items-center gap-2 text-xs text-destructive animate-pulse cursor-pointer hover:bg-destructive/20 transition"
          title="Click to finish speaking"
        >
          <span className="h-2 w-2 rounded-full bg-destructive animate-ping shrink-0" />
          <span className="font-medium">Listening... Speak your prompt naturally (click to finish)</span>
        </div>
      )}
      {transcribing && (
        <div className="mx-3 mb-2 px-3 py-1.5 rounded-xl bg-primary/15 border border-primary/30 flex items-center gap-2 text-xs text-primary font-medium animate-pulse">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Transcribing speech with AI...</span>
        </div>
      )}

      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onPickImages(e.target.files); e.currentTarget.value = ""; }} />
        <IconBtn label="Attach images" onClick={() => fileInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></IconBtn>
        <IconBtn label="Capture screenshot of UI / error" onClick={takeScreenshot}><Camera className="h-4 w-4" /></IconBtn>
        <IconBtn
          label={recording ? "Stop recording" : "Record voice"}
          active={recording}
          onClick={() => (recording ? void stopRecording() : void startRecording())}
        >
          {transcribing ? <Loader2 className="h-4 w-4 animate-spin" /> : recording ? <Square className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
        </IconBtn>

        <div className="relative">
          <button
            type="button"
            onClick={() => setModeMenu((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-glass-border px-2.5 py-1.5 text-xs font-medium hover:bg-surface transition active:scale-95"
          >
            {mode === "plan" ? <ClipboardList className="h-3.5 w-3.5 text-primary" /> : <Hammer className="h-3.5 w-3.5 text-primary" />}
            {mode === "plan" ? "Plan" : "Build"}
            <ChevronDown className={`h-3 w-3 text-muted-foreground transition-transform ${modeMenu ? "rotate-180" : ""}`} />
          </button>
          {modeMenu && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setModeMenu(false)} />
              <div className="absolute bottom-full left-0 mb-2 z-50 w-56 rounded-xl glass-strong border border-glass-border shadow-lift p-1 animate-fade-in-up">
                {([["build", Hammer, "Build", "Write the code right away"], ["plan", ClipboardList, "Plan", "Shape the idea first"]] as const).map(([key, Icon, label, desc]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => switchMode(key)}
                    className={`w-full flex items-start gap-3 rounded-lg px-3 py-2 text-left transition hover:bg-surface ${mode === key ? "bg-primary/10" : ""}`}
                  >
                    <Icon className="h-4 w-4 mt-0.5 text-primary" />
                    <span>
                      <span className="block text-sm font-medium text-foreground">{label}</span>
                      <span className="block text-[11px] text-muted-foreground">{desc}</span>
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className="ml-auto flex items-center gap-2">
          {quota && !quota.isAdmin && !quota.hasUserKey && (
            <span className="text-[11px] text-muted-foreground hidden sm:inline">
              Daily: {quota.remaining}/{quota.dailyLimit} free
            </span>
          )}
          <span className={`text-[11px] tabular-nums ${charCount >= MAX_CHARS ? "text-destructive font-semibold" : charCount > 5500 ? "text-amber-500 font-medium" : "text-muted-foreground"}`}>
            {charCount > 0 ? `${charCount.toLocaleString()} / ${MAX_CHARS.toLocaleString()} chars` : ""}
            {charCount >= MAX_CHARS ? " (Max)" : ""}
          </span>
        </div>

        {busy ? (
          <button
            type="button"
            onClick={stopGeneration}
            aria-label="Force stop AI"
            title="Force stop AI generation"
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-destructive hover:bg-destructive/90 text-destructive-foreground shadow-lift transition active:scale-95 animate-pulse"
          >
            <Square className="h-4 w-4 fill-current" />
          </button>
        ) : (
          <button
            type="submit"
            disabled={!input.trim() || overLimit || isQuotaExhausted}
            aria-label="Send message"
            title={isQuotaExhausted ? "Daily giveaway prompt limit reached" : "Send message"}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg gradient-brand text-primary-foreground shadow-lift transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
          >
            <Send className="h-4 w-4" />
          </button>
        )}
      </div>
    </form>
  );

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Dragging overlay to prevent iframe mouse trapping */}
      {dragging && (
        <div
          className="fixed inset-0 z-[99999] cursor-col-resize select-none pointer-events-auto bg-transparent"
          onMouseUp={() => setDragging(false)}
          onTouchEnd={() => setDragging(false)}
        />
      )}
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-[105] bg-background/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={`fixed lg:static z-[110] top-0 h-full glass-strong border-r border-glass-border transition-all duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 flex flex-col w-72 sm:w-80 max-w-[85vw] ${sidebarCollapsed ? "lg:w-16" : "lg:w-72"}`}
      >
        <div className="p-4 flex items-center justify-between gap-2 border-b border-glass-border/60">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden lg:inline-flex items-center gap-2 hover:opacity-80 transition"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Logo showWordmark={!sidebarCollapsed} />
          </button>
          <div className="lg:hidden flex items-center gap-2">
            <Logo showWordmark={true} />
          </div>
          <button className="lg:hidden p-2 rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground transition" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
        </div>

        <button
          onClick={() => { startDraft(); setSidebarOpen(false); }}
          title="New project"
          className={`mx-3 mb-3 inline-flex items-center justify-center gap-2 rounded-lg gradient-brand py-2 text-sm font-medium text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-[0.98] ${sidebarCollapsed ? "lg:px-0" : "px-3"}`}
        >
          <Plus className="h-4 w-4" /> <span className={sidebarCollapsed ? "lg:hidden" : ""}>New project</span>
        </button>

        <div className={`px-3 pb-2 ${sidebarCollapsed ? "lg:hidden" : ""}`}>
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search projects"
              className="w-full rounded-lg bg-input border border-border pl-8 pr-3 py-1.5 text-xs outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
            />
          </div>
        </div>

        <div className="flex-1 overflow-auto px-2">
          {draft && (
            <div className={`flex items-center gap-2 rounded-lg mb-1 px-3 py-2 text-sm bg-primary/10 text-muted-foreground italic ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Untitled draft
            </div>
          )}
          {filtered.length === 0 && !draft && (
            <div className={`px-4 py-6 text-center text-sm text-muted-foreground ${sidebarCollapsed ? "lg:hidden" : ""}`}>
              {query ? "No projects match that search." : "No projects yet. Create your first one!"}
            </div>
          )}
          {filtered.map((p) => {
            const isGenerating = backgroundGeneratingProjectId === p.id;
            const isActive = activeId === p.id && !draft;
            return (
              <div
                key={p.id}
                className={`group flex items-center justify-between gap-1.5 rounded-lg mb-1 px-2.5 py-2 text-xs transition cursor-pointer ${
                  isActive
                    ? "bg-primary/15 text-primary font-semibold border-l-2 border-primary shadow-xs"
                    : "hover:bg-surface/80 text-foreground/85 hover:text-foreground"
                } ${sidebarCollapsed ? "lg:justify-center lg:px-0" : ""}`}
                onClick={() => { openProject(p); setSidebarOpen(false); }}
                title={p.name}
              >
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  {isGenerating ? (
                    <Loader2 className="h-3.5 w-3.5 shrink-0 text-primary animate-spin" />
                  ) : (
                    <FileCode
                      className={`h-3.5 w-3.5 shrink-0 transition ${
                        isActive ? "text-primary" : "text-muted-foreground group-hover:text-primary"
                      }`}
                    />
                  )}
                  <span className={`truncate ${sidebarCollapsed ? "lg:hidden" : ""}`}>
                    {p.name}
                  </span>
                  {isGenerating && !sidebarCollapsed && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary/20 text-primary font-medium shrink-0 animate-pulse">
                      Building...
                    </span>
                  )}
                </div>
                {p.user_id === user?.id && !sidebarCollapsed && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteTarget({ id: p.id, name: p.name });
                    }}
                    aria-label={`Delete ${p.name}`}
                    title="Delete project"
                    className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-1 rounded hover:bg-destructive/15 text-muted-foreground hover:text-destructive transition shrink-0"
                  >
                    <Trash2 className="h-3 w-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <div className="p-3 border-t border-glass-border space-y-1">
          <div className={`px-2 py-2 text-xs font-medium text-muted-foreground truncate ${sidebarCollapsed ? "lg:hidden" : ""}`}>
            {profile?.display_name || "My Account"}
          </div>
          <Link
            to="/settings"
            title="Settings"
            onClick={() => setSidebarOpen(false)}
            className={`flex items-center gap-2 rounded-lg py-2 text-sm hover:bg-surface transition ${sidebarCollapsed ? "lg:justify-center lg:px-0 px-3" : "px-3"}`}
          >
            <Settings className="h-4 w-4 shrink-0" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Settings</span>
          </Link>
          <button
            onClick={() => { signOut(); setSidebarOpen(false); }}
            title="Log out"
            className={`w-full flex items-center gap-2 rounded-lg py-2 text-sm hover:bg-surface transition ${sidebarCollapsed ? "lg:justify-center lg:px-0 px-3" : "px-3"}`}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            <span className={sidebarCollapsed ? "lg:hidden" : ""}>Log out</span>
          </button>
        </div>
      </aside>

      {/* Main */}
      <main ref={splitRef} className="flex-1 flex flex-col lg:flex-row min-w-0">
        {/* Chat */}
        <section
          className={`min-h-0 ${
            workspaceVisible
              ? mobileTab === "chat"
                ? "flex flex-col flex-1 w-full lg:shrink-0 border-r border-glass-border"
                : "hidden lg:flex lg:flex-col lg:shrink-0 border-r border-glass-border"
              : "flex flex-col flex-1 w-full"
          }`}
          data-chat-panel={workspaceVisible ? "" : undefined}
        >
          {workspaceVisible && <style>{`@media (min-width:1024px){[data-chat-panel]{width:${chatWidth}px}}`}</style>}


          <div className="p-2">
            <div className="h-12 flex items-center gap-2 px-2.5 rounded-xl glass border border-glass-border">
              <button
                type="button"
                className="lg:hidden shrink-0 p-2 rounded-lg bg-surface/60 border border-glass-border hover:bg-surface text-foreground transition active:scale-95 z-10"
                onClick={() => setSidebarOpen(true)}
                aria-label="Open sidebar menu"
                title="Open sidebar"
              >
                <Menu className="h-4 w-4" />
              </button>
              <input
                value={projectName}
                onChange={(e) => renameProject(e.target.value)}
                aria-label="Project name"
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none focus:bg-input rounded-lg px-2 py-1 transition truncate"
              />
              {backgroundGeneratingProjectId && backgroundGeneratingProjectId !== activeId && (
                <button
                  type="button"
                  onClick={() => {
                    const found = projects.find((p) => p.id === backgroundGeneratingProjectId);
                    if (found) openProject(found);
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/15 text-primary border border-primary/30 text-[11px] font-medium animate-pulse cursor-pointer shrink-0"
                  title="Kenzo is actively building another project in the background. Click to view."
                >
                  <Loader2 className="h-3 w-3 animate-spin shrink-0" />
                  <span className="hidden sm:inline">Building in background...</span>
                </button>
              )}
              {!draft && collabs.length > 0 && <Avatars people={collabs} onAdd={() => setShareOpen(true)} />}
              {!draft && collabs.length === 0 && (
                <button onClick={() => setShareOpen(true)} title="Share project" className="p-2 rounded-lg hover:bg-surface transition active:scale-95">
                  <Share2 className="h-4 w-4" />
                </button>
              )}
              {workspaceVisible && (
                <div className="flex lg:hidden items-center bg-input rounded-lg p-0.5 ml-auto mr-1">
                  <button
                    type="button"
                    onClick={() => setMobileTab("chat")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${mobileTab === "chat" ? "gradient-brand text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileTab("preview")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${mobileTab === "preview" ? "gradient-brand text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> Preview</span>
                  </button>
                </div>
              )}
              <NotificationBell userId={user?.id ?? null} />
            </div>
          </div>

          {messages.length === 0 ? (
            /* ---------- Empty state: centered greeting + composer ---------- */
            <div className="flex-1 min-h-0 overflow-auto flex flex-col items-center justify-center px-4 pb-8">
              <div className="w-full max-w-2xl text-center animate-fade-in-up">
                <h2 className="text-3xl sm:text-4xl font-semibold tracking-tight">
                  {greeting}
                </h2>
                <p className="mt-3 text-sm text-muted-foreground">
                  {mode === "plan"
                    ? "Tell Kenzo the idea — it will shape the plan first."
                    : "Describe an app, drop a screenshot, or speak it. Kenzo writes the code."}
                </p>
                <div className="mt-7 text-left">{composer}</div>
                <div className="mt-8 w-full text-left">
                  <div className="flex items-center justify-between mb-3 px-1">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" /> Suggested Projects
                    </span>
                    <button
                      type="button"
                      onClick={shuffleIdeas}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs text-muted-foreground hover:text-foreground rounded-lg hover:bg-surface/80 border border-transparent hover:border-glass-border transition active:scale-95 cursor-pointer"
                      title="Explore more project ideas"
                    >
                      <Shuffle className="h-3 w-3" />
                      <span>More ideas</span>
                    </button>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    {activeIdeaIndices.map((idx) => {
                      const item = PROMPT_IDEAS[idx] ?? PROMPT_IDEAS[0];
                      const IconComp = item.icon;
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => {
                            setInput(item.prompt);
                            inputRef.current?.focus();
                          }}
                          className="group flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl glass-subtle border border-glass-border/70 hover:border-primary/50 hover:bg-surface/90 text-left transition-all duration-200 active:scale-[0.99] cursor-pointer shadow-2xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0 flex-1">
                            <div className={`p-1.5 rounded-lg bg-gradient-to-br ${item.color} border shrink-0 transition-transform group-hover:scale-105 shadow-2xs`}>
                              <IconComp className="h-3.5 w-3.5" />
                            </div>
                            <span className="text-xs font-semibold text-foreground group-hover:text-primary transition shrink-0">
                              {item.title}
                            </span>
                            <span className="text-muted-foreground/40 text-[10px] hidden sm:inline shrink-0">·</span>
                            <span className="text-[11px] text-muted-foreground truncate hidden sm:inline">
                              {item.subtitle}
                            </span>
                          </div>
                          <div className="opacity-40 group-hover:opacity-100 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all text-primary shrink-0">
                            <ArrowUpRight className="h-3.5 w-3.5" />
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 overflow-auto px-4 sm:px-6 py-4 space-y-6 min-h-0">

            {messages.map((m) => (
              <div key={m.id} className="animate-fade-in-up group">
                {m.role === "user" ? (
                  <div className="flex flex-col items-end gap-1">
                    {editingId === m.id ? (
                      <div className="w-full">
                        <textarea
                          value={editText}
                          onChange={(e) => setEditText(e.target.value)}
                          rows={3}
                          className="w-full resize-none rounded-xl bg-input border border-primary/40 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-primary/25"
                        />
                        <div className="mt-1 flex justify-end gap-2">
                          <button onClick={() => setEditingId(null)} className="rounded-lg px-3 py-1.5 text-xs hover:bg-surface transition">Cancel</button>
                          <button onClick={() => saveEdit(m)} className="inline-flex items-center gap-1 rounded-lg gradient-brand px-3 py-1.5 text-xs font-medium text-primary-foreground transition active:scale-95">
                            <Check className="h-3 w-3" /> Save & rerun
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {!!m.attachments?.length && (
                          <div className="flex gap-1.5 flex-wrap justify-end">
                            {m.attachments.map((src, i) => (
                              <img
                                key={i}
                                src={src}
                                alt="Attachment"
                                onClick={() => setViewingImage(src)}
                                className="h-16 w-16 rounded-lg object-cover border border-glass-border cursor-pointer hover:opacity-80 transition"
                                title="Click to view full size"
                              />
                            ))}
                          </div>
                        )}
                        <div className="inline-block max-w-[92%] rounded-2xl px-4 py-2.5 text-sm bg-primary text-primary-foreground shadow-lift">
                          <div className="whitespace-pre-wrap break-words text-left">{m.content}</div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                          <IconBtn label="Copy prompt" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Prompt copied"); }}><Copy className="h-3 w-3" /></IconBtn>
                          <IconBtn label="Edit prompt" onClick={() => { setEditingId(m.id); setEditText(m.content); }}><Pencil className="h-3 w-3" /></IconBtn>
                        </div>
                      </>
                    )}
                  </div>
                ) : (
                  <div>
                    {m.mode === "plan" && (
                      <div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-glass-border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-primary">
                        <ClipboardList className="h-3 w-3" /> Plan
                      </div>
                    )}
                    <div
                      className={`prose-kenzo break-words text-[15px] leading-7 text-foreground/90 ${m.mode === "plan" ? "font-serif" : ""}`}
                      dangerouslySetInnerHTML={{ __html: md(m.content) }}
                    />
                    <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition">
                      <IconBtn label="Copy response" onClick={() => { navigator.clipboard.writeText(m.content); toast.success("Copied"); }}><Copy className="h-3 w-3" /></IconBtn>
                      <IconBtn label="Good response" active={m.feedback === "up"} onClick={() => react(m, "up")}><ThumbsUp className="h-3 w-3" /></IconBtn>
                      <IconBtn label="Bad response" active={m.feedback === "down"} onClick={() => react(m, "down")}><ThumbsDown className="h-3 w-3" /></IconBtn>
                      {m.snapshot && (
                        <button onClick={() => restore(m)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:text-foreground hover:bg-surface transition active:scale-95">
                          <History className="h-3 w-3" /> Restore
                        </button>
                      )}
                      {m.mode === "plan" && (
                        <button onClick={() => switchMode("build", "Build the plan above.")} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-primary hover:bg-surface transition active:scale-95">
                          <Hammer className="h-3 w-3" /> Build this
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {busy && (
              <div className="animate-fade-in-up">
                <div className="rounded-2xl glass overflow-hidden">
                  <div className="flex w-full items-center gap-2 px-4 py-2.5 text-sm">
                    <button
                      type="button"
                      onClick={() => setThinkOpen((v) => !v)}
                      aria-expanded={thinkOpen}
                      className="flex items-center gap-2 flex-1 text-left transition hover:opacity-80"
                    >
                      <span className="thinking-dot" />
                      <span className="thinking-dot" style={{ animationDelay: "150ms" }} />
                      <span className="thinking-dot" style={{ animationDelay: "300ms" }} />
                      <span className="ml-1 text-muted-foreground font-medium">
                        {mode === "plan" ? "Kenzo is planning…" : "Kenzo is building…"}
                      </span>
                      <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${thinkOpen ? "rotate-180" : ""}`} />
                    </button>
                    <span className="tabular-nums text-[11px] text-muted-foreground mr-1">
                      {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                    </span>
                    <button
                      type="button"
                      onClick={stopGeneration}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-destructive/15 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-medium transition active:scale-95 border border-destructive/30"
                      title="Force stop AI generation"
                    >
                      <Square className="h-3 w-3 fill-current" />
                      <span>Stop</span>
                    </button>
                  </div>
                  {thinkOpen && (
                    <ul className="space-y-1.5 border-t border-glass-border px-4 py-3 text-[12px]">
                      {steps.map((s, i) => {
                        const active = i === steps.length - 1;
                        return (
                          <li key={s} className="flex items-center gap-2 animate-fade-in-up">
                            {active ? (
                              <Loader2 className="h-3 w-3 shrink-0 animate-spin text-primary" />
                            ) : (
                              <Check className="h-3 w-3 shrink-0 text-primary" />
                            )}
                            <span className={active ? "text-foreground" : "text-muted-foreground"}>{s}</span>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>
            )}

              <div ref={chatEndRef} />
            </div>
          )}

          {messages.length > 0 && <div className="px-3 sm:px-4 pb-3">{composer}</div>}

        </section>

        {/* Drag handle */}
        {workspaceVisible && (
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize chat and preview panels"
          onMouseDown={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onTouchStart={() => setDragging(true)}
          onDoubleClick={() => {
            const def = 420;
            setChatWidth(def);
            try { localStorage.setItem("kenzo:chatWidth", String(def)); } catch {}
            toast.info("Panel width reset to default");
          }}
          className={`hidden lg:flex w-2 shrink-0 cursor-col-resize items-center justify-center relative select-none group ${
            dragging ? "bg-primary/30" : "hover:bg-primary/20"
          } transition-colors z-20`}
          title="Drag to resize chat and preview · Double-click to reset"
        >
          <div
            className={`h-12 w-1 rounded-full transition-all ${
              dragging
                ? "bg-primary shadow-[0_0_8px_rgba(99,102,241,0.8)] scale-y-125"
                : "bg-border group-hover:bg-primary/70"
            }`}
          />
        </div>
        )}

        {/* Code + Preview */}
        {workspaceVisible && (
        <section
          className={`flex-1 flex flex-col min-w-0 min-h-0 animate-fade-in-up ${
            mobileTab === "preview" ? "flex" : "hidden lg:flex"
          }`}
        >
          <div className="p-2">

            <div className="h-12 flex items-center justify-between gap-1.5 px-2 rounded-xl glass border border-glass-border overflow-hidden">
              <div className="flex items-center gap-1.5 min-w-0 shrink-0">
                <button
                  type="button"
                  className="lg:hidden shrink-0 p-2 rounded-lg bg-surface/60 border border-glass-border hover:bg-surface text-foreground transition active:scale-95 mr-0.5 z-10"
                  onClick={() => setSidebarOpen(true)}
                  aria-label="Open sidebar menu"
                  title="Open sidebar"
                >
                  <Menu className="h-4 w-4" />
                </button>
                <div className="flex lg:hidden items-center bg-input rounded-lg p-0.5 mr-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => setMobileTab("chat")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${mobileTab === "chat" ? "gradient-brand text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className="flex items-center gap-1"><MessageSquare className="h-3 w-3" /> Chat</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMobileTab("preview")}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition ${mobileTab === "preview" ? "gradient-brand text-primary-foreground shadow-xs" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <span className="flex items-center gap-1"><Monitor className="h-3 w-3" /> Preview</span>
                  </button>
                </div>
                <div className="flex gap-1 rounded-lg bg-input p-1 shrink-0">
                  {([["preview", Monitor, "Preview"], ["code", FileCode, "Code"], ["assets", FolderTree, "Files"]] as const).map(([k, Icon, label]) => (
                    <button
                      key={k}
                      onClick={() => setRightTab(k)}
                      title={label}
                      aria-label={label}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-medium rounded-md transition active:scale-95 cursor-pointer shrink-0 ${
                        rightTab === k
                          ? "gradient-brand text-primary-foreground shadow-xs"
                          : "hover:bg-surface text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <Icon className="h-3.5 w-3.5 shrink-0" />
                      <span className="hidden 2xl:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={takeScreenshot}
                  title="Capture screenshot to fix UI errors"
                  aria-label="Capture screenshot"
                  className="p-2 rounded-lg hover:bg-surface transition active:scale-95 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <GithubMenu
                  projectId={activeId}
                  projectName={projectName}
                  isOpen={githubMenuOpen}
                  onOpenChange={setGithubMenuOpen}
                  onPushed={handleGithubPushed}
                />
                <PublishMenu
                  projectId={activeId}
                  isOpen={publishMenuOpen}
                  onOpenChange={setPublishMenuOpen}
                  onPublished={handleWebsitePublished}
                />
                {rightTab === "preview" && (
                  <div className="hidden xl:flex gap-1 rounded-lg bg-input p-1 mr-0.5 shrink-0">
                    {([["desktop", Monitor, "Desktop"], ["tablet", Tablet, "Tablet"], ["mobile", Smartphone, "Mobile"]] as const).map(([key, Icon, label]) => (
                      <button key={key} onClick={() => setDevice(key)} title={label} aria-label={label} className={`p-1.5 rounded-md transition active:scale-95 ${device === key ? "gradient-brand text-primary-foreground" : "hover:bg-surface text-muted-foreground"}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </button>
                    ))}
                  </div>
                )}
                <button
                  onClick={() => setConsoleOpen((v) => !v)}
                  title="Console"
                  aria-label="Toggle console"
                  className={`relative p-2 rounded-lg transition active:scale-95 shrink-0 ${consoleOpen ? "bg-primary/15 text-primary" : "hover:bg-surface text-muted-foreground hover:text-foreground"}`}
                >
                  <Terminal className="h-4 w-4" />
                  {errorCount > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] grid place-items-center">{errorCount}</span>}
                </button>
                <button onClick={() => { setLogs([]); setPreviewNonce((n) => n + 1); }} title="Refresh preview" aria-label="Refresh preview" className="p-2 rounded-lg hover:bg-surface transition active:scale-95 text-muted-foreground hover:text-foreground shrink-0">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={openExternalPreview}
                  title="Open live preview in a new tab with Publish toolbar"
                  aria-label="Open preview in a new tab"
                  className="p-2 rounded-lg hover:bg-surface transition active:scale-95 text-muted-foreground hover:text-foreground shrink-0"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
                {rightTab === "preview" && (
                  <button
                    type="button"
                    onClick={() => setVisualEditMode((v) => !v)}
                    title={`Visual Editing: ${visualEditMode ? "Active" : "Click to enable"}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition active:scale-95 border cursor-pointer shrink-0 ${
                      visualEditMode
                        ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40 shadow-xs ring-1 ring-emerald-500/30 font-semibold"
                        : "hover:bg-surface text-muted-foreground border-glass-border hover:text-foreground"
                    }`}
                  >
                    <Pencil className="h-3.5 w-3.5 shrink-0" />
                    <span className="hidden 2xl:inline">Visual Edit</span>
                  </button>
                )}
                <div className="relative">
                  <button onClick={() => setExportOpen((v) => !v)} title="Download" aria-label="Download" className="inline-flex items-center gap-1 p-2 rounded-lg hover:bg-surface transition active:scale-95">
                    {zipping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
                    <ChevronDown className="h-3 w-3 text-muted-foreground" />
                  </button>
                  {exportOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setExportOpen(false)} />
                      <div className="absolute right-0 mt-2 w-60 z-50 rounded-xl glass-strong border border-glass-border shadow-lift p-1 animate-fade-in-up">
                        <button onClick={downloadZip} className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface transition">
                          <FileArchive className="h-4 w-4 mt-0.5 text-primary" />
                          <span>
                            <span className="block text-sm font-medium">Download ZIP</span>
                            <span className="block text-xs text-muted-foreground">All 3 files + README</span>
                          </span>
                        </button>
                        <button onClick={downloadSingleHtml} className="w-full flex items-start gap-3 rounded-lg px-3 py-2.5 text-left hover:bg-surface transition">
                          <FileText className="h-4 w-4 mt-0.5 text-primary" />
                          <span>
                            <span className="block text-sm font-medium">Single HTML file</span>
                            <span className="block text-xs text-muted-foreground">CSS + JS inlined</span>
                          </span>
                        </button>
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="flex-1 min-h-0 flex flex-col">
            {rightTab === "code" && (
              <div className="flex-1 flex flex-col min-h-0 bg-[#1e1e1e] text-[#d4d4d4] font-mono select-none">
                {/* VS Code Tab Bar */}
                <div className="flex items-center justify-between gap-1 px-2 bg-[#252526] border-b border-[#333333] shrink-0 h-10 overflow-hidden">
                  <div className="flex gap-1 overflow-x-auto h-full scrollbar-none">
                    {(["index.html", "styles.css", "script.js"] as const).map((name) => {
                      const isActive = activeFile === name;
                      return (
                        <button
                          key={name}
                          onClick={() => setActiveFile(name)}
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap px-3 h-full text-xs font-medium transition cursor-pointer shrink-0 ${
                            isActive
                              ? "bg-[#1e1e1e] text-[#ffffff] border-t-2 border-[#007acc] shadow-xs"
                              : "text-[#969696] hover:text-[#cccccc] hover:bg-[#2a2d2e] border-t-2 border-transparent"
                          }`}
                        >
                          {name === "index.html" ? (
                            <span className="text-[#e44d26] font-bold text-[10px]">HTML</span>
                          ) : name === "styles.css" ? (
                            <span className="text-[#264de4] font-bold text-[10px]">CSS</span>
                          ) : (
                            <span className="text-[#f7df1e] font-bold text-[10px]">JS</span>
                          )}
                          <span className="truncate max-w-[100px]">{name}</span>
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-1 pr-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setVisualEditMode((v) => !v)}
                      title={`Visual Editing: ${visualEditMode ? "Active" : "Click to enable"}`}
                      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-sans font-medium transition active:scale-95 cursor-pointer shrink-0 ${
                        visualEditMode
                          ? "bg-emerald-500/25 text-emerald-400 border border-emerald-500/40"
                          : "text-[#969696] hover:text-[#ffffff] hover:bg-[#2a2d2e]"
                      }`}
                    >
                      <Pencil className="h-3 w-3 shrink-0" />
                      <span className="hidden 2xl:inline">Visual Edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={formatCurrentFile}
                      title="Format Code (Prettier indent)"
                      className="inline-flex items-center gap-1 px-2 py-1 rounded text-[11px] font-sans font-medium text-[#969696] hover:text-[#ffffff] hover:bg-[#2a2d2e] transition active:scale-95 cursor-pointer shrink-0"
                    >
                      <Wand2 className="h-3 w-3 shrink-0" />
                      <span className="hidden 2xl:inline">Format</span>
                    </button>
                    <button
                      onClick={copyActiveFile}
                      title="Copy file code"
                      className="p-1.5 rounded text-[#969696] hover:text-[#ffffff] hover:bg-[#2a2d2e] transition active:scale-95 shrink-0"
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

                {/* VS Code Breadcrumb navigation */}
                <div className="px-4 py-1 text-[11px] text-[#858585] bg-[#1e1e1e] border-b border-[#2d2d2d] flex items-center justify-between shrink-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-primary font-medium">kenzo</span>
                    <span className="text-[#555]">›</span>
                    <span>src</span>
                    <span className="text-[#555]">›</span>
                    <span className="text-[#ffffff] font-semibold flex items-center gap-1">
                      {activeFile === "index.html" ? (
                        <span className="text-[#e44d26] text-[10px]">●</span>
                      ) : activeFile === "styles.css" ? (
                        <span className="text-[#264de4] text-[10px]">●</span>
                      ) : (
                        <span className="text-[#f7df1e] text-[10px]">●</span>
                      )}
                      {activeFile}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-[10px] text-[#858585]">
                    <span>{(new Blob([files[activeFile]]).size / 1024).toFixed(1)} KB</span>
                    <span>{files[activeFile].split("\n").length} lines</span>
                  </div>
                </div>

                {/* VS Code Editor & Gutter */}
                <div className="flex-1 min-h-0 flex bg-[#1e1e1e] overflow-hidden relative">
                  <div
                    aria-hidden
                    ref={gutterRef}
                    className="hidden sm:block select-none overflow-hidden border-r border-[#2d2d2d] px-3 py-4 text-right font-mono text-[12px] leading-relaxed text-[#858585]/70 shrink-0 bg-[#1e1e1e]"
                  >
                    {editorValue.split("\n").map((_, i) => (
                      <div
                        key={i}
                        className={cursorPos.line === i + 1 ? "text-[#ffffff] font-bold" : ""}
                      >
                        {i + 1}
                      </div>
                    ))}
                  </div>

                  <div className="relative flex-1 min-h-0 overflow-auto bg-[#1e1e1e]">
                    {/* Syntax highlight underlay */}
                    <pre
                      aria-hidden
                      className="absolute inset-0 m-0 p-4 font-mono text-[12px] leading-relaxed pointer-events-none whitespace-pre overflow-hidden text-[#d4d4d4]"
                      dangerouslySetInnerHTML={{
                        __html: highlightSyntax(editorValue, activeFile),
                      }}
                    />

                    {/* Interactive Editor textarea */}
                    <textarea
                      key={activeFile}
                      ref={editorRef}
                      readOnly={isTyping}
                      value={editorValue}
                      onChange={(e) => updateFile(activeFile, e.target.value)}
                      onScroll={(e) => {
                        if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop;
                        const pre = e.currentTarget.previousElementSibling as HTMLElement | null;
                        if (pre) {
                          pre.scrollTop = e.currentTarget.scrollTop;
                          pre.scrollLeft = e.currentTarget.scrollLeft;
                        }
                      }}
                      onKeyUp={(e) => {
                        const s = e.currentTarget.selectionStart;
                        const lines = e.currentTarget.value.slice(0, s).split("\n");
                        setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
                      }}
                      onClick={(e) => {
                        const s = e.currentTarget.selectionStart;
                        const lines = e.currentTarget.value.slice(0, s).split("\n");
                        setCursorPos({ line: lines.length, col: lines[lines.length - 1].length + 1 });
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Tab") {
                          e.preventDefault();
                          const el = e.currentTarget;
                          const s = el.selectionStart;
                          updateFile(activeFile, files[activeFile].slice(0, s) + "  " + files[activeFile].slice(el.selectionEnd));
                          requestAnimationFrame(() => { el.selectionStart = el.selectionEnd = s + 2; });
                        }
                      }}
                      spellCheck={false}
                      className="absolute inset-0 w-full h-full resize-none bg-transparent font-mono text-[12px] p-4 outline-none border-0 leading-relaxed text-transparent caret-white selection:bg-[#264f78] selection:text-white"
                      style={{ tabSize: 2 }}
                    />
                  </div>
                </div>

                {/* VS Code Status Bar (Footer) */}
                <div className="h-6 bg-[#007acc] text-white flex items-center justify-between px-3 text-[11px] font-sans select-none shrink-0 font-medium">
                  <div className="flex items-center gap-3">
                    <span className="flex items-center gap-1 font-mono text-[10px]">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M6 3v12"/><circle cx="18" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><path d="M18 9a9 9 0 0 1-9 9"/></svg>
                      main
                    </span>
                    <button
                      type="button"
                      onClick={() => setVisualEditMode((v) => !v)}
                      className="flex items-center gap-1 hover:underline cursor-pointer"
                      title="Visual Editing: Click any text directly on the website to edit"
                    >
                      <Pencil className="h-2.5 w-2.5" />
                      <span>Visual Edit: {visualEditMode ? "ON" : "OFF"}</span>
                    </button>
                    <span>0 errors</span>
                  </div>
                  <div className="flex items-center gap-4 text-[10px] font-mono">
                    <span>Ln {cursorPos.line}, Col {cursorPos.col}</span>
                    <span className="hidden sm:inline">Spaces: 2</span>
                    <span className="hidden sm:inline">UTF-8</span>
                    <span className="font-bold">
                      {activeFile === "index.html" ? "HTML" : activeFile === "styles.css" ? "CSS" : "JavaScript"}
                    </span>
                  </div>
                </div>
              </div>
            )}

            {rightTab === "assets" && (
              <div className="flex-1 overflow-auto p-4">
                <h3 className="text-sm font-semibold mb-1">Project files & assets</h3>
                <p className="text-xs text-muted-foreground mb-4">Everything this site is made of, including remote images and fonts.</p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {(["index.html", "styles.css", "script.js"] as const).map((name) => {
                    const Icon = name === "index.html" ? FileText : name === "styles.css" ? Palette : FileCode;
                    return (
                      <button key={name} onClick={() => { setActiveFile(name); setRightTab("code"); }} className="flex items-center gap-3 rounded-xl glass p-3 text-left hover:bg-surface transition active:scale-[0.99]">
                        <Icon className="h-4 w-4 text-primary shrink-0" />
                        <span className="min-w-0">
                          <span className="block text-sm font-medium truncate">{name}</span>
                          <span className="block text-[11px] text-muted-foreground">{(new Blob([files[name]]).size / 1024).toFixed(1)} KB</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <h4 className="text-xs uppercase tracking-wider text-muted-foreground mt-6 mb-2">Remote assets ({assets.length})</h4>
                {assets.length === 0 && <p className="text-sm text-muted-foreground">No external images or fonts yet — ask Kenzo to add real photos.</p>}
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {assets.map((a) => (
                    <div key={a.url} className="rounded-xl glass overflow-hidden">
                      {a.kind === "image" ? (
                        <img src={a.url} alt="" loading="lazy" className="h-28 w-full object-cover bg-surface" />
                      ) : (
                        <div className="h-28 grid place-items-center bg-surface text-muted-foreground"><ImageIcon className="h-6 w-6" /></div>
                      )}
                      <div className="p-2">
                        <p className="text-[11px] truncate" title={a.url}>{a.url}</p>
                        <div className="mt-1 flex items-center justify-between">
                          <span className="text-[10px] text-muted-foreground">{a.kind} · {a.file}</span>
                          <button onClick={() => { navigator.clipboard.writeText(a.url); toast.success("URL copied"); }} className="p-1 rounded hover:bg-surface transition" aria-label="Copy URL">
                            <Copy className="h-3 w-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {rightTab === "preview" && (
              <div className="flex-1 min-h-0 flex flex-col bg-surface overflow-hidden relative">
                <div className="flex-1 min-h-0 flex items-start justify-center overflow-auto p-0 md:p-4">
                  <div
                    className="h-full w-full bg-white md:rounded-xl md:shadow-lift overflow-hidden transition-all duration-300 relative"
                    style={{ maxWidth: device === "mobile" ? 390 : device === "tablet" ? 820 : "100%" }}
                  >
                    <iframe
                      key={previewNonce}
                      title="Preview"
                      srcDoc={srcDoc}
                      sandbox="allow-scripts allow-forms allow-modals allow-popups"
                      className="w-full h-full border-0 bg-white"
                      onLoad={(e) => {
                        try {
                          (e.currentTarget as HTMLIFrameElement)?.contentWindow?.postMessage(
                            { __toggle_visual_edit: visualEditMode },
                            "*"
                          );
                        } catch {}
                      }}
                    />
                  </div>
                </div>

                {/* Bottom preview status & visual editing bar */}
                <div className="shrink-0 h-9 px-3 glass border-t border-glass-border flex items-center justify-between text-xs select-none">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setVisualEditMode((v) => !v)}
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition cursor-pointer ${
                        visualEditMode
                          ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/40 shadow-xs"
                          : "text-muted-foreground hover:text-foreground hover:bg-surface border border-transparent"
                      }`}
                      title="Toggle Visual Editing on the website preview"
                    >
                      <Pencil className="h-3 w-3" />
                      <span>{visualEditMode ? "Visual Edit: ON" : "Visual Edit: OFF"}</span>
                    </button>
                    {visualEditMode ? (
                      <span className="hidden sm:inline-flex items-center gap-1.5 text-[11px] text-emerald-400 font-medium">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                        Hover any text element to edit · Auto-saves to code
                      </span>
                    ) : (
                      <span className="hidden sm:inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                        Click "Visual Edit" to edit any text directly on the preview
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setRightTab("code")}
                      className="text-[11px] text-muted-foreground hover:text-foreground hover:underline inline-flex items-center gap-1"
                      title="Switch to VS Code editor view"
                    >
                      <Code2 className="h-3 w-3" />
                      <span className="hidden sm:inline">View in Code</span>
                    </button>
                    <button
                      type="button"
                      onClick={openExternalPreview}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] font-semibold bg-gradient-to-r from-primary to-accent text-white shadow-xs hover:opacity-95 transition active:scale-95 cursor-pointer"
                      title="Open full staging preview with Publish toolbar"
                    >
                      <Rocket className="h-3 w-3" />
                      <span>Publish & Share</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {consoleOpen && (
              <div className="h-48 shrink-0 border-t border-glass-border glass-strong flex flex-col">
                <div className="flex items-center justify-between px-3 py-1.5 border-b border-glass-border">
                  <span className="inline-flex items-center gap-2 text-xs font-semibold"><Terminal className="h-3.5 w-3.5" /> Console</span>
                  <div className="flex items-center gap-1">
                    <button onClick={() => setLogs([])} className="text-[11px] px-2 py-1 rounded-md hover:bg-surface transition">Clear</button>
                    <button onClick={() => setConsoleOpen(false)} aria-label="Close console" className="p-1 rounded-md hover:bg-surface transition"><X className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="flex-1 overflow-auto font-mono text-[11px] px-3 py-2 space-y-1">
                  {logs.length === 0 && <p className="text-muted-foreground">No output yet. Interact with the preview to see logs and errors.</p>}
                  {logs.map((l) => (
                    <div
                      key={l.id}
                      className={`flex items-start justify-between gap-2 py-1 px-1.5 rounded hover:bg-surface/50 transition ${
                        l.level === "error" ? "text-destructive" : l.level === "warn" ? "text-warning" : "text-foreground/80"
                      }`}
                    >
                      <div className="min-w-0 flex-1 break-all">
                        <span className="text-muted-foreground mr-2 font-semibold uppercase text-[10px]">{l.level}</span>
                        {l.text}
                      </div>
                      {l.level === "error" && (
                        <button
                          type="button"
                          onClick={() => fixErrorWithAi(l.text)}
                          className="shrink-0 inline-flex items-center gap-1 rounded-md bg-destructive/15 text-destructive hover:bg-destructive/25 px-2 py-0.5 text-[11px] font-medium transition active:scale-95"
                          title="Ask Kenzo to fix this error"
                        >
                          <Sparkles className="h-3 w-3" /> Fix with AI
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>
        )}

      </main>

      {shareOpen && activeId && (
        <ShareDialog
          projectId={activeId}
          projectName={projectName}
          isOwner={isOwner}
          onClose={() => setShareOpen(false)}
          onChanged={() => fetchCollabs({ data: { projectId: activeId } }).then((r) => setCollabs(r.collaborators)).catch(() => {})}
        />
      )}

      {deleteTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="delete-title">
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setDeleteTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl glass-strong border border-glass-border shadow-lift p-6 animate-fade-in-up">
            <div className="flex items-start gap-4">
              <div className="rounded-xl bg-destructive/10 p-3 text-destructive"><Trash2 className="h-5 w-5" /></div>
              <div className="min-w-0">
                <h2 id="delete-title" className="text-lg font-semibold">Delete project</h2>
                <p className="mt-1 text-sm text-muted-foreground">
                  “{deleteTarget.name}” and its chat history will be permanently removed. This can’t be undone.
                </p>
              </div>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button onClick={() => setDeleteTarget(null)} className="rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-surface transition active:scale-95">Cancel</button>
              <button autoFocus onClick={confirmDelete} className="rounded-lg bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground shadow-lift hover:opacity-90 transition active:scale-95">Delete project</button>
            </div>
          </div>
        </div>
      )}

      {viewingImage && (
        <div
          className="fixed inset-0 z-[120] bg-background/85 backdrop-blur-md flex items-center justify-center p-4 animate-fade-in"
          role="dialog"
          aria-modal="true"
          onClick={() => setViewingImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh] flex flex-col items-center" onClick={(e) => e.stopPropagation()}>
            <button
              type="button"
              onClick={() => setViewingImage(null)}
              aria-label="Close image"
              className="absolute -top-3 -right-3 z-10 p-2 rounded-full bg-surface border border-glass-border shadow-lift text-foreground hover:bg-muted transition"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={viewingImage}
              alt="Preview full image"
              className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl border border-glass-border"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function IconBtn({ label, onClick, active, children }: { label: string; onClick: () => void; active?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`p-1.5 rounded-md transition active:scale-90 ${active ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground hover:bg-surface"}`}
    >
      {children}
    </button>
  );
}
