import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { NotificationBell } from "@/components/NotificationBell";
import { Avatars, ShareDialog } from "@/components/ShareDialog";
import { PublishMenu } from "@/components/PublishMenu";
import { GithubMenu } from "@/components/GithubMenu";
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
  ClipboardList, Image as ImageIcon, MessageSquare, FolderTree,
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

const MAX_WORDS = 6000;

const CONSOLE_BRIDGE = `<script>(function(){
  var send=function(level,args){try{parent.postMessage({__kenzo:1,level:level,text:Array.prototype.map.call(args,function(a){
    try{return typeof a==="object"?JSON.stringify(a):String(a)}catch(e){return String(a)}}).join(" ")},"*")}catch(e){}};
  ["log","info","warn","error","debug"].forEach(function(k){var o=console[k];console[k]=function(){send(k,arguments);o&&o.apply(console,arguments)}});
  window.addEventListener("error",function(e){send("error",[e.message+" ("+(e.filename||"script")+":"+e.lineno+")"])});
  window.addEventListener("unhandledrejection",function(e){send("error",["Unhandled promise rejection: "+e.reason])});
})();<\/script>`;

function buildSrcDoc(f: Files): string {
  let html = f["index.html"] || "";
  html = html.replace(/<link\s+[^>]*href=["']styles\.css["'][^>]*>/i, `<style>${f["styles.css"] || ""}</style>`);
  html = html.replace(/<script\s+[^>]*src=["']script\.js["'][^>]*><\/script>/i, `<script>${f["script.js"] || ""}<\/script>`);
  if (!/<style>/.test(html) && f["styles.css"]) html = html.replace("</head>", `<style>${f["styles.css"]}</style></head>`);
  if (!/<script>/.test(html) && f["script.js"]) html = html.replace("</body>", `<script>${f["script.js"]}<\/script></body>`);
  if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, (m) => m + CONSOLE_BRIDGE);
  else html = CONSOLE_BRIDGE + html;
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

/** Minimal markdown → HTML for assistant plans. Never leaks raw ** or ## markers. */
function md(text: string) {
  const esc = (text ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/```[a-z]*\n?([\s\S]*?)```/g, '<pre class="rounded-lg bg-input p-2 my-1 overflow-auto text-[11px]">$1</pre>')
    .replace(/`([^`]+)`/g, '<code class="rounded bg-input px-1 py-0.5 text-[11px]">$1</code>')
    .replace(/^#{4,}\s*(.*)$/gm, '<h4 class="font-semibold mt-2">$1</h4>')
    .replace(/^###\s*(.*)$/gm, '<h4 class="font-semibold mt-2">$1</h4>')
    .replace(/^##\s*(.*)$/gm, '<h3 class="font-semibold text-sm mt-3">$1</h3>')
    .replace(/^#\s*(.*)$/gm, '<h3 class="font-semibold text-sm mt-3">$1</h3>')
    .replace(/\*\*\*([^*]+)\*\*\*/g, "<strong><em>$1</em></strong>")
    .replace(/\*\*([\s\S]+?)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|\s)_([^_\n]+)_(?=\s|$)/g, "$1<em>$2</em>")
    .replace(/^\s*\d+\.\s+(.*)$/gm, '<li class="ml-4 list-decimal">$1</li>')
    .replace(/^\s*[-*•]\s+(.*)$/gm, '<li class="ml-4 list-disc">$1</li>')
    .replace(/\*+/g, "") // drop any stray asterisks the model left behind
    .replace(/\n/g, "<br/>");
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
  const stepTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const tickTimer = useRef<ReturnType<typeof setInterval> | null>(null);

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
      const max = Math.min(900, (splitRef.current?.clientWidth ?? 1200) - 360);
      setChatWidth(Math.max(300, Math.min(max, e.clientX - left)));
    };
    const onUp = () => {
      setDragging(false);
      setChatWidth((w) => { localStorage.setItem("kenzo:chatWidth", String(w)); return w; });
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [dragging]);

  /* ---------- console bridge ---------- */
  useEffect(() => {
    const onMsg = (e: MessageEvent) => {
      const d = e.data as { __kenzo?: number; level?: string; text?: string };
      if (!d || d.__kenzo !== 1) return;
      setLogs((prev) => [...prev.slice(-199), { id: ++logId.current, level: d.level ?? "log", text: d.text ?? "" }]);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

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

  /* ---------- projects ---------- */
  async function openProject(p: ProjectRow) {
    setDraft(false);
    setActiveId(p.id);
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
    setDraftName("New project");
    setMessages([]);
    setFiles(DEFAULT_FILES);
    setLogs([]);
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
    setBusy(true);
    startSteps(mode);
    await persistMsg(projectId, userMsg);

    try {
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
      setFiles(nextFiles);
      setLogs([]);
      void animateCode(nextFiles);

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
      setMessages((m) => [...m, asst]);
      await persistMsg(projectId, asst);
      setPreviewNonce((n) => n + 1);
      setMobileTab("preview");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      stopSteps();
      setBusy(false);
      inputRef.current?.focus();
    }
  }

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    const prompt = input.trim();
    if (!prompt || busy || !user) return;
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
    triggerDownload(new Blob([buildSrcDoc(files)], { type: "text/html" }), `${projectSlug()}.html`);
    toast.success("Downloaded single-file HTML");
    setExportOpen(false);
  }

  async function copyActiveFile() {
    await navigator.clipboard.writeText(files[activeFile]);
    toast.success(`${activeFile} copied`);
  }

  async function signOut() {
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  }

  const srcDoc = useMemo(() => buildSrcDoc(files), [files]);
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

  const words = input.trim() ? input.trim().split(/\s+/).length : 0;
  const overLimit = words > MAX_WORDS;

  const composer = (
    <form
      onSubmit={send}
      className={`rounded-2xl glass-strong border border-glass-border shadow-lift transition-all duration-300 ${modeFx ? "scale-[0.985] opacity-70" : "scale-100 opacity-100"} ${mode === "plan" ? "ring-1 ring-primary/30" : ""}`}
    >
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
        onChange={(e) => setInput(e.target.value)}
        onPaste={handlePaste}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
        }}
        rows={3}
        placeholder={mode === "plan" ? "Describe the idea — Kenzo will plan it first…" : "Describe what to build or change… (you can paste images)"}
        className="w-full resize-none bg-transparent px-4 pt-4 pb-2 text-sm outline-none placeholder:text-muted-foreground"
      />

      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => { void onPickImages(e.target.files); e.currentTarget.value = ""; }} />
        <IconBtn label="Attach images" onClick={() => fileInputRef.current?.click()}><ImagePlus className="h-4 w-4" /></IconBtn>
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

        <span className={`ml-auto text-[11px] tabular-nums ${overLimit ? "text-destructive" : "text-muted-foreground"}`}>
          {words > 0 ? `${words.toLocaleString()} / ${MAX_WORDS.toLocaleString()}` : ""}
        </span>

        <button
          type="submit"
          disabled={busy || !input.trim() || overLimit}
          aria-label="Send message"
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg gradient-brand text-primary-foreground shadow-lift transition active:scale-95 disabled:opacity-40 disabled:pointer-events-none"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </button>
      </div>
    </form>
  );



  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Sidebar */}
      {sidebarOpen && <div className="fixed inset-0 z-20 bg-background/60 backdrop-blur-sm lg:hidden" onClick={() => setSidebarOpen(false)} />}
      <aside
        className={`fixed lg:static z-30 top-0 h-full glass-strong border-r border-glass-border transition-all duration-300 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"} lg:translate-x-0 flex flex-col ${sidebarCollapsed ? "w-16" : "w-72"}`}
      >
        <div className="p-4 flex items-center justify-between gap-2">
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            className="hidden lg:inline-flex items-center gap-2 hover:opacity-80 transition"
            title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            <Logo showWordmark={!sidebarCollapsed} />
          </button>
          <Link to="/" className="lg:hidden"><Logo /></Link>
          <button className="lg:hidden p-2" onClick={() => setSidebarOpen(false)} aria-label="Close menu"><X className="h-4 w-4" /></button>
        </div>

        <button
          onClick={startDraft}
          title="New project"
          className={`mx-3 mb-3 inline-flex items-center justify-center gap-2 rounded-lg gradient-brand py-2 text-sm font-medium text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-[0.98] ${sidebarCollapsed ? "px-0" : "px-3"}`}
        >
          <Plus className="h-4 w-4" /> {!sidebarCollapsed && <span>New project</span>}
        </button>

        {!sidebarCollapsed && (
          <div className="px-3 pb-2">
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
        )}

        <div className="flex-1 overflow-auto px-2">
          {!sidebarCollapsed && draft && (
            <div className="flex items-center gap-2 rounded-lg mb-1 px-3 py-2 text-sm bg-primary/10 text-muted-foreground italic">
              <Sparkles className="h-3.5 w-3.5 text-primary" /> Untitled draft
            </div>
          )}
          {!sidebarCollapsed && filtered.length === 0 && !draft && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              {query ? "No projects match that search." : "No projects yet. Create your first one!"}
            </div>
          )}
          {!sidebarCollapsed && filtered.map((p) => (
            <div key={p.id} className={`group flex items-center gap-1 rounded-lg mb-1 transition ${activeId === p.id && !draft ? "bg-primary/10" : "hover:bg-surface"}`}>
              <button onClick={() => openProject(p)} className="flex-1 text-left px-3 py-2 text-sm truncate">
                {p.name}
              </button>
              {p.user_id === user?.id && (
                <button onClick={() => setDeleteTarget({ id: p.id, name: p.name })} aria-label={`Delete ${p.name}`} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-2 text-muted-foreground hover:text-destructive transition">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-glass-border space-y-1">
          {!sidebarCollapsed && (
            <div className="px-2 py-2 text-xs font-medium text-muted-foreground truncate">{profile?.display_name || "My Account"}</div>
          )}
          <Link to="/settings" title="Settings" className={`flex items-center gap-2 rounded-lg py-2 text-sm hover:bg-surface transition ${sidebarCollapsed ? "justify-center px-0" : "px-3"}`}>
            <Settings className="h-4 w-4" /> {!sidebarCollapsed && <span>Settings</span>}
          </Link>
          <button onClick={signOut} title="Log out" className={`w-full flex items-center gap-2 rounded-lg py-2 text-sm hover:bg-surface transition ${sidebarCollapsed ? "justify-center px-0" : "px-3"}`}>
            <LogOut className="h-4 w-4" /> {!sidebarCollapsed && <span>Log out</span>}
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
            <div className="h-12 flex items-center gap-1 px-2 rounded-xl glass border border-glass-border">
              <button className="lg:hidden p-2 rounded-lg hover:bg-surface transition" onClick={() => setSidebarOpen(true)} aria-label="Open menu"><Menu className="h-4 w-4" /></button>
              <input
                value={projectName}
                onChange={(e) => renameProject(e.target.value)}
                aria-label="Project name"
                className="flex-1 min-w-0 bg-transparent text-sm font-medium outline-none focus:bg-input rounded-lg px-2 py-1 transition"
              />
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
                <div className="mt-4 flex flex-wrap justify-center gap-2">
                  {["Landing page for a coffee shop", "Interactive todo list with dark mode", "Portfolio with hero and projects grid"].map((s) => (
                    <button key={s} onClick={() => { setInput(s); inputRef.current?.focus(); }} className="rounded-full glass border border-glass-border px-3.5 py-1.5 text-xs text-muted-foreground hover:text-foreground hover:bg-surface transition active:scale-[0.98]">
                      {s}
                    </button>
                  ))}
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
                  <button
                    type="button"
                    onClick={() => setThinkOpen((v) => !v)}
                    aria-expanded={thinkOpen}
                    className="flex w-full items-center gap-2 px-4 py-2.5 text-sm text-left transition hover:bg-surface/50"
                  >
                    <span className="thinking-dot" />
                    <span className="thinking-dot" style={{ animationDelay: "150ms" }} />
                    <span className="thinking-dot" style={{ animationDelay: "300ms" }} />
                    <span className="ml-1 text-muted-foreground">
                      {mode === "plan" ? "Kenzo is planning…" : "Kenzo is building…"}
                    </span>
                    <span className="ml-auto tabular-nums text-[11px] text-muted-foreground">
                      {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                    </span>
                    <ChevronDown className={`h-3.5 w-3.5 text-muted-foreground transition-transform ${thinkOpen ? "rotate-180" : ""}`} />
                  </button>
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
          onMouseDown={() => setDragging(true)}
          onDoubleClick={() => { setChatWidth(416); localStorage.setItem("kenzo:chatWidth", "416"); }}
          className={`hidden lg:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center group ${dragging ? "bg-primary/40" : "hover:bg-primary/25"} transition-colors`}
        >
          <div className={`h-10 w-0.5 rounded-full ${dragging ? "bg-primary" : "bg-border group-hover:bg-primary/60"}`} />
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

            <div className="h-12 flex items-center justify-between gap-2 px-2 rounded-xl glass border border-glass-border">
              <div className="flex items-center gap-1.5">
                <div className="flex lg:hidden items-center bg-input rounded-lg p-0.5 mr-1">
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
                <div className="flex gap-1 rounded-lg bg-input p-1">
                  {([["preview", Monitor, "Preview"], ["code", FileCode, "Code"], ["assets", FolderTree, "Files"]] as const).map(([k, Icon, label]) => (
                    <button
                      key={k}
                      onClick={() => setRightTab(k)}
                      title={label}
                      aria-label={label}
                      className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 text-xs font-medium rounded-md transition active:scale-95 ${rightTab === k ? "gradient-brand text-primary-foreground shadow-xs" : "hover:bg-surface text-muted-foreground"}`}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      <span className="hidden sm:inline">{label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center gap-1">
                <GithubMenu projectId={activeId} projectName={projectName} />
                <PublishMenu projectId={activeId} />
                {rightTab === "preview" && (
                  <div className="hidden md:flex gap-1 rounded-lg bg-input p-1 mr-1">
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
                  className={`relative p-2 rounded-lg transition active:scale-95 ${consoleOpen ? "bg-primary/15 text-primary" : "hover:bg-surface"}`}
                >
                  <Terminal className="h-4 w-4" />
                  {errorCount > 0 && <span className="absolute -top-0.5 -right-0.5 h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] grid place-items-center">{errorCount}</span>}
                </button>
                <button onClick={() => { setLogs([]); setPreviewNonce((n) => n + 1); }} title="Refresh preview" aria-label="Refresh preview" className="p-2 rounded-lg hover:bg-surface transition active:scale-95">
                  <RefreshCw className="h-4 w-4" />
                </button>
                <button
                  onClick={() => { const w = window.open("", "_blank"); if (w) { w.document.open(); w.document.write(buildSrcDoc(files)); w.document.close(); } }}
                  title="Open preview in a new tab" aria-label="Open preview in a new tab"
                  className="p-2 rounded-lg hover:bg-surface transition active:scale-95"
                >
                  <ExternalLink className="h-4 w-4" />
                </button>
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
              <div className="flex-1 flex flex-col min-h-0">
                <div className="flex items-center justify-between gap-2 px-4 border-b border-glass-border">
                  <div className="flex gap-1 overflow-x-auto">
                    {(["index.html", "styles.css", "script.js"] as const).map((name) => {
                      const Icon = name === "index.html" ? FileText : name === "styles.css" ? Palette : FileCode;
                      return (
                        <button key={name} onClick={() => setActiveFile(name)} className={`inline-flex items-center gap-2 whitespace-nowrap px-3 py-2 text-xs font-medium border-b-2 transition ${activeFile === name ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                          <Icon className="h-3.5 w-3.5" /> {name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="hidden sm:inline text-[11px] text-muted-foreground tabular-nums">
                      {files[activeFile].split("\n").length} lines · {(new Blob([files[activeFile]]).size / 1024).toFixed(1)} KB
                    </span>
                    <button onClick={copyActiveFile} title="Copy file" aria-label="Copy file" className="p-1.5 rounded-md hover:bg-surface transition text-muted-foreground hover:text-foreground active:scale-95">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 min-h-0 flex bg-surface overflow-hidden">
                  <div aria-hidden ref={gutterRef} className="hidden sm:block select-none overflow-hidden border-r border-glass-border px-3 py-4 text-right font-mono text-xs leading-relaxed text-muted-foreground/60">
                    {editorValue.split("\n").map((_, i) => <div key={i}>{i + 1}</div>)}
                  </div>
                  <textarea
                    key={activeFile}
                    ref={editorRef}
                    readOnly={isTyping}
                    value={editorValue}
                    onChange={(e) => updateFile(activeFile, e.target.value)}
                    onScroll={(e) => { if (gutterRef.current) gutterRef.current.scrollTop = e.currentTarget.scrollTop; }}
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
                    className={`flex-1 w-full resize-none bg-transparent font-mono text-xs px-4 py-4 outline-none border-0 leading-relaxed ${isTyping ? "caret-primary" : ""}`}
                    style={{ tabSize: 2 }}
                  />
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
              <div className="flex-1 min-h-0 flex items-start justify-center overflow-auto bg-surface p-0 md:p-4">
                <div className="h-full w-full bg-white md:rounded-xl md:shadow-lift overflow-hidden transition-all duration-300" style={{ maxWidth: device === "mobile" ? 390 : device === "tablet" ? 820 : "100%" }}>
                  <iframe
                    key={previewNonce}
                    title="Preview"
                    srcDoc={srcDoc}
                    sandbox="allow-scripts allow-forms allow-modals allow-popups"
                    className="w-full h-full border-0 bg-white"
                  />
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
