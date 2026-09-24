import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getGithubConnection,
  startGithubOAuth,
  disconnectGithub,
} from "@/lib/github.functions";
import { toast } from "sonner";
import { Github, Loader2, Check, ExternalLink, Unlink } from "lucide-react";

export function GithubPanel() {
  const [loading, setLoading] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState<string | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  const fetchConnection = useServerFn(getGithubConnection);
  const startOAuth = useServerFn(startGithubOAuth);
  const disconnect = useServerFn(disconnectGithub);

  async function load() {
    setLoading(true);
    try {
      const res = await fetchConnection();
      setConnected(res.connected);
      if (res.connected) {
        setUsername(res.username ?? null);
        setAvatarUrl(res.avatarUrl ?? null);
      }
    } catch {
      setConnected(false);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleConnect() {
    try {
      setConnecting(true);
      const res = await startOAuth({ data: { origin: window.location.origin } });
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e?.message || "Failed to start GitHub connection");
      setConnecting(false);
    }
  }

  async function handleDisconnect() {
    if (!confirm("Disconnect your GitHub account?")) return;
    try {
      await disconnect();
      toast.success("GitHub disconnected");
      setConnected(false);
      setUsername(null);
      setAvatarUrl(null);
    } catch (e: any) {
      toast.error(e?.message || "Failed to disconnect");
    }
  }

  return (
    <div className="rounded-2xl glass-strong border border-glass-border p-5 shadow-lift space-y-4">
      <div className="flex items-center justify-between gap-3 pb-3 border-b border-glass-border">
        <div className="flex items-center gap-2">
          <div className="p-2 rounded-xl bg-primary/10 text-primary">
            <Github className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold">GitHub Integration</h3>
            <p className="text-xs text-muted-foreground">
              Sync your web apps directly to GitHub repositories
            </p>
          </div>
        </div>

        {connected && (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
            <Check className="h-3 w-3" /> Connected
          </span>
        )}
      </div>

      {loading ? (
        <div className="py-6 flex justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : connected ? (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl bg-surface/50 border border-glass-border">
          <div className="flex items-center gap-3">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt={username || "GitHub user"}
                className="h-10 w-10 rounded-full border border-glass-border object-cover"
              />
            ) : (
              <div className="h-10 w-10 rounded-full bg-surface border border-glass-border grid place-items-center">
                <Github className="h-5 w-5" />
              </div>
            )}
            <div>
              <p className="text-sm font-semibold text-foreground">@{username}</p>
              <a
                href={`https://github.com/${username}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-primary hover:underline inline-flex items-center gap-1"
              >
                View Profile <ExternalLink className="h-3 w-3" />
              </a>
            </div>
          </div>

          <button
            onClick={handleDisconnect}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive/10 text-xs font-medium transition"
          >
            <Unlink className="h-3.5 w-3.5" /> Disconnect
          </button>
        </div>
      ) : (
        <div className="py-4 space-y-3">
          <p className="text-xs text-muted-foreground leading-relaxed">
            Connecting GitHub allows Kenzo to automatically create repositories, commit your HTML, CSS, JavaScript files, and generate a professional README with a single click.
          </p>

          <button
            onClick={handleConnect}
            disabled={connecting}
            className="inline-flex items-center gap-2 rounded-xl gradient-brand px-4 py-2 text-xs font-semibold text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-95 disabled:opacity-40"
          >
            {connecting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Github className="h-4 w-4" />}
            Connect GitHub Account
          </button>
        </div>
      )}
    </div>
  );
}
