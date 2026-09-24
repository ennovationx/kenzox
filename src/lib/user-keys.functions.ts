import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

function mask(k: string) {
  if (k.length <= 8) return "••••";
  return `${k.slice(0, 4)}••••${k.slice(-4)}`;
}

export const listUserApiKeys = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_api_keys")
      .select("id, label, api_key, priority, is_active, exhausted_at, last_error, created_at")
      .eq("user_id", context.userId)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);
    return (data ?? []).map((k) => ({
      id: k.id as string,
      label: k.label as string,
      masked: mask(k.api_key as string),
      priority: (k.priority as number) ?? 1,
      isActive: (k.is_active as boolean) ?? true,
      exhaustedAt: k.exhausted_at as string | null,
      lastError: k.last_error as string | null,
      createdAt: k.created_at as string,
    }));
  });

export const upsertUserApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: unknown) =>
      z
        .object({
          id: z.string().uuid().optional(),
          label: z.string().trim().min(1).max(60).default("My Gemini API Key"),
          apiKey: z.string().trim().min(8).max(500).optional(),
          isActive: z.boolean().default(true),
        })
        .parse(d),
  )
  .handler(async ({ data, context }) => {
    if (data.id) {
      const patch: Record<string, unknown> = {
        label: data.label,
        is_active: data.isActive,
        updated_at: new Date().toISOString(),
      };
      if (data.apiKey) {
        patch.api_key = data.apiKey;
        patch.exhausted_at = null;
        patch.last_error = null;
      }
      const { error } = await context.supabase
        .from("user_api_keys")
        .update(patch)
        .eq("id", data.id)
        .eq("user_id", context.userId);

      if (error) throw new Error(error.message);
    } else {
      if (!data.apiKey) throw new Error("API key is required.");
      const { error } = await context.supabase.from("user_api_keys").insert({
        user_id: context.userId,
        label: data.label,
        api_key: data.apiKey,
        is_active: data.isActive,
      });
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const deleteUserApiKey = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("user_api_keys")
      .delete()
      .eq("id", data.id)
      .eq("user_id", context.userId);

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getGiveawayQuota = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Check if user is admin
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .eq("role", "admin")
      .maybeSingle();

    const isAdmin = !!roleRow;

    // Check user active keys count
    const { count: userKeyCount } = await supabaseAdmin
      .from("user_api_keys")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .eq("is_active", true)
      .is("exhausted_at", null);

    const hasUserKey = (userKeyCount ?? 0) > 0;

    const today = new Date().toISOString().split("T")[0];
    const { data: usage } = await supabaseAdmin
      .from("daily_prompt_usage")
      .select("prompt_count")
      .eq("user_id", context.userId)
      .eq("usage_date", today)
      .maybeSingle();

    const usedToday = (usage?.prompt_count as number) ?? 0;
    const dailyLimit = 3;
    const remaining = isAdmin ? 9999 : Math.max(0, dailyLimit - usedToday);

    return {
      isAdmin,
      dailyLimit,
      usedToday,
      remaining,
      hasUserKey,
    };
  });
