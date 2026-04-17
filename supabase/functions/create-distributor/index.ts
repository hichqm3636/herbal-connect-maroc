// Edge function: admin-only creation of distributor accounts
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

interface Payload {
  email?: string;
  password?: string;
  fullName?: string;
  phone?: string;
  city?: string;
}

function bad(message: string, status = 400) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
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

  const { data: roles, error: rolesErr } = await userClient
    .from("user_roles")
    .select("role")
    .eq("user_id", userRes.user.id);
  if (rolesErr) return bad(rolesErr.message, 500);
  if (!(roles ?? []).some((r) => r.role === "admin")) return bad("صلاحية غير كافية", 403);

  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return bad("صيغة غير صالحة");
  }

  const email = body.email?.trim() ?? "";
  const password = body.password ?? "";
  const fullName = body.fullName?.trim() ?? "";
  const phone = body.phone?.trim() ?? "";
  const city = body.city?.trim() ?? "";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return bad("بريد غير صالح");
  if (password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
    return bad("كلمة المرور يجب أن تحتوي 8 أحرف على الأقل مع حروف وأرقام");
  if (fullName.length < 2) return bad("الاسم قصير جداً");
  if (phone.length < 6) return bad("رقم الهاتف غير صالح");
  if (city.length < 2) return bad("المدينة مطلوبة");

  const admin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, phone, city },
  });
  if (createErr) return bad(createErr.message, 400);
  if (!created.user) return bad("تعذر إنشاء المستخدم", 500);

  return new Response(
    JSON.stringify({ id: created.user.id, email: created.user.email }),
    { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
