import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "تسجيل الدخول — بوابة هيرباليفي" }],
  }),
});

const signInSchema = z.object({
  email: z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255),
  password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }).max(100),
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  const handleSignIn = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signInSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithPassword(parsed.data);
    setSubmitting(false);
    if (error) {
      const msg = error.message || "";
      const friendly = /invalid|credentials/i.test(msg) ? "بيانات الدخول غير صحيحة" : msg;
      toast.error(friendly);
      return;
    }
    toast.success("مرحباً بعودتك");
    navigate({ to: "/dashboard" });
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <Link to="/" className="flex items-center justify-center gap-2 mb-6">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Leaf className="h-6 w-6 text-primary-foreground" />
          </div>
          <div className="text-right">
            <h1 className="text-xl font-extrabold leading-tight">Herbialife Partner Hub</h1>
            <p className="text-xs text-muted-foreground">منصة إدارة الموزعين والطلبات</p>
          </div>
        </Link>

        <Card className="p-6 shadow-elegant">
          <h2 className="text-lg font-bold mb-1 text-center">تسجيل الدخول</h2>
          <p className="text-xs text-muted-foreground mb-6 text-center">
            الحسابات الجديدة تُنشأ من طرف الإدارة فقط
          </p>
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">البريد الإلكتروني</Label>
              <Input id="email" name="email" type="email" autoComplete="email" required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              دخول
            </Button>
          </form>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          البوابة الرسمية للموزعين بالمغرب • للحصول على حساب تواصل مع الإدارة
        </p>
      </div>
    </div>
  );
}
