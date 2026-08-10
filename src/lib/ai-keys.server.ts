// Server-only helpers for AI gateway key rotation / fallback.
// Keys live in public.ai_api_keys which is reachable only via the service role.

export type AiKey = { id: string | null; label: string; api_key: string };

/** Ordered list of admin-configured keys to try (by priority). */
export async function resolveAiKeys(): Promise<AiKey[]> {
  const keys: AiKey[] = [];
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("ai_api_keys")
      .select("id, label, api_key, priority")
      .eq("is_active", true)
      .order("priority", { ascending: true });
    for (const r of data ?? []) {
      keys.push({ id: r.id as string, label: r.label as string, api_key: r.api_key as string });
    }
  } catch (e) {
    console.error("[ai-keys] lookup failed:", e);
  }
  // Only admin-managed keys are used. No platform/built-in key fallback.
  return keys;
}

/** Mark a key exhausted and notify every admin once it stops working. */
export async function reportKeyExhausted(key: AiKey, reason: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (key.id) {
      await supabaseAdmin
        .from("ai_api_keys")
        .update({ exhausted_at: new Date().toISOString(), last_error: reason.slice(0, 500) })
        .eq("id", key.id);
    }
    const { data: admins } = await supabaseAdmin
      .from("user_roles")
      .select("user_id")
      .eq("role", "admin");
    const rows = (admins ?? []).map((a) => ({
      user_id: a.user_id as string,
      type: "warning",
      title: `AI key "${key.label}" is out of capacity`,
      body: `${reason.slice(0, 200)} — Kenzo switched to the next key in the fallback chain.`,
    }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
  } catch (e) {
    console.error("[ai-keys] notify failed:", e);
  }
}
