/**
 * Middleware: requires the caller to have an ENABLED `distributor` role.
 *
 * Authentication is independent — any authenticated user can log in. This
 * middleware only protects distributor-scoped server functions (creating
 * orders, saving quick-order templates, repeat-order, etc).
 *
 * Bypass rules (so multi-role users keep access to admin tooling):
 *   - super_admin → always allowed
 *   - admin in the same company → always allowed
 *
 * For everyone else we require at least one row in `user_roles` with
 *   role = 'distributor' AND is_enabled = true.
 *
 * On failure we throw a 403 Response so the client gets a clear error
 * instead of a generic 500. Every 403 is logged to the server console with
 * the userId, the path that was hit, and the reason — so you can audit
 * disabled-distributor access attempts in `server-function-logs`.
 */
import { createMiddleware } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Reason codes returned to the client in the 403 response body.
 * Keep these stable — the frontend may map them to localized messages.
 * Do NOT include user ids, emails, role rows, or any tenant data in the body.
 */
type ForbiddenReason = "distributor_role_disabled" | "no_distributor_role";

const REASON_MESSAGES_AR: Record<ForbiddenReason, string> = {
  // Distributor role exists but was disabled by an admin.
  distributor_role_disabled: "حساب الموزع معطّل. يرجى التواصل مع الإدارة.",
  // User has no distributor role at all (e.g. pure buyer / sales agent).
  no_distributor_role: "لا تملك صلاحية الوصول كموزع.",
};

function logAuthz(
  level: "warn" | "error",
  status: number,
  userId: string,
  reason: string,
  extra?: Record<string, string>,
) {
  let path = "<unknown>";
  try {
    const req = getRequest();
    path = req?.url ?? path;
  } catch {
    // getRequest can throw outside a request scope — ignore for logging.
  }
  const extras = extra
    ? " " + Object.entries(extra).map(([k, v]) => `${k}=${v}`).join(" ")
    : "";
  const line = `[authz][${status}] mw=requireEnabledDistributorRole user=${userId} path=${path} reason=${reason}${extras}`;
  if (level === "error") console.error(line);
  else console.warn(line);
}

function forbidden(reason: ForbiddenReason, userId: string): never {
  logAuthz("warn", 403, userId, reason);
  throw new Response(
    JSON.stringify({ error: "forbidden", reason, message: REASON_MESSAGES_AR[reason] }),
    {
      status: 403,
      headers: { "content-type": "application/json; charset=utf-8" },
    },
  );
}

export const requireEnabledDistributorRole = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;

    const { data: roleRows, error } = await supabase
      .from("user_roles")
      .select("role, is_enabled")
      .eq("user_id", userId);

    if (error) {
      logAuthz("error", 500, userId, "role_query_failed", { msg: error.message });
      throw new Response("Authorization check failed", { status: 500 });
    }

    const roles = roleRows ?? [];
    const isSuperAdmin = roles.some((r) => r.role === "super_admin");
    const isAdmin = roles.some((r) => r.role === "admin");
    const hasEnabledDistributorRole = roles.some(
      (r) => r.role === "distributor" && r.is_enabled === true,
    );

    if (!isSuperAdmin && !isAdmin && !hasEnabledDistributorRole) {
      const hasDisabledDistributor = roles.some(
        (r) => r.role === "distributor" && r.is_enabled === false,
      );
      forbidden(
        hasDisabledDistributor ? "distributor_role_disabled" : "no_distributor_role",
        userId,
      );
    }

    return next({
      context: {
        distributorAccess: {
          isSuperAdmin,
          isAdmin,
          hasEnabledDistributorRole,
        },
      },
    });
  });
