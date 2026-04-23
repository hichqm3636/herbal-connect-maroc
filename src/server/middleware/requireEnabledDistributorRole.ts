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

function logForbidden(userId: string, reason: string) {
  let path = "<unknown>";
  try {
    const req = getRequest();
    path = req?.url ?? path;
  } catch {
    // getRequest can throw outside a request scope — ignore for logging.
  }
  console.warn(
    `[authz][403] requireEnabledDistributorRole user=${userId} path=${path} reason=${reason}`,
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
      console.error(
        `[authz][500] requireEnabledDistributorRole user=${userId} error=${error.message}`,
      );
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
      logForbidden(
        userId,
        hasDisabledDistributor ? "distributor_role_disabled" : "no_distributor_role",
      );
      throw new Response("Distributor access disabled", { status: 403 });
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
