import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { setTheme, getStoredTheme, type Theme } from "@/lib/theme";
import { ArrowLeft, User, Sparkles, Monitor, Moon, Sun, Rocket } from "lucide-react";
import { NetlifyPanel } from "@/components/NetlifyPanel";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({
    meta: [
      { title: "Settings — Kenzo" },
      { name: "description", content: "Manage your account and AI preferences." },
      { property: "og:title", content: "Settings — Kenzo" },
      { property: "og:description", content: "Manage your account and AI preferences." },
    ],
  }),
  component: SettingsPage,
});

const MODELS = [
  { id: "google/gemini-2.5-flash-lite", label: "Gemini 2.5 Flash Lite — Recommended (fastest)" },
  { id: "google/gemini-2.5-flash", label: "Gemini 2.5 Flash — Balanced" },
  { id: "google/gemini-3.6-flash", label: "Gemini 3.6 Flash — Best code quality" },
  { id: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash — Rich, detailed builds" },
  { id: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro — Deepest reasoning" },
];

function SettingsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState<"account" | "ai" | "deploy">(
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("netlify") ? "deploy" : "account",
  );
  const [userId, setUserId] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [personality, setPersonality] = useState("balanced");
  const [verbosity, setVerbosity] = useState("normal");
  const [style, setStyle] = useState("modern");
  const [model, setModel] = useState("google/gemini-2.5-flash-lite");
  const [password, setPassword] = useState("");
  const [theme, setThemeState] = useState<Theme>(getStoredTheme());
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      setUserId(u.user.id);
      setEmail(u.user.email ?? "");
      const { data: p } = await supabase.from("profiles").select("*").eq("id", u.user.id).maybeSingle();
      if (p) {
        setDisplayName(p.display_name ?? "");
        setPersonality(p.ai_personality);
        setVerbosity(p.ai_verbosity);
        setStyle(p.ai_style);
        setModel(p.ai_model);
      }
    })();
  }, []);

  async function saveAccount() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ display_name: displayName })
      .eq("id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Account saved");
  }

  async function saveAi() {
    if (!userId) return;
    setSaving(true);
    const { error } = await supabase
      .from("profiles")
      .update({ ai_personality: personality, ai_verbosity: verbosity, ai_style: style, ai_model: model })
      .eq("id", userId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("AI preferences saved");
  }

  async function changePassword() {
    if (password.length < 8) return toast.error("Password must be 8+ characters.");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) return toast.error(error.message);
    setPassword("");
    toast.success("Password updated");
  }

  async function deleteAccount() {
    if (!confirm("Delete your account and all projects? This cannot be undone.")) return;
    if (!userId) return;
    await supabase.from("projects").delete().eq("user_id", userId);
    await supabase.auth.signOut();
    toast.success("Signed out. Contact support to fully purge your account.");
    navigate({ to: "/" });
  }

  function resetAi() {
    setPersonality("balanced");
    setVerbosity("normal");
    setStyle("modern");
    setModel("google/gemini-2.5-flash-lite");
  }

  return (
    <div className="min-h-screen">
      <header className="glass border-b border-glass-border">
        <div className="mx-auto max-w-4xl px-6 h-16 flex items-center justify-between">
          <Link to="/app" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Back to workspace
          </Link>
          <Logo />
        </div>
      </header>

      <div className="mx-auto max-w-4xl px-6 py-10 grid gap-6 md:grid-cols-[220px_1fr]">
        <nav className="glass rounded-2xl p-2 h-fit">
          <button onClick={() => setTab("account")} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${tab === "account" ? "gradient-brand text-primary-foreground" : "hover:bg-surface"}`}>
            <User className="h-4 w-4" /> Account
          </button>
          <button onClick={() => setTab("ai")} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${tab === "ai" ? "gradient-brand text-primary-foreground" : "hover:bg-surface"}`}>
            <Sparkles className="h-4 w-4" /> AI customization
          </button>
          <button onClick={() => setTab("deploy")} className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-left transition ${tab === "deploy" ? "gradient-brand text-primary-foreground" : "hover:bg-surface"}`}>
            <Rocket className="h-4 w-4" /> Deployments
          </button>
        </nav>

        <div className="glass rounded-2xl p-6 animate-fade-in-up">
          {tab === "deploy" ? (
            <NetlifyPanel />
          ) : tab === "account" ? (
            <div className="space-y-6">
              <div>
                <h2 className="text-xl font-semibold">Account</h2>
                <p className="text-sm text-muted-foreground">Update your profile and password.</p>
              </div>
              <TextField label="Email" value={email} disabled />
              <TextField label="Display name" value={displayName} onChange={setDisplayName} />
              <button onClick={saveAccount} disabled={saving} className="rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-lift disabled:opacity-50">
                Save
              </button>

              <div className="border-t border-border pt-6">
                <h3 className="font-medium">Theme</h3>
                <div className="mt-3 flex gap-2">
                  {([
                    { v: "light", i: Sun, l: "Light" },
                    { v: "dark", i: Moon, l: "Dark" },
                    { v: "system", i: Monitor, l: "System" },
                  ] as const).map(({ v, i: Icon, l }) => (
                    <button
                      key={v}
                      onClick={() => { setThemeState(v); setTheme(v); }}
                      className={`flex-1 rounded-lg border px-3 py-2 text-sm inline-flex items-center justify-center gap-2 transition ${theme === v ? "border-primary bg-primary/10 text-foreground" : "border-border hover:bg-surface"}`}
                    >
                      <Icon className="h-4 w-4" /> {l}
                    </button>
                  ))}
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-medium">Change password</h3>
                <div className="mt-3 flex gap-2">
                  <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    placeholder="New password (min 8 chars)"
                    className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25" />
                  <button onClick={changePassword} className="rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-surface">Update</button>
                </div>
              </div>

              <div className="border-t border-border pt-6">
                <h3 className="font-medium text-destructive">Danger zone</h3>
                <p className="text-sm text-muted-foreground mt-1">Delete your account and all projects.</p>
                <button onClick={deleteAccount} className="mt-3 rounded-lg border border-destructive/50 text-destructive px-4 py-2 text-sm font-medium hover:bg-destructive/10 transition">
                  Delete account
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <h2 className="text-xl font-semibold">AI customization</h2>
                <p className="text-sm text-muted-foreground">Tune how Kenzo generates code for you.</p>
              </div>

              <SelectField label="Personality" value={personality} onChange={setPersonality} options={[
                { v: "balanced", l: "Balanced — friendly + technical" },
                { v: "concise", l: "Concise — minimal chatter" },
                { v: "playful", l: "Playful — a little personality" },
                { v: "expert", l: "Expert — assume senior dev" },
              ]} />
              <SelectField label="Response verbosity" value={verbosity} onChange={setVerbosity} options={[
                { v: "terse", l: "Terse" },
                { v: "normal", l: "Normal" },
                { v: "detailed", l: "Detailed" },
              ]} />
              <SelectField label="Coding style" value={style} onChange={setStyle} options={[
                { v: "modern", l: "Modern — semantic + accessible" },
                { v: "minimal", l: "Minimal — small footprint" },
                { v: "commented", l: "Well-commented" },
                { v: "playful", l: "Playful — bold visuals" },
              ]} />
              <SelectField label="Model" value={model} onChange={setModel} options={MODELS.map((m) => ({ v: m.id, l: m.label }))} />

              <div className="flex gap-2 pt-2">
                <button onClick={saveAi} disabled={saving} className="rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-lift disabled:opacity-50">Save</button>
                <button onClick={resetAi} className="rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-surface">Reset to defaults</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, disabled }: { label: string; value: string; onChange?: (v: string) => void; disabled?: boolean }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange?.(e.target.value)}
        disabled={disabled}
        className="mt-1 w-full rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25 disabled:opacity-60"
      />
    </label>
  );
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { v: string; l: string }[] }) {
  return (
    <label className="block">
      <span className="text-sm font-medium">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1 w-full rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
      >
        {options.map((o) => <option key={o.v} value={o.v}>{o.l}</option>)}
      </select>
    </label>
  );
}
