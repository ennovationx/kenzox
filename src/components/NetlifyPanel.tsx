import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Rocket, Link2, Unlink, Loader2, CheckCircle2, KeyRound } from "lucide-react";
import {
  getNetlifyConnection,
  startNetlifyOAuth,
  connectNetlifyToken,
  disconnectNetlify,
} from "@/lib/netlify.functions";

type Conn =
  | { connected: false }
  | { connected: true; accountName: string; accountEmail?: string | null; connectedAt?: string };

export function NetlifyPanel() {
  const [conn, setConn] = useState<Conn | null>(null);
  const [busy, setBusy] = useState(false);
  const [token, setToken] = useState("");
  const [showToken, setShowToken] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setConn((await getNetlifyConnection()) as Conn);
    } catch {
      setConn({ connected: false });
    }
  }, []);

  useEffect(() => {
    void refresh();
    const status = new URLSearchParams(window.location.search).get("netlify");
    if (!status) return;
    if (status === "connected") toast.success("Netlify connected");
    else if (status === "expired") toast.error("That connection link expired. Try again.");
    else if (status === "unconfigured") toast.error("Netlify OAuth is not configured on the server.");
    else toast.error("Netlify connection failed. Try again.");
    window.history.replaceState({}, "", window.location.pathname);
  }, [refresh]);

  async function connectOAuth() {
    setBusy(true);
    try {
      const res = await startNetlifyOAuth({ data: { origin: window.location.origin } });
      window.location.href = res.url;
    } catch (e) {
      setBusy(false);
      toast.error(e instanceof Error ? e.message : "Could not start Netlify authorization.");
    }
  }

  async function connectPat() {
    if (token.trim().length < 20) return toast.error("Paste a valid Netlify personal access token.");
    setBusy(true);
    try {
      const res = await connectNetlifyToken({ data: { token: token.trim() } });
      setToken("");
      setShowToken(false);
      toast.success(`Connected as ${res.accountName}`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not connect.");
    } finally {
      setBusy(false);
    }
  }

  async function disconnect() {
    setBusy(true);
    try {
      await disconnectNetlify();
      toast.success("Netlify disconnected");
      await refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">Deployments</h2>
        <p className="text-sm text-muted-foreground">Connect Netlify once, then publish any project in one click.</p>
      </div>

      <div className="rounded-xl border border-glass-border glass p-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-primary/15 text-primary grid place-items-center shrink-0">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            {conn === null ? (
              <p className="text-sm text-muted-foreground">Checking connection…</p>
            ) : conn.connected ? (
              <>
                <p className="text-sm font-medium inline-flex items-center gap-1.5">
                  <CheckCircle2 className="h-4 w-4 text-primary" /> Connected as {conn.accountName}
                </p>
                {conn.accountEmail && <p className="text-xs text-muted-foreground truncate">{conn.accountEmail}</p>}
              </>
            ) : (
              <>
                <p className="text-sm font-medium">Not connected</p>
                <p className="text-xs text-muted-foreground">Authorize Netlify to publish your sites.</p>
              </>
            )}
          </div>
          {conn?.connected ? (
            <button
              onClick={disconnect}
              disabled={busy}
              className="rounded-lg border border-destructive/50 text-destructive px-3 py-2 text-sm font-medium hover:bg-destructive/10 transition inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Unlink className="h-4 w-4" /> Disconnect
            </button>
          ) : (
            <button
              onClick={connectOAuth}
              disabled={busy}
              className="rounded-lg gradient-brand px-4 py-2 text-sm font-medium text-primary-foreground shadow-lift inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />} Connect Netlify
            </button>
          )}
        </div>
      </div>

      {!conn?.connected && (
        <div className="rounded-xl border border-glass-border glass p-4">
          <button
            onClick={() => setShowToken((v) => !v)}
            className="text-sm font-medium inline-flex items-center gap-2 hover:text-primary transition"
          >
            <KeyRound className="h-4 w-4" /> Use a personal access token instead
          </button>
          {showToken && (
            <div className="mt-3 flex gap-2">
              <input
                type="password"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                placeholder="nfp_…"
                className="flex-1 rounded-lg bg-input border border-border px-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
              />
              <button
                onClick={connectPat}
                disabled={busy}
                className="rounded-lg glass px-4 py-2 text-sm font-medium hover:bg-surface disabled:opacity-50"
              >
                Connect
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
