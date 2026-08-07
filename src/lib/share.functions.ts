import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type Collaborator = {
  id: string;
  email: string;
  role: string;
  status: string;
  display_name: string | null;
  avatar_url: string | null;
};

async function assertOwner(supabase: any, projectId: string, userId: string) {
  const { data, error } = await supabase
    .from("projects")
    .select("id, name, user_id")
    .eq("id", projectId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.user_id !== userId) throw new Error("Only the project owner can manage sharing.");
  return data as { id: string; name: string; user_id: string };
}

export const listCollaborators = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: shares, error } = await context.supabase
      .from("project_shares")
      .select("id, invited_email, role, status, user_id")
      .eq("project_id", data.projectId)
      .order("created_at");
    if (error) throw new Error(error.message);

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const emails = (shares ?? []).map((s) => s.invited_email.toLowerCase());
    const { data: profs } = emails.length
      ? await supabaseAdmin.from("profiles").select("email, display_name, avatar_url").in("email", emails)
      : { data: [] as Array<{ email: string | null; display_name: string | null; avatar_url: string | null }> };

    const byEmail = new Map((profs ?? []).map((p) => [(p.email ?? "").toLowerCase(), p]));
    const out: Collaborator[] = (shares ?? []).map((s) => {
      const p = byEmail.get(s.invited_email.toLowerCase());
      return {
        id: s.id,
        email: s.invited_email,
        role: s.role,
        status: s.status,
        display_name: p?.display_name ?? null,
        avatar_url: p?.avatar_url ?? null,
      };
    });
    return { collaborators: out };
  });

export const shareProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        projectId: z.string().uuid(),
        email: z.string().email(),
        role: z.enum(["viewer", "editor"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const project = await assertOwner(context.supabase, data.projectId, context.userId);
    const email = data.email.trim().toLowerCase();

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: target } = await supabaseAdmin
      .from("profiles")
      .select("id, email")
      .ilike("email", email)
      .maybeSingle();

    if (target?.id === context.userId) throw new Error("You already own this project.");

    const { error } = await supabaseAdmin.from("project_shares").upsert(
      {
        project_id: data.projectId,
        owner_id: context.userId,
        invited_email: email,
        user_id: target?.id ?? null,
        role: data.role,
        status: target?.id ? "accepted" : "pending",
      },
      { onConflict: "project_id,invited_email" },
    );
    if (error) throw new Error(error.message);

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const who = me?.display_name || me?.email || "Someone";

    if (target?.id) {
      await supabaseAdmin.from("notifications").insert({
        user_id: target.id,
        type: "share",
        title: `${who} shared “${project.name}” with you`,
        body: `You have ${data.role} access. Open your workspace to view it.`,
        project_id: data.projectId,
      });
    }

    return { ok: true, invited: email, pending: !target?.id };
  });

export const updateShare = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        shareId: z.string().uuid(),
        projectId: z.string().uuid(),
        role: z.enum(["viewer", "editor"]).optional(),
        remove: z.boolean().optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertOwner(context.supabase, data.projectId, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.remove) {
      await supabaseAdmin.from("project_shares").delete().eq("id", data.shareId);
    } else if (data.role) {
      await supabaseAdmin.from("project_shares").update({ role: data.role }).eq("id", data.shareId);
    }
    return { ok: true };
  });

/** Bind pending invites (matched by email) to this account and greet with a notification. */
export const claimInvites = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const email = (context.claims as { email?: string } | undefined)?.email;
    if (!email) return { claimed: 0 };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("project_shares")
      .update({ user_id: context.userId, status: "accepted" })
      .ilike("invited_email", email.toLowerCase())
      .is("user_id", null)
      .select("id");
    return { claimed: data?.length ?? 0 };
  });

/** Someone who received a project link but has no share asks the owner for access. */
export const requestAccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ projectId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: project } = await supabaseAdmin
      .from("projects")
      .select("id, name, user_id")
      .eq("id", data.projectId)
      .maybeSingle();
    if (!project) throw new Error("Project not found.");
    if (project.user_id === context.userId) return { ok: true, alreadyOwner: true };

    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("display_name, email")
      .eq("id", context.userId)
      .maybeSingle();
    const who = me?.display_name || me?.email || "Someone";

    await supabaseAdmin.from("notifications").insert({
      user_id: project.user_id,
      type: "access_request",
      title: `${who} requested access to “${project.name}”`,
      body: me?.email ? `Add ${me.email} from the Share menu to let them in.` : undefined,
      project_id: project.id,
    });
    return { ok: true, alreadyOwner: false };
  });
