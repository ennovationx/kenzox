import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listCollaborators, shareProject, updateShare } from "@/lib/share.functions";
import { toast } from "sonner";
import { Link2, Loader2, Mail, Plus, Trash2, X } from "lucide-react";

type Collab = {
  id: string;
  email: string;
  role: string;
  status: string;
  display_name: string | null;
  avatar_url: string | null;
};

function initials(email: string, name: string | null) {
  const s = (name || email).trim();
  return s.slice(0, 2).toUpperCase();
}

export function Avatars({ people, onAdd }: { people: Collab[]; onAdd: () => void }) {
  return (
    <div className="flex items-center">
      <div className="flex -space-x-2">
        {people.slice(0, 4).map((p) => (
          <span
            key={p.id}
            title={`${p.display_name || p.email} · ${p.role}`}
            className="h-7 w-7 rounded-full ring-2 ring-background grid place-items-center text-[10px] font-semibold gradient-brand text-primary-foreground overflow-hidden"
          >
            {p.avatar_url ? (
              <img src={p.avatar_url} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(p.email, p.display_name)
            )}
          </span>
        ))}
      </div>
      <button
        onClick={onAdd}
        aria-label="Share project"
        className="ml-1 h-7 w-7 rounded-full border border-dashed border-border grid place-items-center text-muted-foreground hover:text-foreground hover:border-primary transition active:scale-95"
      >
        <Plus className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function ShareDialog({
  projectId,
  projectName,
  isOwner,
  onClose,
  onChanged,
}: {
  projectId: string;
  projectName: string;
  isOwner: boolean;
  onClose: () => void;
  onChanged?: () => void;
}) {
  const list = useServerFn(listCollaborators);
  const share = useServerFn(shareProject);
  const upd = useServerFn(updateShare);

  const [people, setPeople] = useState<Collab[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"viewer" | "editor">("viewer");
  const [busy, setBusy] = useState(false);

  async function refresh() {
    try {
      const r = await list({ data: { projectId } });
      setPeople(r.collaborators as Collab[]);
    } catch {
      /* ignore */
    }
  }

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || busy) return;
    setBusy(true);
    try {
      const r = await share({ data: { projectId, email: email.trim(), role } });
      toast.success(r.pending ? `Invite saved for ${r.invited}` : `Shared with ${r.invited}`);
      setEmail("");
      await refresh();
      onChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not share");
    } finally {
      setBusy(false);
    }
  }

  async function copyLink() {
    const url = `${window.location.origin}/app?project=${projectId}`;
    await navigator.clipboard.writeText(url);
    toast.success("Project link copied — anyone opening it can request access.");
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full max-w-lg rounded-2xl glass-strong border border-glass-border shadow-lift p-6 animate-fade-in-up">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-semibold">Share “{projectName}”</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Invite teammates by email or copy the link.</p>
          </div>
          <button onClick={onClose} aria-label="Close" className="p-2 rounded-lg hover:bg-surface transition">
            <X className="h-4 w-4" />
          </button>
        </div>

        {isOwner ? (
          <form onSubmit={invite} className="mt-5 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="teammate@company.com"
                className="w-full rounded-lg bg-input border border-border pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
            </div>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as "viewer" | "editor")}
              className="rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary"
            >
              <option className="bg-background text-foreground" value="viewer">Can view</option>
              <option className="bg-background text-foreground" value="editor">Can edit</option>
            </select>
            <button
              type="submit"
              disabled={busy || !email.trim()}
              className="rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-lift disabled:opacity-50 hover:opacity-90 transition active:scale-95"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Invite"}
            </button>
          </form>
        ) : (
          <p className="mt-4 text-sm text-muted-foreground">Only the owner can change who has access.</p>
        )}

        <div className="mt-5 space-y-1 max-h-64 overflow-auto">
          {people.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">No collaborators yet.</p>
          )}
          {people.map((p) => (
            <div key={p.id} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-surface transition">
              <span className="h-8 w-8 rounded-full grid place-items-center text-xs font-semibold gradient-brand text-primary-foreground overflow-hidden shrink-0">
                {p.avatar_url ? <img src={p.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(p.email, p.display_name)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm truncate">{p.display_name || p.email}</p>
                <p className="text-xs text-muted-foreground truncate">
                  {p.email} {p.status === "pending" && "· invite pending"}
                </p>
              </div>
              {isOwner ? (
                <>
                  <select
                    value={p.role}
                    onChange={async (e) => {
                      await upd({ data: { shareId: p.id, projectId, role: e.target.value as "viewer" | "editor" } });
                      refresh();
                    }}
                    className="rounded-md bg-input border border-border px-2 py-1 text-xs outline-none"
                  >
                    <option className="bg-background text-foreground" value="viewer">Can view</option>
                    <option className="bg-background text-foreground" value="editor">Can edit</option>
                  </select>
                  <button
                    onClick={async () => {
                      await upd({ data: { shareId: p.id, projectId, remove: true } });
                      refresh();
                      onChanged?.();
                    }}
                    aria-label={`Remove ${p.email}`}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive transition"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <span className="text-xs text-muted-foreground capitalize">{p.role}</span>
              )}
            </div>
          ))}
        </div>

        <div className="mt-5 pt-4 border-t border-glass-border flex justify-between items-center">
          <button
            onClick={copyLink}
            className="inline-flex items-center gap-2 rounded-lg glass px-3 py-2 text-sm hover:bg-surface transition active:scale-95"
          >
            <Link2 className="h-4 w-4" /> Copy link
          </button>
          <button onClick={onClose} className="rounded-lg px-4 py-2 text-sm hover:bg-surface transition">
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
