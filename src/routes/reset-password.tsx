import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [{ title: "إعادة تعيين كلمة المرور — Nexora" }],
  }),
});

const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(128)
  .regex(/[A-Za-z]/, "يجب أن تحتوي على حرف واحد على الأقل")
  .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل");

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Supabase auto-handles the recovery token in the URL hash and fires
  // a PASSWORD_RECOVERY event. We just wait for the session to be ready.
  useEffect(() => {
    let mounted = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;
      if (event === "PASSWORD_RECOVERY" || session) {
        setHasSession(true);
      }
      setReady(true);
    });

    // Check existing session in case event already fired
    supabase.auth.getSession().then(({ data }) => {
      if (!mounted) return;
      if (data.session) setHasSession(true);
      setReady(true);
    });

    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (password !== confirm) {
      toast.error("كلمتا المرور غير متطابقتين");
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setSubmitting(false);

    if (error) {
      toast.error(error.message || "تعذر تحديث كلمة المرور");
      return;
    }

    toast.success("تم تحديث كلمة المرور بنجاح. يرجى تسجيل الدخول.");
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  return (
    <div
      className="min-h-screen bg-gradient-soft flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-glow">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold leading-tight">
            إعادة تعيين كلمة المرور
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            اختر كلمة مرور جديدة وآمنة لحسابك
          </p>
        </div>

        <Card className="p-6 shadow-elegant">
          {!ready ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !hasSession ? (
            <div className="space-y-4 text-center">
              <p className="font-semibold">الرابط غير صالح أو منتهي الصلاحية</p>
              <p className="text-sm text-muted-foreground">
                يرجى طلب رابط جديد لإعادة تعيين كلمة المرور.
              </p>
              <Button className="w-full" onClick={() => navigate({ to: "/login" })}>
                العودة لتسجيل الدخول
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="pr-9"
                    dir="ltr"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type="password"
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="pr-9"
                    dir="ltr"
                  />
                </div>
              </div>

              <p className="text-[11px] text-muted-foreground">
                يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل وتشمل حرفاً ورقماً.
              </p>

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                تحديث كلمة المرور
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">Nexora</span>
        </p>
      </div>
    </div>
  );
}
