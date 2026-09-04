import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Rocket, Loader2, ExternalLink, Copy, Check, Pencil, History, RotateCcw, Unlink, X, AlertTriangle,
} from "lucide-react";
import {
  getNetlifyConnection, publishProject, checkSubdomain, renameNetlifySite,
  listDeploys, rollbackDeploy, unlinkNetlifySite,
} from "@/lib/netlify.functions";

type Deploy = { id: string; deploy_id: string; state: string; url: string | null; error_message: string | null; kind: string; created_at: string };

function notifyBrowser(title: string, body: string) {
  try {
    if (typeof Notification !== "undefined" && Notification.permission === "granted" && document.hidden) {
      new Notification(title, { body });
    }
  } catch { /* ignore */ }
}

export function PublishMenu({ projectId }: { projectId: string | null }) {
  const [open, setOpen] = useState(false);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [connected, setConnected] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [deploys, setDeploys] = useState<Deploy[]>([]);
  const [editing, setEditing] = useState(false);
  const [subdomain, setSubdomain] = useState("");
  const [avail, setAvail] = useState<{ available: boolean; reason?: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const inflight = useRef(false);

  const refreshDeploys = useCallback(async () => {
    if (!projectId) return;
    try {
      const res = await listDeploys({ data: { projectId } });
      setDeploys((res?.deploys ?? []) as Deploy[]);
      setLiveUrl(res?.url ?? null);
    } catch { /* ignore */ }
  }, [projectId]);

  useEffect(() => {
    getNetlifyConnection()
      .then((c) => setConnected(Boolean((c as { connected: boolean }).connected)))
      .catch(() => setConnected(false));
  }, []);

  useEffect(() => {
    setLiveUrl(null);
    setDeploys([]);
    void refreshDeploys();
  }, [refreshDeploys]);

  // Debounced subdomain availability check.
  useEffect(() => {
    if (!editing || subdomain.length < 3) { setAvail(null); return; }
    const t = setTimeout(async () => {
      try {
        setAvail((await checkSubdomain({ data: { name: subdomain } })) as { available: boolean; reason?: string });
      } catch { setAvail(null); }
    }, 450);
    return () => clearTimeout(t);
  }, [subdomain, editing]);

  async function doPublish() {
    if (!projectId) return toast.error("Save this project first — send a prompt to create it.");
    if (connected === false) {
      toast.error("Connect your Netlify account first.");
      window.location.href = "/settings?netlify=connect";
      return;
    }
    if (inflight.current) return;
    inflight.current = true;
    setBusy(true);
    if (typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
    try {
      const res = await publishProject({ data: { projectId } });
      setLiveUrl(res?.url ?? null);
      toast.success("Published", { description: res?.url ?? undefined });
      notifyBrowser("Your site is live", res?.url ?? "Deploy finished");
      setOpen(true);
      await refreshDeploys();
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Publish failed.";
      toast.error("Publish failed", { description: msg });
      notifyBrowser("Deploy failed", msg);
      if (/reconnect|Connect your Netlify/i.test(msg)) setConnected(false);
    } finally {
      inflight.current = false;
      setBusy(false);
    }
  }

  async function saveSubdomain() {
    if (!projectId || !avail?.available) return;
    setBusy(true);
    try {
      const res = await renameNetlifySite({ data: { projectId, name: subdomain } });
      setLiveUrl(res?.url ?? null);
      setEditing(false);
      toast.success("Address updated", { description: res?.url ?? undefined });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not update the address.");
    } finally {
      setBusy(false);
    }
  }

  async function doRollback(deployId: string) {
    if (!projectId) return;
    setBusy(true);
    try {
      const res = await rollbackDeploy({ data: { projectId, deployId } });
      setLiveUrl(res?.url ?? null);
      toast.success("Rolled back to that deploy");
      await refreshDeploys();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Rollback failed.");
    } finally {
      setBusy(false);
    }
  }

  async function doUnlink() {
    if (!projectId) return;
    setBusy(true);
    try {
      await unlinkNetlifySite({ data: { projectId } });
      setLiveUrl(null);
      setDeploys([]);
      toast.success("Project unlinked from Netlify");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not unlink.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="relative">
      <div className="flex items-center">
        <button
          onClick={doPublish}
          disabled={busy}
          title="Publish to Netlify"
          aria-label="Publish to Netlify"
          className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-2.5 sm:px-3 py-2 text-xs font-semibold text-primary-foreground shadow-lift transition active:scale-95 disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
          <span className="hidden sm:inline">{busy ? "Publishing…" : "Publish"}</span>
        </button>
        <button
          onClick={() => setOpen((v) => !v)}
          title="Deployments"
          aria-label="Deployments"
          className={`ml-1 p-2 rounded-lg transition active:scale-95 ${open ? "bg-primary/15 text-primary" : "hover:bg-surface"}`}
        >
          <History className="h-4 w-4" />
        </button>
      </div>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-[22rem] max-w-[92vw] z-50 rounded-2xl glass-strong border border-glass-border shadow-lift overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <span className="text-sm font-semibold">Deployments</span>
              <button onClick={() => setOpen(false)} aria-label="Close" className="p-1 rounded-md hover:bg-surface">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-4 py-3 border-b border-glass-border space-y-2">
              {connected === false && (
                <p className="text-xs text-muted-foreground inline-flex items-center gap-1.5">
                  <AlertTriangle className="h-3.5 w-3.5 text-destructive" /> Netlify not connected.
                </p>
              )}
              {liveUrl ? (
                editing ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <input
                        value={subdomain}
                        onChange={(e) => setSubdomain(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ""))}
                        placeholder="my-site"
                        className="flex-1 min-w-0 rounded-lg bg-input border border-border px-2.5 py-1.5 text-xs outline-none focus:border-primary"
                      />
                      <span className="text-xs text-muted-foreground">.netlify.app</span>
                    </div>
                    {avail && (
                      <p className={`text-[11px] ${avail.available ? "text-primary" : "text-destructive"}`}>
                        {avail.available ? "Available" : avail.reason || "Already taken"}
                      </p>
                    )}
                    <div className="flex gap-2">
                      <button onClick={saveSubdomain} disabled={!avail?.available || busy} className="rounded-lg gradient-brand px-3 py-1.5 text-xs font-medium text-primary-foreground disabled:opacity-50">Save</button>
                      <button onClick={() => setEditing(false)} className="rounded-lg glass px-3 py-1.5 text-xs hover:bg-surface">Cancel</button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <a href={liveUrl} target="_blank" rel="noreferrer" className="flex-1 min-w-0 truncate text-xs text-primary hover:underline">{liveUrl}</a>
                    <button onClick={() => { void navigator.clipboard.writeText(liveUrl); setCopied(true); setTimeout(() => setCopied(false), 1200); }} title="Copy link" aria-label="Copy link" className="p-1.5 rounded-md hover:bg-surface">
                      {copied ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                    </button>
                    <a href={liveUrl} target="_blank" rel="noreferrer" title="Visit site" aria-label="Visit site" className="p-1.5 rounded-md hover:bg-surface"><ExternalLink className="h-3.5 w-3.5" /></a>
                    <button onClick={() => { setEditing(true); setSubdomain(""); }} title="Edit address" aria-label="Edit address" className="p-1.5 rounded-md hover:bg-surface"><Pencil className="h-3.5 w-3.5" /></button>
                  </div>
                )
              ) : (
                <p className="text-xs text-muted-foreground">Not published yet. Hit Publish to go live.</p>
              )}
            </div>

            <div className="max-h-64 overflow-auto">
              {deploys.length === 0 && <p className="px-4 py-8 text-center text-xs text-muted-foreground">No deploys yet.</p>}
              {deploys.map((d) => (
                <div key={d.id} className="px-4 py-2.5 border-b border-glass-border/60 last:border-0 flex items-center gap-2">
                  <span className={`h-1.5 w-1.5 rounded-full shrink-0 ${d.state === "ready" ? "bg-primary" : d.state === "error" ? "bg-destructive" : "bg-muted-foreground"}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium capitalize">{d.kind} · {d.state}</p>
                    <p className="text-[11px] text-muted-foreground truncate">
                      {new Date(d.created_at).toLocaleString()}{d.error_message ? ` — ${d.error_message}` : ""}
                    </p>
                  </div>
                  {d.state === "ready" && (
                    <button onClick={() => doRollback(d.deploy_id)} disabled={busy} title="Restore this deploy" aria-label="Restore this deploy" className="p-1.5 rounded-md hover:bg-surface disabled:opacity-50">
                      <RotateCcw className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {liveUrl && (
              <div className="px-4 py-3 border-t border-glass-border flex gap-2">
                <button onClick={doPublish} disabled={busy} className="flex-1 rounded-lg glass px-3 py-2 text-xs font-medium hover:bg-surface disabled:opacity-50">Redeploy</button>
                <button onClick={doUnlink} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg border border-destructive/50 text-destructive px-3 py-2 text-xs font-medium hover:bg-destructive/10 disabled:opacity-50">
                  <Unlink className="h-3.5 w-3.5" /> Unlink
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
