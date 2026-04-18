import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [{ title: "إعادة تعيين كلمة المرور — بوابة هيرباليفي" }],
  }),
});

const passwordSchema = z
  .object({
    password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }).max(100),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "كلمتا المرور غير متطابقتين",
    path: ["confirm"],
  });

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Supabase parses the recovery token from the URL hash automatically
    // and emits a PASSWORD_RECOVERY event.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) setReady(true);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = passwordSchema.safeParse({
      password: form.get("password"),
      confirm: form.get("confirm"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "تعذر تحديث كلمة المرور");
      return;
    }
    toast.success("تم تحديث كلمة المرور بنجاح");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
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
          <h2 className="text-lg font-bold mb-1 text-center">تعيين كلمة مرور جديدة</h2>
          <p className="text-xs text-muted-foreground mb-6 text-center">
            اختر كلمة مرور قوية لحسابك
          </p>

          {!ready ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                جاري التحقق من رابط إعادة التعيين...
              </p>
              <p className="text-xs text-muted-foreground">
                إذا لم يتم التحقق، يرجى طلب رابط جديد من صفحة تسجيل الدخول.
              </p>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور الجديدة</Label>
                <Input id="password" name="password" type="password" autoComplete="new-password" required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                تحديث كلمة المرور
              </Button>
            </form>
          )}

          <div className="mt-4 text-center">
            <Link to="/login" className="text-xs text-muted-foreground hover:text-primary">
              العودة إلى تسجيل الدخول
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
