import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function requireAdmin(userId: string, supabase: any) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error || !data) throw new Error("Forbidden: admin only");
}

function mask(k: string) {
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export const listApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await requireAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("ai_api_keys")
      .select("id, label, api_key, priority, is_active, exhausted_at, last_error, created_at")
      .order("priority", { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map((k) => ({
      id: k.id as string,
      label: k.label as string,
      masked: mask(k.api_key as string),
      priority: k.priority as number,
      is_active: k.is_active as boolean,
      exhausted_at: k.exhausted_at as string | null,
      last_error: k.last_error as string | null,
    }));
  });

export const upsertApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        id: z.string().uuid().optional(),
        label: z.string().trim().min(1).max(60),
        apiKey: z.string().trim().min(8).max(500).optional(),
        priority: z.number().int().min(1).max(99),
        isActive: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.id) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const patch: any = {
        label: data.label,
        priority: data.priority,
        is_active: data.isActive,
      };
      if (data.apiKey) {
        patch.api_key = data.apiKey;
        patch.exhausted_at = null;
        patch.last_error = null;
      }
      const { error } = await supabaseAdmin.from("ai_api_keys").update(patch).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      if (!data.apiKey) throw new Error("An API key value is required.");
      const { error } = await supabaseAdmin.from("ai_api_keys").insert({
        label: data.label,
        api_key: data.apiKey,
        priority: data.priority,
        is_active: data.isActive,
        created_by: context.userId,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("ai_api_keys").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().trim().email().max(255),
        password: z.string().min(8).max(72),
        displayName: z.string().trim().min(1).max(80),
        makeAdmin: z.boolean().default(false),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await requireAdmin(context.userId, context.supabase);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: { display_name: data.displayName },
    });
    if (error) throw new Error(error.message);
    if (data.makeAdmin && created.user) {
      await supabaseAdmin
        .from("user_roles")
        .upsert({ user_id: created.user.id, role: "admin" }, { onConflict: "user_id,role" });
    }
    return { ok: true, id: created.user?.id ?? null };
  });
