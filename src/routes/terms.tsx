import { createFileRoute, Link } from "@tanstack/react-router";
import { Logo } from "@/components/Logo";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — Kenzo" },
      { name: "description", content: "The rules for using Kenzo: your account, your generated projects, acceptable use and ownership." },
      { property: "og:title", content: "Terms of Service — Kenzo" },
      { property: "og:description", content: "The rules for using Kenzo: your account, your generated projects, acceptable use and ownership." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Terms,
});

function Terms() {
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
      <main className="mx-auto max-w-3xl px-6 py-14">
        <h1 className="text-4xl font-bold tracking-tight">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted-foreground">Last updated {new Date().getFullYear()}</p>

        <Section title="Your account">
          You are responsible for the accuracy of your details and for keeping your password safe.
          One person per account; do not share credentials.
        </Section>
        <Section title="What you build">
          You own the code Kenzo generates for you and may export and use it anywhere. You are
          responsible for making sure what you publish is lawful and does not infringe anyone&apos;s
          rights.
        </Section>
        <Section title="Acceptable use">
          Do not use Kenzo to build or distribute malware, phishing pages, spam, or content that is
          illegal, hateful, or sexually exploitative. Do not attempt to bypass access controls,
          scrape other users&apos; projects, or overload the service.
        </Section>
        <Section title="AI output">
          Generated code is provided as-is. Review it before shipping to production — we cannot
          guarantee it is bug-free, secure, or suitable for a specific purpose.
        </Section>
        <Section title="Availability and limits">
          Usage may be rate-limited to keep the service healthy. We may change or discontinue
          features, and will give reasonable notice for material changes.
        </Section>
        <Section title="Termination">
          You may delete your account at any time from Settings. We may suspend accounts that
          violate these terms.
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
