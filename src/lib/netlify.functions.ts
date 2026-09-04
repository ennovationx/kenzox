import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/* Netlify server helpers are loaded inside handlers so nothing server-only reaches the client bundle. */

type Files = Record<string, string>;

async function admin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

/** Returns the caller's decrypted Netlify token, or throws a reconnect-worthy error. */
async function tokenFor(userId: string): Promise<string> {
  const { decryptToken, NetlifyError } = await import("./netlify.server");
  const db = await admin();
  const { data } = await db.from("netlify_connections").select("access_token").eq("user_id", userId).maybeSingle();
  if (!data) throw new NetlifyError("Connect your Netlify account first.", 401);
  return decryptToken(data.access_token as string);
}

async function ownedProject(userId: string, projectId: string) {
  const db = await admin();
  const { data, error } = await db
    .from("projects")
    .select("id, name, files, user_id, netlify_site_id, netlify_site_name, netlify_url")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("Only the project owner can manage publishing.");
  return data;
}

function buildStaticFiles(files: Files): Files {
  const out: Files = {};
  for (const [name, content] of Object.entries(files ?? {})) {
    if (typeof content !== "string") continue;
    out[`/${name.replace(/^\/+/, "")}`] = content;
  }
  if (!out["/index.html"]) throw new Error("This project has no index.html to publish.");
  out["/_redirects"] = "/*  /index.html  200\n";
  return out;
}

function surface(err: unknown): never {
  const message = err instanceof Error ? err.message : "Unexpected Netlify error.";
  throw new Error(message);
}

/* ------------------------------- connection -------------------------------- */

export const getNetlifyConnection = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    const { data } = await db
      .from("netlify_connections")
      .select("account_name, account_email, account_slug, created_at")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!data) return { connected: false as const };
    return {
      connected: true as const,
      accountName: (data.account_name as string | null) ?? (data.account_email as string | null) ?? "Netlify account",
      accountEmail: (data.account_email as string | null) ?? null,
      connectedAt: data.created_at as string,
    };
  });

/** Stores a Netlify personal access token after verifying it against the API. */
export const connectNetlifyToken = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ token: z.string().trim().min(20).max(400) }).parse(d))
  .handler(async ({ data, context }) => {
    const { netlifyFetch, encryptToken } = await import("./netlify.server");
    try {
      const user = await netlifyFetch<{ full_name?: string; email?: string; slug?: string }>(data.token, "/user");
      const db = await admin();
      const { error } = await db.from("netlify_connections").upsert(
        {
          user_id: context.userId,
          access_token: await encryptToken(data.token),
          account_name: user.full_name ?? user.email ?? null,
          account_email: user.email ?? null,
          account_slug: user.slug ?? null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
      if (error) throw new Error(error.message);
      return { connected: true, accountName: user.full_name ?? user.email ?? "Netlify account" };
    } catch (err) {
      surface(err);
    }
  });

/** Creates the Netlify OAuth authorize URL bound to a one-time state for this user. */
export const startNetlifyOAuth = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ origin: z.string().url() }).parse(d))
  .handler(async ({ data, context }) => {
    const clientId = process.env["NETLIFY_CLIENT_ID"];
    if (!clientId) throw new Error("Netlify OAuth is not configured on this server.");
    const state = crypto.randomUUID();
    const db = await admin();
    await db.from("netlify_oauth_states").insert({ state, user_id: context.userId });
    const redirectUri = `${data.origin.replace(/\/$/, "")}/api/public/netlify/callback`;
    const url = new URL("https://app.netlify.com/authorize");
    url.searchParams.set("client_id", clientId);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("state", state);
    return { url: url.toString(), redirectUri };
  });

export const disconnectNetlify = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await admin();
    await db.from("netlify_connections").delete().eq("user_id", context.userId);
    return { connected: false };
  });

/* --------------------------------- publish --------------------------------- */

export const publishProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { netlifyFetch, deployFiles, slugifyName } = await import("./netlify.server");
    const db = await admin();
    const project = await ownedProject(context.userId, data.projectId);
    const token = await tokenFor(context.userId);

    try {
      let siteId = project.netlify_site_id as string | null;
      let siteName = project.netlify_site_name as string | null;
      let siteUrl = project.netlify_url as string | null;

      if (siteId) {
        // Confirm the linked site still exists on Netlify; recreate it if it was deleted there.
        try {
          const site = await netlifyFetch<{ id: string; name: string; ssl_url?: string; url?: string }>(token, `/sites/${siteId}`);
          siteName = site.name;
          siteUrl = site.ssl_url ?? site.url ?? siteUrl;
        } catch (err) {
          if ((err as { status?: number }).status === 404) siteId = null;
          else throw err;
        }
      }

      if (!siteId) {
        const site = await netlifyFetch<{ id: string; name: string; ssl_url?: string; url?: string }>(token, "/sites", {
          method: "POST",
          body: JSON.stringify({ name: slugifyName(project.name as string) }),
        });
        siteId = site.id;
        siteName = site.name;
        siteUrl = site.ssl_url ?? site.url ?? null;
      }

      const deploy = await deployFiles(token, siteId, buildStaticFiles(project.files as Files));
      const url = deploy.ssl_url ?? deploy.url ?? siteUrl;

      await db
        .from("projects")
        .update({ netlify_site_id: siteId, netlify_site_name: siteName, netlify_url: url })
        .eq("id", project.id);

      await db.from("project_deploys").insert({
        project_id: project.id,
        user_id: context.userId,
        deploy_id: deploy.id,
        site_id: siteId,
        state: deploy.state,
        url,
        error_message: deploy.error_message ?? null,
        kind: "publish",
      });

      await db.from("notifications").insert({
        user_id: context.userId,
        type: deploy.state === "error" ? "deploy_failed" : "deploy_success",
        title: deploy.state === "error" ? "Deploy failed" : "Site published",
        body:
          deploy.state === "error"
            ? deploy.error_message || "Netlify reported a failed deploy."
            : `${project.name} is live at ${url}`,
      });

      if (deploy.state === "error") throw new Error(deploy.error_message || "Netlify reported a failed deploy.");

      return { url, siteId, siteName, deployId: deploy.id, state: deploy.state };
    } catch (err) {
      surface(err);
    }
  });

