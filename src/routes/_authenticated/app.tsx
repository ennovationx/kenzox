import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import { generateCode } from "@/lib/generate.functions";
import {
  Plus, Send, RefreshCw, Download, ExternalLink, Trash2, Settings, LogOut,
  FileCode, Palette, FileText, Loader2, Menu, X, Sparkles,
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
type ProjectRow = { id: string; name: string; files: Files; updated_at: string };
type Msg = { id: string; role: "user" | "assistant" | "system"; content: string };
type Profile = { display_name: string | null; ai_personality: string; ai_verbosity: string; ai_style: string; ai_model: string };

const DEFAULT_FILES: Files = {
  "index.html": `<!doctype html>\n<html>\n  <head><meta charset="utf-8"><title>New app</title><link rel="stylesheet" href="styles.css"></head>\n  <body>\n    <main>\n      <h1>Hello from Kenzo</h1>\n      <p>Ask the assistant to build something amazing.</p>\n    </main>\n    <script src="script.js" defer></script>\n  </body>\n</html>`,
  "styles.css": `body{font-family:system-ui;margin:0;padding:3rem;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;min-height:100vh}h1{font-size:2.5rem;margin:0 0 .5rem}p{opacity:.85}`,
  "script.js": `console.log("Kenzo ready");`,
};

function buildSrcDoc(f: Files): string {
  let html = f["index.html"] || "";
  html = html.replace(/<link\s+[^>]*href=["']styles\.css["'][^>]*>/i, `<style>${f["styles.css"] || ""}</style>`);
  html = html.replace(/<script\s+[^>]*src=["']script\.js["'][^>]*><\/script>/i, `<script>${f["script.js"] || ""}<\/script>`);
  if (!/<style>/.test(html) && f["styles.css"]) html = html.replace("</head>", `<style>${f["styles.css"]}</style></head>`);
  if (!/<script>/.test(html) && f["script.js"]) html = html.replace("</body>", `<script>${f["script.js"]}<\/script></body>`);
  return html;
}

function Workspace() {
  const navigate = useNavigate();
  const [user, setUser] = useState<{ id: string; email?: string } | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [projects, setProjects] = useState<ProjectRow[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [files, setFiles] = useState<Files>(DEFAULT_FILES);
  const [activeFile, setActiveFile] = useState<keyof Files>("index.html");
  const [rightTab, setRightTab] = useState<"code" | "preview">("preview");
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [previewNonce, setPreviewNonce] = useState(0);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [zipping, setZipping] = useState(false);

  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const generate = useServerFn(generateCode);
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUser({ id: u.user.id, email: u.user.email ?? undefined });
      const { data: p } = await supabase
        .from("profiles")
        .select("display_name, ai_personality, ai_verbosity, ai_style, ai_model")
        .eq("id", u.user.id)
        .maybeSingle();
      setProfile(p as Profile | null);
      const { data: rows } = await supabase
        .from("projects")
        .select("id, name, files, updated_at")
        .order("updated_at", { ascending: false });
      const list = (rows ?? []) as ProjectRow[];
      setProjects(list);
      if (list.length) selectProject(list[0]);
      else await newProject();
    })();
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function selectProject(p: ProjectRow) {
    setActiveId(p.id);
    setFiles({ ...DEFAULT_FILES, ...(p.files as Files) });
    const { data } = await supabase
      .from("chat_messages")
      .select("id, role, content")
      .eq("project_id", p.id)
      .order("created_at");
    setMessages((data ?? []) as Msg[]);
    setSidebarOpen(false);
  }

  async function newProject() {
    if (!user) return;
    const { data, error } = await supabase
      .from("projects")
      .insert({ user_id: user.id, name: "New project", files: DEFAULT_FILES })
      .select("id, name, files, updated_at")
      .single();
    if (error) return toast.error(error.message);
    const row = data as ProjectRow;
    setProjects((prev) => [row, ...prev]);
    setMessages([]);
    setActiveId(row.id);
    setFiles(DEFAULT_FILES);
  }

  async function renameProject(id: string, name: string) {
    setProjects((prev) => prev.map((p) => (p.id === id ? { ...p, name } : p)));
    await supabase.from("projects").update({ name }).eq("id", id);
  }

  async function deleteProject(id: string) {
    if (!confirm("Delete this project? This cannot be undone.")) return;
    await supabase.from("projects").delete().eq("id", id);
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (activeId === id) {
      const next = projects.find((p) => p.id !== id) ?? null;
      if (next) selectProject(next);
      else newProject();
    }
    toast.success("Project deleted");
  }

  function scheduleSave(next: Files) {
    if (!activeId) return;
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

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    if (!input.trim() || busy || !activeId || !user) return;
    const userMsg: Msg = { id: crypto.randomUUID(), role: "user", content: input.trim() };
    setMessages((m) => [...m, userMsg]);
    setInput("");
    setBusy(true);
    await supabase.from("chat_messages").insert({
      project_id: activeId,
      user_id: user.id,
      role: "user",
      content: userMsg.content,
    });
    try {
      const result = await generate({
        data: {
          prompt: userMsg.content,
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
      await supabase.from("projects").update({ files: nextFiles }).eq("id", activeId);
      const summary = result.summary || "Done.";
      const asst: Msg = { id: crypto.randomUUID(), role: "assistant", content: summary };
      setMessages((m) => [...m, asst]);
      await supabase.from("chat_messages").insert({
        project_id: activeId,
        user_id: user.id,
        role: "assistant",
        content: summary,
      });
      setPreviewNonce((n) => n + 1);
      // Auto-name project from first prompt
      const proj = projects.find((p) => p.id === activeId);
      if (proj && proj.name === "New project") {
        const name = userMsg.content.slice(0, 48);
        renameProject(activeId, name);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      toast.error(msg);
      setMessages((m) => [...m, { id: crypto.randomUUID(), role: "assistant", content: `⚠️ ${msg}` }]);
    } finally {
      setBusy(false);
    }
  }

  function projectSlug() {
    return (projects.find((p) => p.id === activeId)?.name || "kenzo-app")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "kenzo-app";
  }

  function triggerDownload(blob: Blob, filename: string) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
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
      zip.file(
        "README.md",
        `# ${projects.find((p) => p.id === activeId)?.name || "Kenzo app"}\n\nGenerated with Kenzo.\n\n## Run locally\n\nOpen \`index.html\` in your browser, or serve the folder:\n\n\`\`\`bash\nnpx serve .\n\`\`\`\n\n## Files\n\n- \`index.html\` — markup\n- \`styles.css\` — styles\n- \`script.js\` — behaviour\n`,
      );
      const blob = await zip.generateAsync({ type: "blob" });
      triggerDownload(blob, `${projectSlug()}.zip`);
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

  const srcDoc = useMemo(() => buildSrcDoc(files), [files, previewNonce]);

  return (
    <div className="h-screen w-screen flex overflow-hidden">
      {/* Sidebar */}
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
          <button className="lg:hidden p-2" onClick={() => setSidebarOpen(false)}><X className="h-4 w-4" /></button>
        </div>
        <button
          onClick={newProject}
          title="New project"
          className={`mx-3 mb-3 inline-flex items-center justify-center gap-2 rounded-lg gradient-brand py-2 text-sm font-medium text-primary-foreground shadow-lift hover:opacity-90 transition ${sidebarCollapsed ? "px-0" : "px-3"}`}
        >
          <Plus className="h-4 w-4" /> {!sidebarCollapsed && <span>New project</span>}
        </button>
        {!sidebarCollapsed && (
          <div className="px-4 pb-2 text-xs uppercase tracking-wider text-muted-foreground">Projects</div>
        )}
        <div className="flex-1 overflow-auto px-2">
          {!sidebarCollapsed && projects.length === 0 && (
            <div className="px-4 py-6 text-center text-sm text-muted-foreground">
              No projects yet. Create your first one!
            </div>
          )}
          {!sidebarCollapsed && projects.map((p) => (
            <div key={p.id} className={`group flex items-center gap-1 rounded-lg mb-1 ${activeId === p.id ? "bg-primary/10" : "hover:bg-surface"}`}>
              <button onClick={() => selectProject(p)} className="flex-1 text-left px-3 py-2 text-sm truncate">
                {p.name}
              </button>
              <button onClick={() => deleteProject(p.id)} className="opacity-0 group-hover:opacity-100 p-2 text-muted-foreground hover:text-destructive transition">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
        <div className="p-3 border-t border-glass-border space-y-1">
          {!sidebarCollapsed && (
            <div className="px-2 py-2 text-xs text-muted-foreground truncate">
              {profile?.display_name || user?.email}
            </div>
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
      <main className="flex-1 flex flex-col lg:flex-row min-w-0">
        {/* Chat */}
        <section className="flex flex-col w-full lg:w-[26rem] lg:min-w-[22rem] border-r border-glass-border">
          <div className="h-14 flex items-center justify-between px-4 border-b border-glass-border glass">
            <button className="lg:hidden p-2" onClick={() => setSidebarOpen(true)}><Menu className="h-4 w-4" /></button>
            <div className="flex-1 flex items-center gap-2">
              <input
                value={projects.find((p) => p.id === activeId)?.name ?? ""}
                onChange={(e) => activeId && renameProject(activeId, e.target.value)}
                className="w-full bg-transparent text-sm font-medium outline-none focus:bg-input rounded px-2 py-1"
              />
            </div>
          </div>
          <div className="flex-1 overflow-auto px-4 py-4 space-y-3">
            {messages.length === 0 && (
              <div className="text-center py-12 animate-fade-in-up">
                <div className="inline-flex h-12 w-12 items-center justify-center rounded-xl gradient-brand text-primary-foreground shadow-glow mb-4">
                  <Sparkles className="h-6 w-6" />
                </div>
                <h3 className="font-semibold">Start building</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs mx-auto">
                  Describe an app or a change. Kenzo will write and update the code.
                </p>
                <div className="mt-4 grid gap-2 max-w-xs mx-auto">
                  {[
                    "Landing page for a coffee shop",
                    "Interactive todo list with dark mode",
                    "Portfolio site with hero and projects grid",
                  ].map((s) => (
                    <button key={s} onClick={() => setInput(s)} className="text-left text-xs px-3 py-2 rounded-lg glass hover:bg-surface transition">
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((m) => (
              <div key={m.id} className={`animate-fade-in-up ${m.role === "user" ? "text-right" : ""}`}>
                <div className={`inline-block max-w-[92%] rounded-2xl px-4 py-2.5 text-sm ${m.role === "user" ? "gradient-brand text-primary-foreground" : "glass"}`}>
                  <div className="whitespace-pre-wrap break-words">{m.content}</div>
                </div>
              </div>
            ))}
            {busy && (
              <div className="animate-fade-in-up">
                <div className="inline-flex items-center gap-2 rounded-2xl px-4 py-2.5 text-sm glass">
                  <span className="thinking-dot" />
                  <span className="thinking-dot" style={{ animationDelay: "150ms" }} />
                  <span className="thinking-dot" style={{ animationDelay: "300ms" }} />
                  <span className="text-muted-foreground ml-1">Kenzo is thinking…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <form onSubmit={send} className="p-3 border-t border-glass-border glass">
            <div className="flex gap-2 items-end">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask Kenzo to build or change something…"
                rows={2}
                className="flex-1 resize-none rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 max-h-40"
              />
              <button type="submit" disabled={busy || !input.trim()} className="rounded-lg gradient-brand p-2.5 text-primary-foreground shadow-lift disabled:opacity-50 transition hover:opacity-90">
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
          </form>
        </section>

        {/* Code + Preview */}
        <section className="flex-1 flex flex-col min-w-0">
          <div className="h-14 flex items-center justify-between px-4 border-b border-glass-border glass">
            <div className="flex gap-1 rounded-lg bg-input p-1">
              <button onClick={() => setRightTab("preview")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${rightTab === "preview" ? "gradient-brand text-primary-foreground" : "hover:bg-surface"}`}>
                Preview
              </button>
              <button onClick={() => setRightTab("code")} className={`px-3 py-1.5 text-xs font-medium rounded-md transition ${rightTab === "code" ? "gradient-brand text-primary-foreground" : "hover:bg-surface"}`}>
                Code
              </button>
            </div>
            <div className="flex items-center gap-1">
              <button onClick={() => setPreviewNonce((n) => n + 1)} title="Refresh preview" className="p-2 rounded-lg hover:bg-surface transition">
                <RefreshCw className="h-4 w-4" />
              </button>
              <button onClick={() => {
                const w = window.open("", "_blank");
                if (w) { w.document.open(); w.document.write(srcDoc); w.document.close(); }
              }} title="Open preview in a new tab" className="p-2 rounded-lg hover:bg-surface transition">
                <ExternalLink className="h-4 w-4" />
              </button>
              <button onClick={exportZip} title="Export" className="p-2 rounded-lg hover:bg-surface transition">
                <Download className="h-4 w-4" />
              </button>
            </div>
          </div>

          {rightTab === "code" ? (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="flex gap-1 px-4 pt-3 border-b border-glass-border">
                {(["index.html", "styles.css", "script.js"] as const).map((name) => {
                  const Icon = name === "index.html" ? FileText : name === "styles.css" ? Palette : FileCode;
                  return (
                    <button key={name} onClick={() => setActiveFile(name)} className={`inline-flex items-center gap-2 px-3 py-2 text-xs font-medium border-b-2 transition ${activeFile === name ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                      <Icon className="h-3.5 w-3.5" /> {name}
                    </button>
                  );
                })}
              </div>
              <textarea
                key={activeFile}
                value={files[activeFile]}
                onChange={(e) => updateFile(activeFile, e.target.value)}
                spellCheck={false}
                className="flex-1 w-full resize-none bg-surface font-mono text-xs p-4 outline-none border-0 leading-relaxed"
                style={{ tabSize: 2 }}
              />
            </div>
          ) : (
            <div className="flex-1 bg-white">
              <iframe
                key={previewNonce}
                title="Preview"
                srcDoc={srcDoc}
                sandbox="allow-scripts allow-forms allow-modals allow-popups"
                className="w-full h-full border-0 bg-white"
              />
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
