import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  getGithubConnection,
  startGithubOAuth,
  pushProjectToGithub,
} from "@/lib/github.functions";
import { toast } from "sonner";
import {
  Github,
  Loader2,
  ExternalLink,
  Lock,
  Globe,
  Check,
  X,
  UploadCloud,
  Copy,
} from "lucide-react";

export function GithubMenu({
  projectId,
  projectName,
  isOpen,
  onOpenChange,
  onPushed,
}: {
  projectId: string | null;
  projectName: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPushed?: (repoUrl: string, repoFullName: string) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(false);
  const open = isOpen !== undefined ? isOpen : internalOpen;
  const setOpen = (val: boolean) => {
    setInternalOpen(val);
    onOpenChange?.(val);
  };

  const [loading, setLoading] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [connected, setConnected] = useState(false);
  const [username, setUsername] = useState("");
  const [repoName, setRepoName] = useState("");
  const [isPrivate, setIsPrivate] = useState(false);
  const [description, setDescription] = useState("");
  const [lastPushedUrl, setLastPushedUrl] = useState<string | null>(null);

  const checkConnection = useServerFn(getGithubConnection);
  const startOAuth = useServerFn(startGithubOAuth);
  const pushRepo = useServerFn(pushProjectToGithub);

  useEffect(() => {
    if (open) {
      setLoading(true);
      checkConnection()
        .then((res) => {
          setConnected(res.connected);
          if (res.connected && res.username) {
            setUsername(res.username);
          }
          const slug = (projectName || "kenzo-app")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-+|-+$/g, "");
          setRepoName(slug || "kenzo-app");
        })
        .catch(() => setConnected(false))
        .finally(() => setLoading(false));
    }
  }, [open, projectName]);

  async function handleConnect() {
    try {
      setLoading(true);
      const res = await startOAuth({ data: { origin: window.location.origin } });
      window.location.href = res.url;
    } catch (e: any) {
      toast.error(e?.message || "Failed to start GitHub connection");
      setLoading(false);
    }
  }

  async function handlePush() {
    if (!projectId) {
      toast.info("Please describe and create a project first before pushing.");
      return;
    }
    if (!repoName.trim()) {
      toast.error("Please enter a repository name.");
      return;
    }

    try {
      setPushing(true);
      const res = await pushRepo({
        data: {
          projectId,
          repoName: repoName.trim(),
          isNew: true,
          isPrivate,
          description: description.trim() || `${projectName} — created with Kenzo AI`,
        },
      });

      setLastPushedUrl(res.repoUrl);
      toast.success(`Pushed to GitHub: ${res.repoFullName}`, {
        description: res.repoUrl,
        action: {
          label: "Open Repo",
          onClick: () => window.open(res.repoUrl, "_blank"),
        },
      });
      onPushed?.(res.repoUrl, res.repoFullName);
    } catch (e: any) {
      toast.error(e?.message || "Failed to push to GitHub");
    } finally {
      setPushing(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        title="Sync to GitHub"
        aria-label="Sync to GitHub"
        className="inline-flex items-center gap-1.5 p-2 rounded-lg hover:bg-surface text-muted-foreground hover:text-foreground transition active:scale-95"
      >
        <Github className="h-4 w-4" />
      </button>

      {open && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm animate-fade-in"
            onClick={() => setOpen(false)}
          />

          <div className="relative w-full max-w-md rounded-2xl glass-strong border border-glass-border shadow-lift p-6 animate-fade-in-up z-10">
            <div className="flex items-center justify-between pb-4 border-b border-glass-border">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-primary/10 text-primary">
                  <Github className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="text-base font-semibold">Push to GitHub</h3>
                  <p className="text-xs text-muted-foreground">
                    Export your project as a live GitHub repository
                  </p>
                </div>
              </div>
              <button
                onClick={() => setOpen(false)}
                className="p-1.5 rounded-lg hover:bg-surface transition text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {loading ? (
              <div className="py-12 flex flex-col items-center justify-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <span className="text-xs text-muted-foreground">Checking GitHub connection…</span>
              </div>
            ) : !connected ? (
              <div className="py-6 space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Connect your GitHub account to create repositories and push your code with an auto-generated professional README.
                </p>
                <button
                  onClick={handleConnect}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-xl gradient-brand px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-95"
                >
                  <Github className="h-4 w-4" /> Connect GitHub Account
                </button>
              </div>
            ) : (
              <div className="py-4 space-y-4">
                <div className="flex items-center justify-between text-xs px-3 py-2 rounded-lg bg-surface border border-glass-border">
                  <span className="text-muted-foreground">Connected Account</span>
                  <span className="font-medium text-foreground flex items-center gap-1.5">
                    <Check className="h-3.5 w-3.5 text-primary" /> @{username}
                  </span>
                </div>

                {lastPushedUrl ? (
                  <div className="p-4 rounded-xl bg-primary/10 border border-primary/30 space-y-2.5 animate-fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-primary uppercase tracking-wide flex items-center gap-1.5">
                        <Check className="h-3.5 w-3.5" /> Live GitHub Repository
                      </span>
                      <a
                        href={lastPushedUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Open <ExternalLink className="h-3 w-3" />
                      </a>
                    </div>
                    <div className="flex items-center gap-1.5 p-2 rounded-lg bg-surface border border-glass-border">
                      <input
                        readOnly
                        value={lastPushedUrl}
                        className="flex-1 bg-transparent text-xs text-foreground outline-none font-mono selection:bg-primary/30 select-all"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(lastPushedUrl);
                          toast.success("GitHub repository URL copied!");
                        }}
                        className="p-1.5 rounded-md hover:bg-input text-primary hover:text-primary-foreground transition active:scale-95"
                        title="Copy repository URL"
                      >
                        <Copy className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="text-[11px] text-muted-foreground flex items-center justify-between">
                      <span>Clone with Git:</span>
                      <code className="px-1.5 py-0.5 rounded bg-surface border border-glass-border font-mono text-[10px] text-foreground selection:bg-primary/30">
                        git clone {lastPushedUrl}.git
                      </code>
                    </div>
                  </div>
                ) : null}

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Repository Name
                  </label>
                  <input
                    value={repoName}
                    onChange={(e) => setRepoName(e.target.value)}
                    placeholder="my-cool-app"
                    className="w-full rounded-xl bg-input border border-border px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-muted-foreground">
                    Description (optional)
                  </label>
                  <input
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Web application built with Kenzo AI"
                    className="w-full rounded-xl bg-input border border-border px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  />
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs font-medium text-muted-foreground flex items-center gap-1.5">
                    {isPrivate ? <Lock className="h-3.5 w-3.5" /> : <Globe className="h-3.5 w-3.5" />}
                    Visibility: {isPrivate ? "Private" : "Public"}
                  </span>
                  <button
                    type="button"
                    onClick={() => setIsPrivate((v) => !v)}
                    className="text-xs text-primary hover:underline"
                  >
                    Switch to {isPrivate ? "Public" : "Private"}
                  </button>
                </div>

                <div className="pt-2 flex justify-end gap-2">
                  <button
                    onClick={() => setOpen(false)}
                    className="px-4 py-2 rounded-xl text-xs hover:bg-surface transition"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handlePush}
                    disabled={pushing || !repoName.trim()}
                    className="inline-flex items-center gap-2 rounded-xl gradient-brand px-5 py-2 text-xs font-semibold text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-95 disabled:opacity-40"
                  >
                    {pushing ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Pushing files…
                      </>
                    ) : (
                      <>
                        <UploadCloud className="h-3.5 w-3.5" /> Push Code & README
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
