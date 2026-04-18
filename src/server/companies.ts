import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface CreateCompanyInput {
  name: string;
  display_name: string;
  brand_color: string;
  admin_email: string;
  admin_password: string;
  admin_full_name: string;
}

export const createCompanyWithAdmin = createServerFn({ method: "POST" })
  .inputValidator((input: CreateCompanyInput) => {
    const slug = input.name.trim().toLowerCase().replace(/\s+/g, "-");
    if (slug.length < 2) throw new Error("اسم الشركة قصير جداً");
    const email = input.admin_email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("بريد المسؤول غير صالح");
    if (
      input.admin_password.length < 8 ||
      !/[A-Za-z]/.test(input.admin_password) ||
      !/[0-9]/.test(input.admin_password)
    ) {
      throw new Error("كلمة المرور: 8 أحرف على الأقل مع حروف وأرقام");
    }
    if (input.admin_full_name.trim().length < 2) throw new Error("اسم المسؤول مطلوب");
    return {
      name: slug,
      display_name: input.display_name.trim() || slug,
      brand_color: input.brand_color,
      admin_email: email,
      admin_password: input.admin_password,
      admin_full_name: input.admin_full_name.trim(),
    };
  })
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    // Verify caller is super_admin
    const { data: roles } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId);
    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) throw new Error("Only super admins can create companies");

    // 1) Create auth user (email pre-confirmed since super-admin provisioned)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.admin_email,
      password: data.admin_password,
      email_confirm: true,
      user_metadata: { full_name: data.admin_full_name },
    });
    if (createErr) throw new Error(createErr.message);
    const newUserId = created.user?.id;
    if (!newUserId) throw new Error("تعذر إنشاء حساب المسؤول");

    // 2-4) Provision company, attach profile + admin role (RPC handles all atomically)
    const { data: companyId, error: rpcErr } = await supabaseAdmin.rpc("provision_company", {
      _name: data.name,
      _display_name: data.display_name,
      _admin_user_id: newUserId,
      _brand_color: data.brand_color,
    });
    if (rpcErr) {
      // Rollback the auth user if company provisioning fails
      await supabaseAdmin.auth.admin.deleteUser(newUserId);
      throw new Error(rpcErr.message);
    }

    // Set the admin's full name on their profile
    await supabaseAdmin
      .from("profiles")
      .update({ full_name: data.admin_full_name })
      .eq("id", newUserId);

    return { company_id: companyId as string, admin_user_id: newUserId };
  });
