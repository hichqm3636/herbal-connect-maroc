// Edge function: admin-only distributor account management
// Supports actions: create, reset_password, set_active
// Authorization is delegated to the shared authorizeCompanyAdmin helper.
import { authorizeCompanyAdmin, corsHeaders } from "../_shared/authz.ts";

type Action =
  | "create"
  | "reset_password"
  | "set_active"
  | "set_banned"
  | "get_user_status";

const DISTRIBUTOR_ROLE_NAMES = ["distributor", "buyer", "seller", "sales_agent"] as const;

interface Payload {
  action?: Action;
  // create
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  territoryId?: string;
  pricingTierId?: string | null;
  customDiscountPercent?: number | null;
  accountType?: string;
  roles?: string[];
  initialPoints?: number;
  // super admin impersonation: explicit company target
  companyId?: string;
  // reset_password / set_active
  userId?: string;
  userIds?: string[];
  newPassword?: string;
  isActive?: boolean;
  isBanned?: boolean;
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

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return bad("صيغة غير صالحة");
  }

  // Centralized auth: verifies JWT, role, and resolves effective company scope.
  // super_admin may target any company by passing `companyId`; admins are
  // pinned to their own profile.company_id.
  const auth = await authorizeCompanyAdmin(req, { requestedCompanyId: body.companyId ?? null });
  if ("error" in auth) return auth.error;
  const { adminId, companyId: callerCompanyId, supabaseAdmin: admin } = auth;

  const action: Action = body.action ?? "create";

  // Helper: log to admin_activity_log
  const log = async (a: string, targetId: string | null, meta: Record<string, unknown>) => {
    await admin.from("admin_activity_log").insert({
      admin_id: adminId,
      action: a,
      target_user_id: targetId,
      metadata: meta,
      company_id: callerCompanyId,
    });
  };

  if (action === "create") {
    const email = body.email?.trim().toLowerCase() ?? "";
    const password = body.password ?? "";
    const fullName = body.fullName?.trim() ?? "";
    const phone = body.phone?.trim() ?? "";
    const territoryId = body.territoryId?.trim() ?? "";
    const pricingTierId = body.pricingTierId?.trim() || null;
    const customDiscountPercent =
      typeof body.customDiscountPercent === "number" && Number.isFinite(body.customDiscountPercent)
        ? body.customDiscountPercent
        : null;
    const accountType = (body.accountType?.trim() || "distributor") as
      | "pharmacy" | "parapharmacy" | "distributor" | "master_distributor";
    const allowedAccountTypes = ["pharmacy", "parapharmacy", "distributor", "master_distributor"];
    if (!allowedAccountTypes.includes(accountType)) return bad("نوع حساب غير صالح");
    const allowedRoles = ["buyer", "seller", "sales_agent"];
    const rolesIn = Array.isArray(body.roles) && body.roles.length > 0 ? body.roles : ["buyer"];
    const clientRoles = [...new Set(rolesIn.filter((r) => allowedRoles.includes(r)))];
    if (clientRoles.length === 0) return bad("اختر دوراً واحداً على الأقل");
    if (customDiscountPercent !== null && (customDiscountPercent < 0 || customDiscountPercent > 100))
      return bad("نسبة الخصم المخصصة يجب أن تكون بين 0 و 100");
    if (customDiscountPercent !== null && !pricingTierId)
      return bad("اختر فئة تسعير قبل تعيين نسبة خصم مخصصة");
    const initialPoints = Math.max(0, Math.floor(body.initialPoints ?? 0));

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("بريد غير صالح");
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
      return bad("كلمة المرور يجب أن تحتوي 8 أحرف على الأقل مع حروف وأرقام");
    if (fullName.length < 2) return bad("الاسم قصير جداً");
    if (phone.length < 6) return bad("رقم الهاتف غير صالح");
    if (!territoryId) return bad("المنطقة مطلوبة");
    if (!callerCompanyId) return bad("لا توجد شركة مرتبطة بحسابك", 400);

    const { data: territory, error: tErr } = await admin
      .from("territories")
      .select("id, name, company_id")
      .eq("id", territoryId)
      .maybeSingle();
    if (tErr) return bad(tErr.message, 500);
    if (!territory) return bad("المنطقة غير موجودة", 400);
    if (territory.company_id !== callerCompanyId) return bad("المنطقة لا تنتمي لشركتك", 403);

    if (pricingTierId) {
      const { data: tier } = await admin
        .from("pricing_tiers")
        .select("id")
        .eq("id", pricingTierId)
        .maybeSingle();
      if (!tier) return bad("فئة التسعير غير صالحة", 400);
    }

    const { data: dup } = await admin
      .from("profiles")
      .select("id")
      .eq("phone", phone)
      .eq("territory_id", territoryId)
      .eq("company_id", callerCompanyId)
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
      .upsert({
        id: created.user.id,
        full_name: fullName,
        phone,
        city: territory.name,
        territory_id: territoryId,
        company_id: callerCompanyId,
        is_active: true,
        account_type: accountType,
        ...(initialPoints > 0 ? { loyalty_points: initialPoints } : {}),
      }, { onConflict: "id" });
    if (updErr) {
      await admin.auth.admin.deleteUser(created.user.id);
      return bad(updErr.message, 400);
    }

    if (pricingTierId) {
      await admin.from("company_distributor_pricing").insert({
        company_id: callerCompanyId,
        distributor_id: created.user.id,
        pricing_tier_id: pricingTierId,
        custom_discount_percent: customDiscountPercent,
      });
    }

    // Assign legacy distributor role + selected client roles, all scoped to the company
    const roleRows = [
      { user_id: created.user.id, role: "distributor", company_id: callerCompanyId },
      ...clientRoles.map((role) => ({
        user_id: created.user.id,
        role,
        company_id: callerCompanyId,
      })),
    ];
    await admin.from("user_roles").insert(roleRows);

    if (initialPoints > 0) {
      await admin.from("loyalty_transactions").insert({
        distributor_id: created.user.id,
        points: initialPoints,
        reason: "نقاط ابتدائية عند إنشاء الحساب",
        admin_id: adminId,
        company_id: callerCompanyId,
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

  // Shared safety guard for destructive account actions (disable / ban).
  // Rules:
  //  - Cannot target yourself.
  //  - Cannot target a user holding the `admin` or `super_admin` role.
  // The check uses the service-role client so it bypasses RLS, but we still
  // scope the role lookup to roles that exist anywhere for that user.
  const guardDestructiveTarget = async (
    userId: string,
  ): Promise<Response | null> => {
    if (userId === adminId) {
      return bad("لا يمكنك تنفيذ هذا الإجراء على حسابك", 403);
    }
    const { data: roleRows, error: rErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rErr) return bad("تعذر التحقق من صلاحيات المستخدم", 500);
    const targetRoles = (roleRows ?? []).map((r) => r.role as string);
    if (targetRoles.includes("super_admin") || targetRoles.includes("admin")) {
      return bad("لا يمكن تعطيل أو حظر حسابات المسؤولين", 403);
    }
    return null;
  };

  if (action === "set_active") {
    const userId = body.userId ?? "";
    const isActive = !!body.isActive;
    if (!userId) return bad("معرّف المستخدم مفقود");

    // Only guard the destructive direction (disable). Re-enabling is safe.
    if (!isActive) {
      const blocked = await guardDestructiveTarget(userId);
      if (blocked) return blocked;
    }

    const { error: pErr } = await admin
      .from("profiles")
      .update({ is_active: isActive })
      .eq("id", userId);
    if (pErr) return bad(pErr.message, 400);

    await log(isActive ? "enable_distributor" : "disable_distributor", userId, {});
    return json({ ok: true });
  }

  if (action === "set_banned") {
    const userId = body.userId ?? "";
    const isBanned = !!body.isBanned;
    if (!userId) return bad("معرّف المستخدم مفقود");

    // Only guard the destructive direction (ban). Unbanning is safe.
    if (isBanned) {
      const blocked = await guardDestructiveTarget(userId);
      if (blocked) return blocked;
    }

    const { error: roleErr } = await admin
      .from("user_roles")
      .update({ is_enabled: !isBanned })
      .eq("user_id", userId)
      .in("role", [...DISTRIBUTOR_ROLE_NAMES]);
    if (roleErr) return bad(roleErr.message, 400);

    await log(isBanned ? "disable_distributor_roles" : "enable_distributor_roles", userId, {});
    return json({ ok: true });
  }

  if (action === "get_user_status") {
    const ids = body.userIds ?? (body.userId ? [body.userId] : []);
    if (ids.length === 0) return json({ statuses: {} });

    const statuses: Record<
      string,
      {
        distributor_disabled: boolean;
        last_sign_in_at: string | null;
        email: string | null;
      }
    > = {};
    for (const id of ids) {
      const [{ data, error }, { data: roleRows }, { data: profileRow }] = await Promise.all([
        admin.auth.admin.getUserById(id),
        admin.from("user_roles").select("role, is_enabled").eq("user_id", id),
        admin.from("profiles").select("is_active").eq("id", id).maybeSingle(),
      ]);
      if (error || !data?.user) {
        statuses[id] = { distributor_disabled: false, last_sign_in_at: null, email: null };
        continue;
      }
      const distributorRoleRows = ((roleRows ?? []) as { role: string; is_enabled?: boolean | null }[])
        .filter((row) => DISTRIBUTOR_ROLE_NAMES.includes(row.role as (typeof DISTRIBUTOR_ROLE_NAMES)[number]));
      const hasDistributorRole = distributorRoleRows.length > 0;
      const hasEnabledDistributorRole = distributorRoleRows.some((row) => row.is_enabled !== false);
      const distributorDisabled =
        (profileRow?.is_active === false) || (hasDistributorRole && !hasEnabledDistributorRole);
      const u = data.user as unknown as { last_sign_in_at?: string | null; email?: string | null };
      statuses[id] = {
        distributor_disabled: distributorDisabled,
        last_sign_in_at: u.last_sign_in_at ?? null,
        email: u.email ?? null,
      };
    }
    return json({ statuses });
  }

  return bad("إجراء غير معروف");
});
