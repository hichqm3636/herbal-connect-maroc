// Edge function: admin-only distributor account management
// Supports actions: create, reset_password, set_active
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Action = "create" | "reset_password" | "set_active";

interface Payload {
  action?: Action;
  // create
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  territoryId?: string;
  initialPoints?: number;
  // reset_password / set_active
  userId?: string;
  newPassword?: string;
  isActive?: boolean;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
function bad(message: string, status = 400) {
  return json({ error: message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return bad("Method not allowed", 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return bad("غير مصرح", 401);

  // Verify caller is admin
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: userRes, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userRes.user) return bad("غير مصرح", 401);

  const adminId = userRes.user.id;
  const { data: roles, error: rolesErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", adminId);
  if (rolesErr) return bad(rolesErr.message, 500);
  const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
  if (!isSuper && !(roles ?? []).some((r) => r.role === "admin")) return bad("صلاحية غير كافية", 403);

  // Resolve caller's company_id (admins inherit theirs; super_admin must pass it explicitly)
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile } = await admin
    .from("profiles")
    .select("company_id")
    .eq("id", adminId)
    .maybeSingle();
  const callerCompanyId = (callerProfile?.company_id as string | null) ?? null;

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return bad("صيغة غير صالحة");
  }

  const action: Action = body.action ?? "create";

  // Helper: log to admin_activity_log
  const log = async (a: string, targetId: string | null, meta: Record<string, unknown>) => {
    await admin.from("admin_activity_log").insert({
      admin_id: adminId,
      action: a,
      target_user_id: targetId,
      metadata: meta,
    });
  };

  if (action === "create") {
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const territoryId = body.territoryId?.trim() ?? "";
    const initialPoints = Math.max(0, Math.floor(body.initialPoints ?? 0));

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("بريد غير صالح");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
      return bad("كلمة المرور يجب أن تحتوي 8 أحرف على الأقل مع حروف وأرقام");
    if (fullName.length < 2) return bad("الاسم قصير جداً");
    if (phone.length < 6) return bad("رقم الهاتف غير صالح");
    if (!territoryId) return bad("المنطقة مطلوبة");

    const { data: territory, error: tErr } = await admin
      .from("territories")
      .select("id, name")
      .eq("id", territoryId)
      .maybeSingle();
    if (tErr) return bad(tErr.message, 500);
    if (!territory) return bad("المنطقة غير موجودة", 400);

    const { data: dup } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .eq("territory_id", territoryId)
      .eq("is_active", true)
      .limit(1);
    if (dup && dup.length > 0) return bad("رقم الهاتف مستخدم بالفعل في نفس المنطقة", 409);

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, phone, city: territory.name },
    });
    if (createErr) {
      const msg = /already|exists|registered/i.test(createErr.message)
        ? "هذا البريد مسجل مسبقاً"
        : createErr.message;
      return bad(msg, 400);
    }
    if (!created.user) return bad("تعذر إنشاء المستخدم", 500);

    const { error: updErr } = await admin
      .from("profiles")
      .update({ territory_id: territoryId, ...(initialPoints > 0 ? { loyalty_points: initialPoints } : {}) })
      .eq("id", created.user.id);
    if (updErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return bad(updErr.message, 400);
    }

    if (initialPoints > 0) {
      await admin.from("loyalty_transactions").insert({
        distributor_id: created.user.id,
        points: initialPoints,
        reason: "نقاط ابتدائية عند إنشاء الحساب",
        admin_id: adminId,
      });
    }

    await log("create_distributor", created.user.id, { email, fullName, territoryId, territoryName: territory.name });
    return json({ id: created.user.id, email: created.user.email });
  }

  if (action === "reset_password") {
    const userId = body.userId ?? "";
    const newPassword = body.newPassword ?? "";
    if (!userId) return bad("معرّف المستخدم مفقود");
    if (newPassword.length < 8 || !/[A-Za-z]/.test(newPassword) || !/[0-9]/.test(newPassword))
      return bad("كلمة المرور يجب أن تحتوي 8 أحرف على الأقل مع حروف وأرقام");

    const { error } = await admin.auth.admin.updateUserById(userId, { password: newPassword });
    if (error) return bad(error.message, 400);
    await log("reset_password", userId, {});
    return json({ ok: true });
  }

  if (action === "set_active") {
    const userId = body.userId ?? "";
    const isActive = !!body.isActive;
    if (!userId) return bad("معرّف المستخدم مفقود");

    const { error: pErr } = await admin
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", userId);
    if (pErr) return bad(pErr.message, 400);

    // Also ban/unban at auth level so they can't log in while disabled
    const { error: aErr } = await admin.auth.admin.updateUserById(userId, {
      ban_duration: isActive ? "none" : "876000h",
    });
    if (aErr) return bad(aErr.message, 400);

    await log(isActive ? "enable_distributor" : "disable_distributor", userId, {});
    return json({ ok: true });
  }

  return bad("إجراء غير معروف");
});
