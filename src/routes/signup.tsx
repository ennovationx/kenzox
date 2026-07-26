import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";
import { z } from "zod";
import { Field } from "./login";

export const Route = createFileRoute("/signup")({
  head: () => ({
    meta: [
      { title: "Create your Kenzo account" },
      { name: "description", content: "Create a free Kenzo account and start building web apps with AI." },
      { property: "og:title", content: "Create your Kenzo account" },
      { property: "og:description", content: "Create a free Kenzo account and start building web apps with AI." },
    ],
  }),
  component: SignupPage,
});

const schema = z
  .object({
    name: z.string().trim().min(1, "Name is required").max(80),
    email: z.string().trim().email("Enter a valid email").max(255),
    password: z
      .string()
      .min(8, "Password must be at least 8 characters")
      .max(128)
      .regex(/[A-Za-z]/, "Include at least one letter")
      .regex(/[0-9]/, "Include at least one number"),
    confirm: z.string(),
    terms: z.literal(true, { errorMap: () => ({ message: "You must accept the terms" }) }),
  })
  .refine((d) => d.password === d.confirm, { path: ["confirm"], message: "Passwords don't match" });

function SignupPage() {
  const navigate = useNavigate();
  const [f, setF] = useState({ name: "", email: "", password: "", confirm: "", terms: false });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) navigate({ to: "/app", replace: true });
    });
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = schema.safeParse(f);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    setLoading(true);
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${window.location.origin}/app`,
        data: { display_name: parsed.data.name },
      },
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success("Account created. Welcome to Kenzo!");
    navigate({ to: "/app", replace: true });
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-8"><Logo size={36} /></div>
        <div className="glass rounded-2xl p-8 shadow-lift animate-fade-in-up">
          <h1 className="text-2xl font-bold">Create your account</h1>
          <p className="mt-1 text-sm text-muted-foreground">It's free to start. No credit card.</p>

          <form onSubmit={onSubmit} className="mt-6 space-y-4">
            <Field label="Name" type="text" value={f.name} onChange={(v) => setF({ ...f, name: v })} autoComplete="name" required />
            <Field label="Email" type="email" value={f.email} onChange={(v) => setF({ ...f, email: v })} autoComplete="email" required />
            <Field label="Password" type="password" value={f.password} onChange={(v) => setF({ ...f, password: v })} autoComplete="new-password" required minLength={8} />
            <Field label="Confirm password" type="password" value={f.confirm} onChange={(v) => setF({ ...f, confirm: v })} autoComplete="new-password" required minLength={8} />

            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                checked={f.terms}
                onChange={(e) => setF({ ...f, terms: e.target.checked })}
                className="mt-0.5 rounded border-border"
                required
              />
              <span className="text-muted-foreground">
                I agree to the terms of service and privacy policy.
              </span>
            </label>

            <button type="submit" disabled={loading} className="w-full rounded-lg gradient-brand px-4 py-2.5 font-medium text-primary-foreground shadow-lift transition hover:opacity-90 disabled:opacity-50">
              {loading ? "Creating account…" : "Create account"}
            </button>
          </form>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            Already have an account? <Link to="/login" className="text-primary font-medium hover:underline">Log in</Link>
          </p>
        </div>
      </div>
    </div>
  );
}
