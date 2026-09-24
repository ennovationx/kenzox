import { createFileRoute } from "@tanstack/react-router";

/** GitHub OAuth callback. Exchanges the code for a token server-side and stores it encrypted. */
export const Route = createFileRoute("/api/public/github/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const back = (status: string) =>
          new Response(null, { status: 302, headers: { Location: `/settings?github=${status}` } });

        if (!code || !state) return back("error");

        const clientId = process.env["GITHUB_CLIENT_ID"];
        const clientSecret = process.env["GITHUB_CLIENT_SECRET"];
        if (!clientId || !clientSecret) return back("unconfigured");

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { encryptToken, getGithubUser } = await import("@/lib/github.server");

        const { data: row } = await supabaseAdmin
          .from("github_oauth_states")
          .select("user_id, created_at")
          .eq("state", state)
          .maybeSingle();

        if (!row) return back("expired");
        await supabaseAdmin.from("github_oauth_states").delete().eq("state", state);

        try {
          const res = await fetch("https://github.com/login/oauth/access_token", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Accept: "application/json",
            },
            body: JSON.stringify({
              client_id: clientId,
              client_secret: clientSecret,
              code,
            }),
          });

          const payload = (await res.json()) as { access_token?: string; error?: string };
          if (!res.ok || !payload.access_token) return back("error");

          const account = await getGithubUser(payload.access_token);

          await supabaseAdmin.from("github_connections").upsert(
            {
              user_id: row.user_id as string,
              access_token: await encryptToken(payload.access_token),
              github_username: account.login,
              account_name: account.name ?? account.login,
              avatar_url: account.avatar_url,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "user_id" },
          );

          await supabaseAdmin.from("notifications").insert({
            user_id: row.user_id as string,
            type: "github",
            title: "GitHub connected",
            body: `Connected as @${account.login}. You can now push projects directly to GitHub.`,
          });

          return back("connected");
        } catch {
          return back("error");
        }
      },
    },
  },
});
