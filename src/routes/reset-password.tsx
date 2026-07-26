import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Logo } from "@/components/Logo";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Reset password — Kenzo" },
      { name: "description", content: "Set a new password for your Kenzo account." },
      { property: "og:title", content: "Reset password — Kenzo" },
      { property: "og:description", content: "Set a new password for your Kenzo account." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase handles the recovery link automatically via detectSessionInUrl.
    if (typeof window !== "undefined" && !window.location.hash.includes("type=recovery")) {
      // Still allow submission when session exists (e.g. user came back)
    }
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) return toast.error("Password must be 8+ characters");
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Password updated. You're signed in.");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Logo size={36} /></div>
        <form onSubmit={onSubmit} className="glass rounded-2xl p-8 shadow-lift space-y-4 animate-fade-in-up">
          <h1 className="text-2xl font-bold">Set a new password</h1>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="New password"
            minLength={8}
            required
            className="w-full rounded-lg bg-input border border-border px-3 py-2.5 outline-none focus:border-primary focus:ring-2 focus:ring-primary/25"
          />
          <button disabled={loading} className="w-full rounded-lg gradient-brand px-4 py-2.5 font-medium text-primary-foreground shadow-lift disabled:opacity-50">
            {loading ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
