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
 * instead of a generic 500.
 */
import { createMiddleware } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const requireEnabledDistributorRole = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const { supabase, userId } = context;

    const { data: roleRows, error } = await supabase
      .from("user_roles")
      .select("role, is_enabled")
      .eq("user_id", userId);

    if (error) {
      throw new Response("Authorization check failed", { status: 500 });
    }

    const roles = roleRows ?? [];
    const isSuperAdmin = roles.some((r) => r.role === "super_admin");
    const isAdmin = roles.some((r) => r.role === "admin");
    const hasEnabledDistributorRole = roles.some(
      (r) => r.role === "distributor" && r.is_enabled === true,
    );

    if (!isSuperAdmin && !isAdmin && !hasEnabledDistributorRole) {
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
