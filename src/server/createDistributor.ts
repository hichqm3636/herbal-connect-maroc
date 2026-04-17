import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const inputSchema = z.object({
  email: z.string().trim().email().max(255),
  password: z
    .string()
    .min(8)
    .max(100)
    .regex(/[A-Za-z]/)
    .regex(/[0-9]/),
  fullName: z.string().trim().min(2).max(100),
  phone: z.string().trim().min(6).max(20),
  city: z.string().trim().min(2).max(80),
});

export const createDistributor = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Verify caller is admin using their auth-scoped client
    const { supabase, userId } = context;
    const { data: roles, error: rolesErr } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    if (rolesErr) throw new Error(rolesErr.message);
    const isAdmin = (roles ?? []).some((r) => r.role === "admin");
    if (!isAdmin) throw new Error("صلاحية غير كافية");

    // Create the auth user with admin client (bypasses signup-disabled setting)
    const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
      email: data.email,
      password: data.password,
      email_confirm: true,
      user_metadata: {
        full_name: data.fullName,
        phone: data.phone,
        city: data.city,
      },
    });
    if (createErr) throw new Error(createErr.message);
    if (!created.user) throw new Error("تعذر إنشاء المستخدم");

    return { id: created.user.id, email: created.user.email };
  });
