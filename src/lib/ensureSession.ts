import { supabase } from "@/integrations/supabase/client";

/**
 * Ensure there is a valid (non-expired) Supabase auth session before
 * performing a storage upload or a database mutation.
 *
 * - Returns silently when the current session is still valid.
 * - Attempts a silent refresh when the session is missing or expired.
 * - Throws a clear Arabic error only if the refresh fails.
 */
export async function ensureFreshSession(): Promise<void> {
  const { data, error } = await supabase.auth.getSession();
  if (error) throw new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");

  const session = data.session;
  const nowSec = Math.floor(Date.now() / 1000);
  // Refresh proactively if there is no session, no expiry, or it expires within 60s.
  const needsRefresh =
    !session || !session.expires_at || session.expires_at - nowSec < 60;

  if (!needsRefresh) return;

  const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
  if (refreshErr || !refreshed.session) {
    throw new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
  }
}

/**
 * Run a Supabase call (upload or mutation). If it fails with an auth/RLS
 * symptom that suggests an expired token, refresh the session once and retry.
 * Any other error is rethrown unchanged.
 */
export async function withFreshSession<T>(fn: () => Promise<T>): Promise<T> {
  await ensureFreshSession();
  try {
    return await fn();
  } catch (err) {
    const msg = err instanceof Error ? err.message.toLowerCase() : "";
    const looksLikeAuth =
      msg.includes("jwt") ||
      msg.includes("expired") ||
      msg.includes("not authenticated") ||
      msg.includes("row-level security") ||
      msg.includes("row level security");
    if (!looksLikeAuth) throw err;

    const { data: refreshed, error: refreshErr } = await supabase.auth.refreshSession();
    if (refreshErr || !refreshed.session) {
      throw new Error("انتهت الجلسة، يرجى تسجيل الدخول مرة أخرى");
    }
    return await fn();
  }
}
