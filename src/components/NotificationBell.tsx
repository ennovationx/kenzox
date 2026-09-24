import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check, Inbox, X } from "lucide-react";

type Notif = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  read: boolean;
  created_at: string;
};

function timeAgo(iso: string) {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

function getStoredSeen(): Set<string> {
  try {
    const raw = localStorage.getItem("kenzo:seenNotifs");
    return raw ? new Set(JSON.parse(raw)) : new Set<string>();
  } catch {
    return new Set<string>();
  }
}

function persistSeen(set: Set<string>) {
  try {
    localStorage.setItem("kenzo:seenNotifs", JSON.stringify(Array.from(set).slice(-300)));
  } catch {}
}

export function NotificationBell({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const seen = useRef<Set<string>>(getStoredSeen());
  const bellRef = useRef<HTMLButtonElement | null>(null);

  const unread = items.filter((n) => !n.read && !seen.current.has(n.id)).length;

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);

    const rows = ((data ?? []) as Notif[]).map((n) =>
      seen.current.has(n.id) ? { ...n, read: true } : n,
    );
    setItems(rows);
  }

  useEffect(() => {
    if (!userId) return;
    load();
    const ch = supabase
      .channel(`notif:${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [userId]);

  /** Opening the panel marks everything in it read, once and for good. */
  async function markAll(ids?: string[]) {
    const list = ids ?? items.filter((n) => !n.read).map((n) => n.id);
    if (!list.length) return;
    list.forEach((id) => seen.current.add(id));
    persistSeen(seen.current);
    setItems((prev) => prev.map((n) => (list.includes(n.id) ? { ...n, read: true } : n)));
    await supabase.from("notifications").update({ read: true }).in("id", list);
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) {
      const ids = items.filter((n) => !n.read).map((n) => n.id);
      if (ids.length) void markAll(ids);
    }
  }

  const panel = open
    ? createPortal(
        <div className="fixed inset-0 z-[9999]" role="dialog" aria-label="Notifications">
          <div className="absolute inset-0 bg-background/60 backdrop-blur-[2px]" onClick={() => setOpen(false)} />
          <div className="absolute right-3 top-16 w-[min(22rem,calc(100vw-1.5rem))] rounded-2xl glass-strong border border-glass-border shadow-lift overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border bg-background/80">
              <span className="text-sm font-semibold">Notifications</span>
              <div className="flex items-center gap-1">
                {items.some((n) => !n.read && !seen.current.has(n.id)) && (
                  <button onClick={() => markAll()} className="inline-flex items-center gap-1 text-xs text-primary hover:underline px-2 py-1">
                    <Check className="h-3 w-3" /> Mark all read
                  </button>
                )}
                <button onClick={() => setOpen(false)} aria-label="Close notifications" className="p-1.5 rounded-lg hover:bg-surface transition">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
            <div className="max-h-[70vh] overflow-auto bg-background/80">
              {items.length === 0 && (
                <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                  <Inbox className="h-5 w-5 mx-auto mb-2 opacity-60" />
                  You're all caught up.
                </div>
              )}
              {items.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 border-b border-glass-border/60 last:border-0 ${n.read ? "" : "bg-primary/5"}`}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />}
                    <div className="min-w-0">
                      <p className="text-sm font-medium leading-snug text-foreground break-words">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5 break-words">{n.body}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>,
        document.body,
      )
    : null;

  return (
    <>
      <button
        ref={bellRef}
        onClick={toggle}
        aria-label={unread ? `${unread} unread notifications` : "Notifications"}
        className="relative p-2 rounded-lg hover:bg-surface transition active:scale-95"
      >
        <Bell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[17px] h-[17px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold grid place-items-center">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>
      {panel}
    </>
  );
}
