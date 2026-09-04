import { createFileRoute } from "@tanstack/react-router";

/** Netlify OAuth callback. Exchanges the code for a token server-side and stores it encrypted. */
export const Route = createFileRoute("/api/public/netlify/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const back = (status: string) =>
          new Response(null, { status: 302, headers: { Location: `/settings?netlify=${status}` } });

        if (!code || !state) return back("error");

        const clientId = process.env["NETLIFY_CLIENT_ID"];
        const clientSecret = process.env["NETLIFY_CLIENT_SECRET"];
        if (!clientId || !clientSecret) return back("unconfigured");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptToken, netlifyFetch } = await import("@/lib/netlify.server");

        const { data: row } = await supabaseAdmin
          .from("netlify_oauth_states")
          .select("user_id, created_at")
          .eq("state", state)
          .maybeSingle();
        if (!row) return back("expired");
        await supabaseAdmin.from("netlify_oauth_states").delete().eq("state", state);

        const redirectUri = `${url.origin}/api/public/netlify/callback`;
        try {
          const res = await fetch("https://api.netlify.com/oauth/token", {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "authorization_code",
              code,
              client_id: clientId,
              client_secret: clientSecret,
              redirect_uri: redirectUri,
            }).toString(),
          });
          const payload = (await res.json()) as { access_token?: string };
          if (!res.ok || !payload.access_token) return back("error");

          const account = await netlifyFetch<{ full_name?: string; email?: string; slug?: string }>(
            payload.access_token,
            "/user",
          );

          await supabaseAdmin.from("netlify_connections").upsert(
            {
              user_id: row.user_id as string,
              access_token: await encryptToken(payload.access_token),
              account_name: account.full_name ?? account.email ?? null,
              account_email: account.email ?? null,
              account_slug: account.slug ?? null,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

          await supabaseAdmin.from("notifications").insert({
            user_id: row.user_id as string,
            type: "netlify",
            title: "Netlify connected",
            body: `Connected as ${account.full_name ?? account.email ?? "your Netlify account"}.`,
          });

          return back("connected");
        } catch {
          return back("error");
        }
      },
    },
  },
});
