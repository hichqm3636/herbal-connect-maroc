/**
 * Central registry of authorization "reason" codes returned by the
 * `requireEnabledDistributorRole` middleware (and any future authz
 * middleware) and their localized Arabic messages.
 *
 * The middleware returns 403 responses shaped as:
 *   { error: "forbidden", reason: "<code>", message: "<ar>" }
 *
 * The frontend should ALWAYS call `parseApiError(response)` to extract
 * a user-facing message, and prefer `AUTHZ_MESSAGES_AR[reason]` when
 * the reason is known. We keep the server-provided `message` as a
 * fallback so a future reason code never produces a blank toast.
 */

export type AuthzReason =
  | "distributor_role_disabled"
  | "no_distributor_role"
  | "rls_blocked_distributor_disabled"; // synthesized client-side from RLS denials

export const AUTHZ_MESSAGES_AR: Record<AuthzReason, string> = {
  distributor_role_disabled:
    "حساب الموزع معطّل. تواصل مع الإدارة لإعادة التفعيل.",
  no_distributor_role:
    "لا تملك صلاحية الوصول كموزع. تواصل مع الإدارة.",
  rls_blocked_distributor_disabled:
    "تعذّر تنفيذ العملية: حساب الموزع معطّل. تواصل مع الإدارة.",
};

/**
 * Shape of a parsed API error.
 * - `status`: HTTP status (when known)
 * - `reason`: machine-readable reason code (when the server provided one)
 * - `message`: localized AR message ready to show in a toast
 * - `forbidden`: convenience flag for `status === 403`
 */
export interface ParsedApiError {
  status: number | null;
  reason: AuthzReason | string | null;
  message: string;
  forbidden: boolean;
}

/**
 * Parse a `Response` (typically from `fetch` against a server function or
 * a Supabase REST endpoint) into a `ParsedApiError`. Safe to call on any
 * response — non-JSON / unknown shapes fall back to a generic message.
 *
 * Usage:
 *   const res = await fetch(...);
 *   if (!res.ok) {
 *     const err = await parseApiError(res);
 *     toast.error(err.message);
 *     return;
 *   }
 */
export async function parseApiError(
  response: Response,
  fallback = "تعذّر إتمام العملية. حاول مرة أخرى.",
): Promise<ParsedApiError> {
  const status = response.status;
  const forbidden = status === 403;

  let reason: string | null = null;
  let message: string | null = null;

  try {
    const body = await response.clone().json();
    if (body && typeof body === "object") {
      if (typeof body.reason === "string") reason = body.reason;
      if (typeof body.message === "string") message = body.message;
      // TanStack Start sometimes nests under `error`
      if (!message && typeof body.error === "string") message = body.error;
    }
  } catch {
    // Not JSON — try plain text
    try {
      const text = await response.clone().text();
      if (text) message = text;
    } catch {
      /* ignore */
    }
  }

  // Prefer the central AR mapping when the reason is known.
  let finalMessage = message ?? fallback;
  if (reason && reason in AUTHZ_MESSAGES_AR) {
    finalMessage = AUTHZ_MESSAGES_AR[reason as AuthzReason];
  }

  return { status, reason, message: finalMessage, forbidden };
}

/**
 * Heuristic: detect when a Supabase / Postgres error indicates the
 * caller was blocked by the new `has_enabled_distributor_role` RLS
 * checks. Postgres returns generic 42501 / "row violates row-level
 * security policy" messages, so we map those to a friendly disabled-
 * distributor message ONLY when we know the user IS a disabled
 * distributor (caller passes that flag from `useAuth`).
 *
 * Returns the AR message to show, or `null` to let the caller use its
 * own default error text.
 */
export function authzMessageForSupabaseError(
  error: { message?: string | null; code?: string | null } | null | undefined,
  ctx: { isDistributorDisabled: boolean },
): string | null {
  if (!error || !ctx.isDistributorDisabled) return null;
  const msg = (error.message ?? "").toLowerCase();
  const code = (error.code ?? "").toLowerCase();
  const looksLikeRls =
    code === "42501" ||
    msg.includes("row-level security") ||
    msg.includes("row level security") ||
    msg.includes("violates row-level") ||
    msg.includes("new row violates");
  if (!looksLikeRls) return null;
  return AUTHZ_MESSAGES_AR.rls_blocked_distributor_disabled;
}
