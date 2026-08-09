import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { listUsers, setUserRole, setUserStatus, deleteUser, adminStats } from "@/lib/admin.functions";
import { listApiKeys, upsertApiKey, deleteApiKey, createUserAccount } from "@/lib/apikeys.functions";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";
import { ArrowLeft, Shield, Users, FolderKanban, MessageSquare, Trash2, Ban, Check, KeyRound, Plus, UserPlus, AlertTriangle } from "lucide-react";


export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — Kenzo" },
      { name: "description", content: "Kenzo admin control panel." },
      { name: "robots", content: "noindex, nofollow" },
      { property: "og:title", content: "Admin — Kenzo" },
      { property: "og:description", content: "Kenzo admin control panel." },
    ],
  }),
  component: AdminPage,
});

type UserRow = {
  id: string;
  email: string | null;
  display_name: string | null;
  status: string;
  created_at: string;
  roles: string[];
  project_count: number;
};

function AdminPage() {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState<"checking" | "yes" | "no">("checking");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [stats, setStats] = useState<{ users: number; projects: number; messages: number; activeWeek: number } | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | "admin" | "active" | "disabled">("all");

  const list = useServerFn(listUsers);
  const setRole = useServerFn(setUserRole);
  const setStatus = useServerFn(setUserStatus);
  const del = useServerFn(deleteUser);
  const stat = useServerFn(adminStats);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) { setAllowed("no"); navigate({ to: "/login", replace: true }); return; }
      const { data: role } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", u.user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (!role) {
        // No admin: bounce silently to workspace (not visually hidden — real gate).
        setAllowed("no");
        navigate({ to: "/app", replace: true });
        return;
      }
      setAllowed("yes");
      try {
        const [rows, s] = await Promise.all([list(), stat()]);
        setUsers(rows as UserRow[]);
        setStats(s);
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load admin data");
      }
    })();
  }, []);

  async function reload() {
    try {
      const [rows, s] = await Promise.all([list(), stat()]);
      setUsers(rows as UserRow[]);
      setStats(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to reload");
    }
  }

  async function toggleAdmin(u: UserRow) {
    const isAdmin = u.roles.includes("admin");
    try {
      await setRole({ data: { userId: u.id, role: "admin", grant: !isAdmin } });
      toast.success(isAdmin ? "Removed admin role" : "Granted admin role");
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function toggleStatus(u: UserRow) {
    try {
      await setStatus({ data: { userId: u.id, status: u.status === "active" ? "disabled" : "active" } });
      toast.success("Status updated");
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }
  async function remove(u: UserRow) {
    if (!confirm(`Permanently delete ${u.email}? This cannot be undone.`)) return;
    try {
      await del({ data: { userId: u.id } });
      toast.success("User deleted");
      reload();
    } catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  if (allowed !== "yes") {
    return <div className="min-h-screen flex items-center justify-center text-muted-foreground text-sm">Checking access…</div>;
  }

  const filtered = users.filter((u) => {
    const q = query.trim().toLowerCase();
    if (q && !(u.email ?? "").toLowerCase().includes(q) && !(u.display_name ?? "").toLowerCase().includes(q)) return false;
    if (filter === "admin" && !u.roles.includes("admin")) return false;
    if (filter === "active" && u.status !== "active") return false;
    if (filter === "disabled" && u.status !== "disabled") return false;
    return true;
  });

  return (
    <div className="min-h-screen">
      <header className="glass border-b border-glass-border">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link to="/app" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Workspace
          </Link>
          <div className="inline-flex items-center gap-2">
            <Shield className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Admin control panel</span>
          </div>
          <Logo showWordmark={false} size={24} />
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-10 space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={Users} label="Users" value={stats?.users ?? 0} />
          <StatCard icon={FolderKanban} label="Projects" value={stats?.projects ?? 0} />
          <StatCard icon={MessageSquare} label="Messages" value={stats?.messages ?? 0} />
          <StatCard icon={Shield} label="Active (7d)" value={stats?.activeWeek ?? 0} />
        </div>

        <div className="glass rounded-2xl p-4">
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search email or name…"
              className="flex-1 min-w-[200px] rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
            />
            <div className="flex gap-1 rounded-lg bg-input p-1">
              {(["all", "admin", "active", "disabled"] as const).map((f) => (
                <button key={f} onClick={() => setFilter(f)} className={`px-3 py-1.5 text-xs rounded-md capitalize transition ${filter === f ? "gradient-brand text-primary-foreground" : "hover:bg-surface"}`}>{f}</button>
              ))}
            </div>
          </div>
          <div className="overflow-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted-foreground border-b border-border">
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Signed up</th>
                  <th className="py-2 pr-3">Role</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Projects</th>
                  <th className="py-2 pr-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 && (
                  <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">No users match.</td></tr>
                )}
                {filtered.map((u) => (
                  <tr key={u.id} className="border-b border-border/50">
                    <td className="py-3 pr-3">
                      <div className="font-medium">{u.display_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{u.email}</div>
                    </td>
                    <td className="py-3 pr-3 text-muted-foreground">{new Date(u.created_at).toLocaleDateString()}</td>
                    <td className="py-3 pr-3">
                      {u.roles.includes("admin") ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 text-primary px-2 py-0.5 text-xs font-medium"><Shield className="h-3 w-3" /> admin</span>
                      ) : (
                        <span className="text-xs text-muted-foreground">user</span>
                      )}
                    </td>
                    <td className="py-3 pr-3">
                      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${u.status === "active" ? "bg-success/10 text-success" : "bg-destructive/10 text-destructive"}`}>
                        {u.status}
                      </span>
                    </td>
                    <td className="py-3 pr-3">{u.project_count}</td>
                    <td className="py-3 pr-3 text-right">
                      <div className="inline-flex gap-1">
                        <button onClick={() => toggleAdmin(u)} title={u.roles.includes("admin") ? "Demote" : "Promote to admin"} className="p-2 rounded-lg hover:bg-surface transition">
                          {u.roles.includes("admin") ? <Shield className="h-4 w-4 text-primary" /> : <Check className="h-4 w-4" />}
                        </button>
                        <button onClick={() => toggleStatus(u)} title="Enable/disable" className="p-2 rounded-lg hover:bg-surface transition">
                          <Ban className="h-4 w-4" />
                        </button>
                        <button onClick={() => remove(u)} title="Delete user" className="p-2 rounded-lg hover:bg-destructive/10 text-destructive transition">
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <AddUserPanel onDone={reload} />
        <ApiKeysPanel />
      </main>
    </div>
  );
}

/* ---------------- Add user ---------------- */
function AddUserPanel({ onDone }: { onDone: () => void }) {
  const create = useServerFn(createUserAccount);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [makeAdmin, setMakeAdmin] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await create({ data: { email, password, displayName, makeAdmin } });
      toast.success("User created");
      setEmail(""); setPassword(""); setDisplayName(""); setMakeAdmin(false); setOpen(false);
      onDone();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not create user");
    } finally { setBusy(false); }
  }

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <UserPlus className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">Add a user</h2>
        </div>
        <button onClick={() => setOpen((o) => !o)} className="rounded-lg px-3 py-1.5 text-xs font-semibold gradient-brand text-primary-foreground transition hover:opacity-90">
          {open ? "Close" : "New user"}
        </button>
      </div>
      {open && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Full name"><input required value={displayName} onChange={(e) => setDisplayName(e.target.value)} className={inputCls} placeholder="Ada Lovelace" /></Field>
          <Field label="Email"><input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="ada@example.com" /></Field>
          <Field label="Password"><input required type="password" minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={inputCls} placeholder="At least 8 characters" /></Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={makeAdmin} onChange={(e) => setMakeAdmin(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Grant admin access
          </label>
          <div className="sm:col-span-2">
            <button disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold gradient-brand text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {busy ? "Creating…" : "Create user"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

/* ---------------- AI API keys ---------------- */
type KeyRow = {
  id: string; label: string; masked: string; priority: number;
  is_active: boolean; exhausted_at: string | null; last_error: string | null;
};

function ApiKeysPanel() {
  const list = useServerFn(listApiKeys);
  const save = useServerFn(upsertApiKey);
  const del = useServerFn(deleteApiKey);
  const [rows, setRows] = useState<KeyRow[]>([]);
  const [editing, setEditing] = useState<KeyRow | null>(null);
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [priority, setPriority] = useState(1);
  const [isActive, setIsActive] = useState(true);
  const [busy, setBusy] = useState(false);

  async function reload() {
    try { setRows((await list()) as KeyRow[]); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed to load keys"); }
  }
  useEffect(() => { reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  function startAdd() {
    setEditing(null); setAdding(true);
    setLabel(""); setApiKey(""); setPriority(rows.length + 1); setIsActive(true);
  }
  function startEdit(r: KeyRow) {
    setAdding(false); setEditing(r);
    setLabel(r.label); setApiKey(""); setPriority(r.priority); setIsActive(r.is_active);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await save({ data: { id: editing?.id, label, apiKey: apiKey || undefined, priority, isActive } });
      toast.success(editing ? "Key updated" : "Key added");
      setAdding(false); setEditing(null); setApiKey("");
      reload();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save key");
    } finally { setBusy(false); }
  }

  async function remove(r: KeyRow) {
    if (!confirm(`Remove the key "${r.label}"?`)) return;
    try { await del({ data: { id: r.id } }); toast.success("Key removed"); reload(); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Failed"); }
  }

  return (
    <section className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="inline-flex items-center gap-2">
          <KeyRound className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-semibold">AI API keys</h2>
        </div>
        <button onClick={startAdd} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold gradient-brand text-primary-foreground transition hover:opacity-90">
          <Plus className="h-3.5 w-3.5" /> Add key
        </button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Keys are tried in priority order — lowest number first. If one runs out of credits or is rate-limited,
        Kenzo automatically falls back to the next key and notifies every admin.
      </p>

      <div className="mt-4 space-y-2">
        {rows.length === 0 && (
          <div className="rounded-xl border border-dashed border-border p-6 text-center text-sm text-muted-foreground">
            No custom keys — Kenzo is using the built-in platform key.
          </div>
        )}
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center gap-3 rounded-xl bg-surface/60 border border-border px-4 py-3">
            <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-primary/10 px-1.5 text-xs font-semibold text-primary">{r.priority}</span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="font-medium text-sm truncate">{r.label}</span>
                {!r.is_active && <span className="text-[10px] uppercase tracking-wide rounded-full bg-muted px-2 py-0.5 text-muted-foreground">paused</span>}
                {r.exhausted_at && (
                  <span className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide rounded-full bg-destructive/10 px-2 py-0.5 text-destructive">
                    <AlertTriangle className="h-3 w-3" /> exhausted
                  </span>
                )}
              </div>
              <div className="text-xs text-muted-foreground font-mono">{r.masked}</div>
              {r.last_error && <div className="text-[11px] text-destructive/80 truncate">{r.last_error}</div>}
            </div>
            <button onClick={() => startEdit(r)} className="rounded-lg px-3 py-1.5 text-xs hover:bg-surface transition border border-border">Edit</button>
            <button onClick={() => remove(r)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10 transition" title="Remove key">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>

      {(adding || editing) && (
        <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2 rounded-xl border border-border p-4">
          <Field label="Label"><input required value={label} onChange={(e) => setLabel(e.target.value)} className={inputCls} placeholder="Primary key" /></Field>
          <Field label={editing ? "New key value (leave blank to keep)" : "API key"}>
            <input type="password" required={!editing} value={apiKey} onChange={(e) => setApiKey(e.target.value)} className={inputCls} placeholder="sk-…" autoComplete="off" />
          </Field>
          <Field label="Priority (1 = primary)">
            <input type="number" min={1} max={99} value={priority} onChange={(e) => setPriority(Number(e.target.value))} className={inputCls} />
          </Field>
          <label className="flex items-end gap-2 pb-2 text-sm">
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} className="h-4 w-4 accent-[var(--primary)]" />
            Active
          </label>
          <div className="sm:col-span-2 flex gap-2">
            <button disabled={busy} className="rounded-lg px-4 py-2 text-sm font-semibold gradient-brand text-primary-foreground transition hover:opacity-90 disabled:opacity-60">
              {busy ? "Saving…" : editing ? "Save changes" : "Add key"}
            </button>
            <button type="button" onClick={() => { setAdding(false); setEditing(null); }} className="rounded-lg px-4 py-2 text-sm border border-border hover:bg-surface transition">
              Cancel
            </button>
          </div>
        </form>
      )}
    </section>
  );
}

const inputCls =
  "w-full rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}

function StatCard({ icon: Icon, label, value }: { icon: React.ComponentType<{ className?: string }>; label: string; value: number }) {
  return (
    <div className="glass rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <div className="inline-flex h-8 w-8 items-center justify-center rounded-lg gradient-brand text-primary-foreground">
          <Icon className="h-4 w-4" />
        </div>
      </div>
      <div className="mt-2 text-3xl font-bold">{value.toLocaleString()}</div>
    </div>
  );
}
