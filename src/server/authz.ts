/**
 * Shared authorization helpers for TanStack server functions.
 *
 * Use these inside `.handler()` after `requireSupabaseAuth` middleware to
 * enforce role + tenant scope in a consistent way across the codebase.
 *
 *   const { companyId, isSuper } = await authorizeCompanyAdmin(context);
 *
 * Errors thrown here are plain `Error` instances. The TanStack Start runtime
 * surfaces them to the client; do not include sensitive details in messages.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AuthedSupabase = SupabaseClient<Database>;

export interface AuthMiddlewareContext {
  supabase: AuthedSupabase;
  userId: string;
  claims: Record<string, unknown>;
}

export interface CompanyAdminAuth {
  /** Resolved company id this admin is acting on. `null` only for super_admin platform-mode calls. */
  companyId: string | null;
  /** True when the caller has the `super_admin` role. */
  isSuper: boolean;
  /** True when the caller has `admin` role in the resolved company. */
  isAdmin: boolean;
  /** Roles attached to this user (raw values from `user_roles`). */
  roles: string[];
}

/**
 * Require the caller to be a company admin (or super_admin).
 *
 * `requestedCompanyId` is optional. If supplied:
 *   - super_admin may target any company
 *   - admin must match their own profile's company
 *   - anyone else is rejected
 *
 * If omitted, the caller's profile company is used.
 */
export async function authorizeCompanyAdmin(
  context: AuthMiddlewareContext,
  requestedCompanyId?: string | null,
): Promise<CompanyAdminAuth> {
  const { supabase, userId } = context;

  const [{ data: roleRows, error: rolesErr }, { data: profile, error: profileErr }] =
    await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", userId),
      supabase.from("profiles").select("company_id").eq("id", userId).maybeSingle(),
    ]);

  if (rolesErr) throw new Error("Authorization check failed");
  if (profileErr) throw new Error("Authorization check failed");

  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isSuper = roles.includes("super_admin");
  const isAdmin = roles.includes("admin");

  if (!isSuper && !isAdmin) {
    throw new Error("صلاحية غير كافية");
  }

  const profileCompanyId = (profile?.company_id as string | null | undefined) ?? null;
  let companyId: string | null = profileCompanyId;

  if (requestedCompanyId !== undefined && requestedCompanyId !== null) {
    if (isSuper) {
      companyId = requestedCompanyId;
    } else if (requestedCompanyId !== profileCompanyId) {
      throw new Error("غير مصرح للوصول لهذه الشركة");
    } else {
      companyId = requestedCompanyId;
    }
  }

  // Non-super admins must be attached to a company.
  if (!isSuper && !companyId) {
    throw new Error("لا توجد شركة مرتبطة بحسابك");
  }

  return { companyId, isSuper, isAdmin, roles };
}

/** Require the caller to be a super_admin. Returns roles for downstream logic. */
export async function authorizeSuperAdmin(
  context: AuthMiddlewareContext,
): Promise<{ roles: string[] }> {
  const { supabase, userId } = context;
  const { data: roleRows, error } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Authorization check failed");
  const roles = (roleRows ?? []).map((r) => r.role as string);
  if (!roles.includes("super_admin")) {
    throw new Error("Only super admins can perform this action");
  }
  return { roles };
}
