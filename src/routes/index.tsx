import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ArrowRight, Sparkles, Code2, Eye, MessageSquare, Zap, Shield } from "lucide-react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Kenzo — Build web apps by chatting with AI" },
      { name: "description", content: "Kenzo turns natural-language prompts into complete, running web apps. Chat, edit code, preview live — instantly." },
      { property: "og:title", content: "Kenzo — Build web apps by chatting with AI" },
      { property: "og:description", content: "Kenzo turns natural-language prompts into complete, running web apps. Chat, edit code, preview live — instantly." },
    ],
  }),
  component: Landing,
});

function Landing() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-40 glass border-b border-glass-border">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Logo />
          <nav className="flex items-center gap-2">
            <Link to="/login" className="px-4 py-2 text-sm font-medium hover:text-primary transition">Log in</Link>
            <Link to="/signup" className="px-4 py-2 text-sm font-medium rounded-lg gradient-brand text-primary-foreground shadow-lift transition hover:opacity-90">
              Sign up
            </Link>
          </nav>
        </div>
      </header>

      <section className="mx-auto max-w-5xl px-6 pt-24 pb-16 text-center animate-fade-in-up">
        <span className="inline-flex items-center gap-2 rounded-full glass px-4 py-1.5 text-xs font-medium text-muted-foreground">
          <Sparkles className="h-3.5 w-3.5 text-primary" /> AI web builder — powered by GPT-5.4
        </span>
        <h1 className="mt-6 text-5xl md:text-7xl font-bold tracking-tight leading-[1.05]">
          Build web apps by <span className="text-gradient">chatting</span> with AI.
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
          Kenzo turns a prompt into a working web app in seconds. Iterate in chat, tweak the code, watch the preview update live.
        </p>
        <div className="mt-10 flex flex-wrap items-center justify-center gap-3">
          <Link to="/signup" className="inline-flex items-center gap-2 rounded-xl gradient-brand px-6 py-3 text-base font-semibold text-primary-foreground shadow-lift transition hover:opacity-90 animate-pulse-glow">
            Start building free <ArrowRight className="h-4 w-4" />
          </Link>
          <Link to="/login" className="inline-flex items-center gap-2 rounded-xl glass px-6 py-3 text-base font-semibold transition hover:bg-surface">
            I have an account
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: MessageSquare, title: "Chat to build", desc: "Describe what you want. Kenzo writes complete, working HTML, CSS, and JS." },
            { icon: Code2, title: "Edit anything", desc: "Full code editor for every file. Your manual tweaks stick and drive the preview." },
            { icon: Eye, title: "Live preview", desc: "A sandboxed preview re-renders on every change. Open in a new tab anytime." },
            { icon: Zap, title: "Save projects", desc: "Everything you build is stored in your account. Pick up where you left off." },
            { icon: Shield, title: "Yours to own", desc: "Export your project as a zip and take it anywhere. No lock-in." },
            { icon: Sparkles, title: "Made to feel good", desc: "Glassmorphic UI, dark and light modes, and smooth motion everywhere." },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="glass rounded-2xl p-6 transition hover:shadow-lift hover:-translate-y-0.5">
              <div className="inline-flex h-10 w-10 items-center justify-center rounded-lg gradient-brand text-primary-foreground">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="mt-4 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="border-t border-glass-border">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between text-xs text-muted-foreground">
          <Logo size={22} />
          <span>© {new Date().getFullYear()} Kenzo. Crafted with care.</span>
        </div>
      </footer>
    </div>
  );
}
