// Shared authorization helper for Supabase Edge Functions.
//
// Verifies the caller's JWT, loads their roles + profile via an
// authenticated client (so RLS still applies), and returns a normalized
// authorization context. Use from any edge function that performs
// privileged work with the service-role client.
//
//   const ctx = await authorizeCompanyAdmin(req, { requestedCompanyId });
//   if ("error" in ctx) return ctx.error;     // pre-built Response
//   const { adminId, companyId, isSuper, supabaseAdmin } = ctx;
//
// The helper never trusts the caller for company scope: super_admin may
// optionally target another company via `requestedCompanyId`; everyone
// else is pinned to their own profile.company_id.

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonError(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface AuthorizeOptions {
  /** Optional company id the caller wants to operate on. Only super_admin may target another company. */
  requestedCompanyId?: string | null;
  /** When true, only super_admin is accepted (admins are rejected). */
  superOnly?: boolean;
}

export interface AuthorizedContext {
  adminId: string;
  companyId: string | null;
  isSuper: boolean;
  isAdmin: boolean;
  roles: string[];
  /** Service-role client. Use sparingly and only after authorization. */
  supabaseAdmin: SupabaseClient;
  /** Authenticated client tied to the caller's JWT (RLS applies). */
  supabaseUser: SupabaseClient;
}

export type AuthorizeResult =
  | AuthorizedContext
  | { error: Response };

export async function authorizeCompanyAdmin(
  req: Request,
  opts: AuthorizeOptions = {},
): Promise<AuthorizeResult> {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const ANON_KEY =
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");

  if (!SUPABASE_URL || !SERVICE_KEY || !ANON_KEY) {
    return { error: jsonError("Server misconfigured", 500) };
  }

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return { error: jsonError("غير مصرح", 401) };
  }

  const supabaseUser = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: userRes, error: userErr } = await supabaseUser.auth.getUser();
  if (userErr || !userRes.user) {
    return { error: jsonError("غير مصرح", 401) };
  }
  const adminId = userRes.user.id;

  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: roleRows, error: rolesErr } = await supabaseUser
    .from("user_roles")
    .select("role")
    .eq("user_id", adminId);
  if (rolesErr) {
    return { error: jsonError("Authorization check failed", 500) };
  }
  const roles = (roleRows ?? []).map((r) => r.role as string);
  const isSuper = roles.includes("super_admin");
  const isAdmin = roles.includes("admin");

  if (opts.superOnly) {
    if (!isSuper) return { error: jsonError("صلاحية غير كافية", 403) };
  } else if (!isSuper && !isAdmin) {
    return { error: jsonError("صلاحية غير كافية", 403) };
  }

  const { data: callerProfile } = await supabaseAdmin
    .from("profiles")
    .select("company_id")
    .eq("id", adminId)
    .maybeSingle();
  const profileCompanyId = (callerProfile?.company_id as string | null) ?? null;

  let companyId: string | null = profileCompanyId;
  const requested = opts.requestedCompanyId ?? null;
  if (requested) {
    if (isSuper) {
      companyId = requested;
    } else if (requested !== profileCompanyId) {
      return { error: jsonError("غير مصرح للوصول لهذه الشركة", 403) };
    }
  }

  if (!isSuper && !companyId) {
    return { error: jsonError("لا توجد شركة مرتبطة بحسابك", 400) };
  }

  return { adminId, companyId, isSuper, isAdmin, roles, supabaseAdmin, supabaseUser };
}

export { corsHeaders, jsonError };
