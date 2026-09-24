// Server-only helpers for AI gateway key rotation / fallback.
// Keys live in public.ai_api_keys and public.user_api_keys.

export type AiKey = {
  id: string | null;
  label: string;
  api_key: string;
  isUserKey?: boolean;
  userId?: string;
};

/** Ordered list of admin-managed keys to try (by priority). */
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
      keys.push({ id: r.id as string, label: r.label as string, api_key: r.api_key as string, isUserKey: false });
    }
  } catch (e) {
    console.error("[ai-keys] lookup failed:", e);
  }
  return keys;
}

/**
 * Resolves the keys to use for this user prompt:
 * 1. User's own keys first (BYOK)
 * 2. If no user keys or user keys fail, check giveaway quota:
 *    - Admin users: unlimited access to admin pool
 *    - Non-admin users: up to 3 prompts/day from admin pool
 */
export async function resolveExecutionKeys(userId: string): Promise<{
  userKeys: AiKey[];
  adminKeys: AiKey[];
  isGiveawayAllowed: boolean;
  giveawayRemaining: number;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

  // 1. Fetch user's own active keys
  const userKeys: AiKey[] = [];
  try {
    const { data: uKeys } = await supabaseAdmin
      .from("user_api_keys")
      .select("id, label, api_key, priority")
      .eq("user_id", userId)
      .eq("is_active", true)
      .is("exhausted_at", null)
      .order("priority", { ascending: true })
      .order("created_at", { ascending: false });

    for (const k of uKeys ?? []) {
      userKeys.push({
        id: k.id as string,
        label: k.label as string,
        api_key: k.api_key as string,
        isUserKey: true,
        userId,
      });
    }
  } catch (e) {
    console.error("[ai-keys] user keys fetch error:", e);
  }

  // 2. Check if user is admin
  let isAdmin = false;
  try {
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "admin")
      .maybeSingle();
    isAdmin = !!roleRow;
  } catch {}

  // 3. Check daily giveaway usage (3 prompts per day)
  const today = new Date().toISOString().split("T")[0];
  let promptCount = 0;
  try {
    const { data: usage } = await supabaseAdmin
      .from("daily_prompt_usage")
      .select("prompt_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();
    promptCount = (usage?.prompt_count as number) ?? 0;
  } catch {}

  const dailyLimit = 3;
  const giveawayRemaining = isAdmin ? 9999 : Math.max(0, dailyLimit - promptCount);
  const isGiveawayAllowed = isAdmin || promptCount < dailyLimit;

  // 4. Fetch admin backup keys
  const adminKeys = await resolveAiKeys();

  return {
    userKeys,
    adminKeys,
    isGiveawayAllowed,
    giveawayRemaining,
  };
}

/** Record successful prompt execution when using the admin giveaway */
export async function recordGiveawayPrompt(userId: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const today = new Date().toISOString().split("T")[0];

    const { data: existing } = await supabaseAdmin
      .from("daily_prompt_usage")
      .select("prompt_count")
      .eq("user_id", userId)
      .eq("usage_date", today)
      .maybeSingle();

    const count = ((existing?.prompt_count as number) ?? 0) + 1;

    await supabaseAdmin.from("daily_prompt_usage").upsert(
      {
        user_id: userId,
        usage_date: today,
        prompt_count: count,
        last_prompt_at: new Date().toISOString(),
      },
      { onConflict: "user_id,usage_date" },
    );

    if (count >= 3) {
      await supabaseAdmin.from("notifications").insert({
        user_id: userId,
        type: "warning",
        title: "Daily Free Prompts Used (3/3)",
        body: "You've used all 3 daily giveaway prompts from Kenzo. Add your own free Gemini API key in Settings to keep building without interruption.",
      });
    }
  } catch (e) {
    console.error("[ai-keys] record giveaway error:", e);
  }
}

/** Mark user key exhausted and send in-app notification */
export async function reportUserKeyExhausted(key: AiKey, reason: string) {
  try {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (key.id && key.userId) {
      await supabaseAdmin
        .from("user_api_keys")
        .update({ exhausted_at: new Date().toISOString(), last_error: reason.slice(0, 500) })
        .eq("id", key.id);

      await supabaseAdmin.from("notifications").insert({
        user_id: key.userId,
        type: "warning",
        title: `Your API Key "${key.label}" exhausted`,
        body: `${reason.slice(0, 160)} — Kenzo is using your daily giveaway quota as backup. You can add or update your key in Settings.`,
      });
    }
  } catch (e) {
    console.error("[ai-keys] user key notify failed:", e);
  }
}

/** Mark an admin key exhausted and notify all admins */
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
      title: `Admin AI key "${key.label}" is out of capacity`,
      body: `${reason.slice(0, 200)} — Kenzo switched to the next key in the fallback chain.`,
    }));
    if (rows.length) await supabaseAdmin.from("notifications").insert(rows);
  } catch (e) {
    console.error("[ai-keys] notify failed:", e);
  }
}
