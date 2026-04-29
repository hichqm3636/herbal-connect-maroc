import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getRequestIP } from "@tanstack/react-start/server";

const inputSchema = z.object({
  code: z.string().min(1).max(128),
});

/**
 * Verifies the super-admin secret code for the currently authenticated user.
 * Requirements:
 *  - User must be authenticated (middleware enforces this)
 *  - User must hold the `super_admin` role
 *  - The provided code must equal SUPER_ADMIN_SECRET_CODE
 *  - Rate limit: max 5 failed attempts per user OR per IP within last 15 minutes
 */
export const verifySuperAdminSecret = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const ip = (() => {
      try {
        return getRequestIP({ xForwardedFor: true }) ?? null;
      } catch {
        return null;
      }
    })();

    const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();

    // Rate-limit check
    const [{ count: userFails }, { count: ipFails }] = await Promise.all([
      supabaseAdmin
        .from("super_admin_login_attempts")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("success", false)
        .gte("created_at", since),
      ip
        ? supabaseAdmin
            .from("super_admin_login_attempts")
            .select("id", { count: "exact", head: true })
            .eq("ip", ip)
            .eq("success", false)
            .gte("created_at", since)
        : Promise.resolve({ count: 0 } as { count: number | null }),
    ]);

    if ((userFails ?? 0) >= 5 || (ipFails ?? 0) >= 10) {
      return {
        ok: false as const,
        error: "تم تجاوز عدد المحاولات. حاول مرة أخرى بعد 15 دقيقة.",
      };
    }

    // Verify role
    const { data: roleRow } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("role", "super_admin")
      .maybeSingle();

    const isSuper = !!roleRow;

    const expected = process.env.SUPER_ADMIN_SECRET_CODE;
    if (!expected) {
      return { ok: false as const, error: "خطأ في إعداد الخادم." };
    }

    const codeMatch = data.code === expected;
    const success = isSuper && codeMatch;

    await supabaseAdmin.from("super_admin_login_attempts").insert({
      user_id: userId,
      ip,
      success,
    });

    if (!success) {
      return { ok: false as const, error: "رمز غير صحيح أو غير مصرّح." };
    }

    return { ok: true as const };
  });