/* ------------------------------ subdomain edit ------------------------------ */

export const checkSubdomain = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ name: z.string().trim().toLowerCase().min(3).max(63) }).parse(d))
  .handler(async ({ data, context }) => {
    const { netlifyFetch, SUBDOMAIN_RE } = await import("./netlify.server");
    if (!SUBDOMAIN_RE.test(data.name)) {
      return { available: false, reason: "Use 3–63 lowercase letters, numbers or hyphens (not at the start or end)." };
    }
    const token = await tokenFor(context.userId);
    try {
      await netlifyFetch(token, `/sites/${data.name}.netlify.app`);
      return { available: false, reason: "That name is already taken." };
    } catch (err) {
      if ((err as { status?: number }).status === 404) return { available: true, reason: "Available" };
      surface(err);
    }
  });

export const renameNetlifySite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ projectId: z.string().uuid(), name: z.string().trim().toLowerCase().min(3).max(63) }).parse(d),
  )
  .handler(async ({ data, context }) => {
    const { netlifyFetch, SUBDOMAIN_RE } = await import("./netlify.server");
    if (!SUBDOMAIN_RE.test(data.name)) throw new Error("Invalid subdomain. Use lowercase letters, numbers and hyphens.");
    const project = await ownedProject(context.userId, data.projectId);
    if (!project.netlify_site_id) throw new Error("Publish this project once before changing its URL.");
    const token = await tokenFor(context.userId);
    try {
      const site = await netlifyFetch<{ name: string; ssl_url?: string; url?: string }>(token, `/sites/${project.netlify_site_id}`, {
        method: "PATCH",
        body: JSON.stringify({ name: data.name }),
      });
      const url = site.ssl_url ?? site.url ?? `https://${data.name}.netlify.app`;
      const db = await admin();
      await db.from("projects").update({ netlify_site_name: site.name, netlify_url: url }).eq("id", project.id);
      return { url, siteName: site.name };
    } catch (err) {
      surface(err);
    }
  });

/* ------------------------------- deploy history ----------------------------- */

export const listDeploys = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const project = await ownedProject(context.userId, data.projectId);
    const db = await admin();
    const { data: rows } = await db
      .from("project_deploys")
      .select("id, deploy_id, state, url, error_message, kind, created_at")
      .eq("project_id", project.id)
      .order("created_at", { ascending: false })
      .limit(25);

    // Refresh any deploy that was still in flight when it was recorded.
    const pending = (rows ?? []).filter((r) => r.state !== "ready" && r.state !== "error");
    if (pending.length) {
      try {
        const { netlifyFetch } = await import("./netlify.server");
        const token = await tokenFor(context.userId);
        for (const row of pending.slice(0, 5)) {
          const fresh = await netlifyFetch<{ state: string; ssl_url?: string; error_message?: string | null }>(
            token,
            `/deploys/${row.deploy_id}`,
          );
          if (fresh.state !== row.state) {
            row.state = fresh.state;
            row.url = fresh.ssl_url ?? row.url;
            row.error_message = fresh.error_message ?? row.error_message;
            await db
              .from("project_deploys")
              .update({ state: fresh.state, url: row.url, error_message: row.error_message })
              .eq("id", row.id);
          }
        }
      } catch { /* history still renders with the stored state */ }
    }

    return {
      siteName: (project.netlify_site_name as string | null) ?? null,
      url: (project.netlify_url as string | null) ?? null,
      linked: !!project.netlify_site_id,
      deploys: rows ?? [],
    };
  });

export const rollbackDeploy = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid(), deployId: z.string().min(4) }).parse(d))
  .handler(async ({ data, context }) => {
    const { netlifyFetch } = await import("./netlify.server");
    const project = await ownedProject(context.userId, data.projectId);
    if (!project.netlify_site_id) throw new Error("This project is not linked to a Netlify site.");
    const token = await tokenFor(context.userId);
    try {
      const deploy = await netlifyFetch<{ id: string; state: string; ssl_url?: string }>(
        token,
        `/sites/${project.netlify_site_id}/deploys/${data.deployId}/restore`,
        { method: "POST", body: JSON.stringify({}) },
      );
      const db = await admin();
      await db.from("project_deploys").insert({
        project_id: project.id,
        user_id: context.userId,
        deploy_id: deploy.id,
        site_id: project.netlify_site_id,
        state: deploy.state ?? "ready",
        url: deploy.ssl_url ?? (project.netlify_url as string | null),
        kind: "rollback",
      });
      return { url: deploy.ssl_url ?? (project.netlify_url as string | null), state: deploy.state };
    } catch (err) {
      surface(err);
    }
  });

export const unlinkNetlifySite = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const project = await ownedProject(context.userId, data.projectId);
    const db = await admin();
    await db
      .from("projects")
      .update({ netlify_site_id: null, netlify_site_name: null, netlify_url: null })
      .eq("id", project.id);
    await db.from("project_deploys").delete().eq("project_id", project.id);
    return { linked: false };
  });
