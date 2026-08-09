import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — Kenzo" },
      { name: "description", content: "How Kenzo collects, stores and protects your account data, projects and AI conversations." },
      { property: "og:title", content: "Privacy Policy — Kenzo" },
      { property: "og:description", content: "How Kenzo collects, stores and protects your account data, projects and AI conversations." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Privacy,
});

function Privacy() {
  return (
    <div className="min-h-screen">
      <header className="sticky top-4 z-40 mx-auto max-w-4xl px-4">
        <div className="glass rounded-2xl px-5 h-14 flex items-center justify-between border border-glass-border">
          <Link to="/" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Home
          </Link>
          <Logo size={22} />
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-6 py-14 prose-kenzo">
        <h1 className="text-4xl font-bold tracking-tight">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {new Date().getFullYear()}</p>

        <Section title="What we collect">
          Your email address and display name, the projects and files you create, the chat messages
          you exchange with the AI, uploaded reference images, and basic usage data needed to run the
          service.
        </Section>
        <Section title="How your data is used">
          Only to operate Kenzo: authenticating you, storing your projects, generating code from your
          prompts, and letting you share projects with people you explicitly invite. We do not sell
          your data or use your projects for advertising.
        </Section>
        <Section title="Who can see your projects">
          Your projects and chats are private to your account. They become visible to another person
          only when you invite them through the share dialog, and only at the permission level you
          choose (view or edit). You can revoke access at any time.
        </Section>
        <Section title="AI processing">
          Prompts, current file contents and any images you attach are sent to our AI provider to
          produce the generated code. They are not used to train public models by Kenzo.
        </Section>
        <Section title="Security">
          Data is stored in an access-controlled database with row-level security. Passwords are
          hashed and never visible to us. API keys used by the platform are stored server-side and
          are never exposed to the browser.
        </Section>
        <Section title="Your choices">
          You can edit or delete any project, clear your AI memory, and delete your account and all
          associated data from Settings.
        </Section>
        <Section title="Contact">
          Questions about privacy? Reach out from the account you signed up with and we will help.
        </Section>
      </main>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-8">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{children}</p>
    </section>
  );
}
