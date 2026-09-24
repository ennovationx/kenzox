import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  listUserApiKeys,
  upsertUserApiKey,
  deleteUserApiKey,
  getGiveawayQuota,
} from "@/lib/user-keys.functions";
import { toast } from "sonner";
import {
  Key,
  Plus,
  Trash2,
  ExternalLink,
  Gift,
  ShieldCheck,
  AlertCircle,
  Loader2,
  Sparkles,
  Info,
} from "lucide-react";

export function UserApiKeysPanel() {
  const [keys, setKeys] = useState<
    Array<{
      id: string;
      label: string;
      masked: string;
      priority: number;
      isActive: boolean;
      exhaustedAt: string | null;
      lastError: string | null;
      createdAt: string;
    }>
  >([]);
  const [quota, setQuota] = useState<{
    isAdmin: boolean;
    dailyLimit: number;
    usedToday: number;
    remaining: number;
    hasUserKey: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [label, setLabel] = useState("My Gemini Key");
  const [apiKey, setApiKey] = useState("");
  const [saving, setSaving] = useState(false);

  const fetchKeys = useServerFn(listUserApiKeys);
  const saveKey = useServerFn(upsertUserApiKey);
  const removeKey = useServerFn(deleteUserApiKey);
  const fetchQuota = useServerFn(getGiveawayQuota);

  async function loadData() {
    setLoading(true);
    try {
      const [kList, q] = await Promise.all([fetchKeys(), fetchQuota()]);
      setKeys(kList);
      setQuota(q);
    } catch {
      // quiet fail
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadData();
  }, []);

  async function handleAddKey() {
    if (!apiKey.trim()) {
      toast.error("Please enter a valid Gemini API key.");
      return;
    }
    setSaving(true);
    try {
      await saveKey({
        data: {
          label: label.trim() || "My Gemini Key",
          apiKey: apiKey.trim(),
          isActive: true,
        },
      });
      toast.success("API key added successfully!");
      setApiKey("");
      setDialogOpen(false);
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to add API key");
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteKey(id: string) {
    if (!confirm("Are you sure you want to remove this API key?")) return;
    try {
      await removeKey({ data: { id } });
      toast.success("Key deleted");
      loadData();
    } catch (e: any) {
      toast.error(e?.message || "Failed to delete key");
    }
  }

  return (
    <div className="space-y-6">
      {/* Daily Giveaway Card */}
      <div className="rounded-2xl glass-strong border border-glass-border p-5 shadow-lift space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Gift className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Additional Giveaway</h3>
              <p className="text-xs text-muted-foreground">
                Free daily prompts provided by Kenzo as backup
              </p>
            </div>
          </div>
          {quota?.isAdmin ? (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-primary/15 text-primary border border-primary/20">
              Admin: Unlimited
            </span>
          ) : (
            <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-surface text-foreground border border-glass-border tabular-nums">
              {quota?.remaining ?? 3} / 3 remaining today
            </span>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">
          Kenzo always uses your personal API key first. If your key runs out of quota or you don't have one added yet, you receive <strong>3 free giveaway prompts per day</strong> from the server key pool (resets automatically every 24 hours).
        </p>

        <div className="w-full bg-input rounded-full h-2 overflow-hidden">
          <div
            className="h-full gradient-brand transition-all duration-500"
            style={{
              width: quota?.isAdmin
                ? "100%"
                : `${Math.min(100, (((quota?.usedToday ?? 0) / 3) * 100))}%`,
            }}
          />
        </div>
      </div>

      {/* BYOK Section */}
      <div className="rounded-2xl glass-strong border border-glass-border p-5 shadow-lift space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-glass-border">
          <div className="flex items-center gap-2">
            <div className="p-2 rounded-xl bg-primary/10 text-primary">
              <Key className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-semibold">Your Gemini API Keys (BYOK)</h3>
              <p className="text-xs text-muted-foreground">
                Bring your own key for unlimited, personal generations
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-glass-border text-xs font-medium hover:bg-surface transition"
            >
              Get Free Key <ExternalLink className="h-3 w-3" />
            </a>

            <button
              onClick={() => setDialogOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-lg gradient-brand px-3 py-1.5 text-xs font-medium text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-95"
            >
              <Plus className="h-3.5 w-3.5" /> Add API Key
            </button>
          </div>
        </div>

        {loading ? (
          <div className="py-8 flex justify-center">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : keys.length === 0 ? (
          <div className="py-8 text-center space-y-3">
            <Sparkles className="h-7 w-7 text-primary/60 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-medium">No personal API keys added</p>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Add your free Gemini API key to build without daily limitations. Keys are stored securely in your Supabase account.
              </p>
            </div>
            <a
              href="https://aistudio.google.com/app/apikey"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-primary font-medium hover:underline"
            >
              Create a free Gemini key on Google AI Studio <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between p-3.5 rounded-xl bg-surface/50 border border-glass-border hover:bg-surface transition"
              >
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-foreground truncate">{k.label}</span>
                    {k.exhaustedAt ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-destructive/15 text-destructive border border-destructive/20">
                        <AlertCircle className="h-3 w-3" /> Limit reached
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-primary/15 text-primary border border-primary/20">
                        <ShieldCheck className="h-3 w-3" /> Active
                      </span>
                    )}
                  </div>
                  <p className="text-xs font-mono text-muted-foreground">{k.masked}</p>
                  {k.lastError && (
                    <p className="text-[11px] text-destructive truncate max-w-xs">{k.lastError}</p>
                  )}
                </div>

                <button
                  onClick={() => handleDeleteKey(k.id)}
                  title="Delete key"
                  aria-label="Delete key"
                  className="p-2 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Add Key Modal */}
      {dialogOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-background/70 backdrop-blur-sm"
            onClick={() => setDialogOpen(false)}
          />

          <div className="relative w-full max-w-md rounded-2xl glass-strong border border-glass-border shadow-lift p-6 space-y-4 z-10 animate-fade-in-up">
            <div className="space-y-1">
              <h3 className="text-base font-semibold">Add Gemini API Key</h3>
              <p className="text-xs text-muted-foreground">
                Get a 100% free API key from Google AI Studio.
              </p>
            </div>

            <div className="space-y-3">
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">Key Label</label>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Personal Gemini Key"
                  className="w-full rounded-xl bg-input border border-border px-3.5 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-muted-foreground">API Key</label>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[11px] text-primary hover:underline flex items-center gap-1"
                  >
                    Get key from Google <ExternalLink className="h-2.5 w-2.5" />
                  </a>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... or AQ..."
                  className="w-full rounded-xl bg-input border border-border px-3.5 py-2 text-sm outline-none font-mono focus:border-primary focus:ring-2 focus:ring-primary/20"
                />
              </div>

              <div className="p-3 rounded-xl bg-primary/10 border border-primary/20 flex items-start gap-2.5">
                <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Your key is saved under your private account in Supabase. Kenzo uses your key first so you enjoy unlimited high-speed AI generations.
                </p>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setDialogOpen(false)}
                className="px-4 py-2 rounded-xl text-xs hover:bg-surface transition"
              >
                Cancel
              </button>
              <button
                onClick={handleAddKey}
                disabled={saving || !apiKey.trim()}
                className="inline-flex items-center gap-1.5 rounded-xl gradient-brand px-5 py-2 text-xs font-semibold text-primary-foreground shadow-lift hover:opacity-90 transition active:scale-95 disabled:opacity-40"
              >
                {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Save Key"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
