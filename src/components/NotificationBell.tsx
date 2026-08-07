import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Bell, Check, Inbox } from "lucide-react";

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

export function NotificationBell({ userId }: { userId: string | null }) {
  const [items, setItems] = useState<Notif[]>([]);
  const [open, setOpen] = useState(false);
  const popRef = useRef<HTMLDivElement | null>(null);

  const unread = items.filter((n) => !n.read).length;

  async function load() {
    const { data } = await supabase
      .from("notifications")
      .select("id, type, title, body, read, created_at")
      .order("created_at", { ascending: false })
      .limit(30);
    setItems((data ?? []) as Notif[]);
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

  // Mark visible items read shortly after the panel is opened.
  useEffect(() => {
    if (!open || unread === 0) return;
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    const t = setTimeout(async () => {
      await supabase.from("notifications").update({ read: true }).in("id", ids);
      setItems((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n)));
    }, 900);
    return () => clearTimeout(t);
  }, [open, unread, items]);

  async function markAll() {
    const ids = items.filter((n) => !n.read).map((n) => n.id);
    if (!ids.length) return;
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setItems((prev) => prev.map((n) => ({ ...n, read: true })));
  }

  return (
    <div className="relative" ref={popRef}>
      <button
        onClick={() => setOpen((v) => !v)}
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

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 mt-2 w-80 z-50 rounded-2xl glass-strong border border-glass-border shadow-lift overflow-hidden animate-fade-in-up">
            <div className="flex items-center justify-between px-4 py-3 border-b border-glass-border">
              <span className="text-sm font-semibold">Notifications</span>
              {unread > 0 && (
                <button onClick={markAll} className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                  <Check className="h-3 w-3" /> Mark all read
                </button>
              )}
            </div>
            <div className="max-h-96 overflow-auto">
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
                      <p className="text-sm font-medium leading-snug">{n.title}</p>
                      {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                      <p className="text-[11px] text-muted-foreground mt-1">{timeAgo(n.created_at)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
