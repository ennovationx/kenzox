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
      </main>
    </div>
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
