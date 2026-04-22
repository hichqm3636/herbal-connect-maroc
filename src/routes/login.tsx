import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  component: LoginPage,
  head: () => ({
    meta: [{ title: "تسجيل الدخول — Nexora" }],
  }),
});

const signInSchema = z.object({
  email: z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255),
  password: z.string().min(6, { message: "كلمة المرور يجب أن تكون 6 أحرف على الأقل" }).max(100),
});

const emailSchema = z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255);

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const tenant = useTenant();
  const [submitting, setSubmitting] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/dashboard" });
  }, [session, loading, navigate]);

  const companyName =
    tenant.company?.display_name || tenant.company?.name || "Nexora";
  const companyLogo = tenant.company?.logo_url || null;
  const companyInitial = companyName.charAt(0).toUpperCase();

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

  const handleResetPassword = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(resetEmail);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال رابط إعادة التعيين");
      return;
    }
    toast.success("إذا كان البريد مسجلاً، ستصلك رسالة بإعادة التعيين");
    setResetOpen(false);
    setResetEmail("");
  };

  return (
    <div className="min-h-screen bg-gradient-soft flex items-center justify-center p-4" dir="rtl">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          {companyLogo ? (
            <img
              src={companyLogo}
              alt={`شعار ${companyName}`}
              className="h-16 w-16 rounded-2xl object-cover ring-1 ring-border shadow-sm"
            />
          ) : (
            <div
              role="img"
              aria-label={`شعار ${companyName}`}
              className="flex h-16 w-16 items-center justify-center rounded-2xl text-2xl font-extrabold text-primary-foreground shadow-glow"
              style={{ background: "var(--company-brand, var(--primary))" }}
            >
              {tenant.company ? (
                <span aria-hidden="true">{companyInitial}</span>
              ) : (
                <Leaf className="h-7 w-7" />
              )}
            </div>
          )}
          <h1 className="mt-4 text-2xl font-extrabold leading-tight">{companyName}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.company ? "Distributor Portal" : "Distribution Management Platform"}
          </p>
        </div>

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
              <div className="flex items-center justify-between">
                <Label htmlFor="password">كلمة المرور</Label>
                <button
                  type="button"
                  onClick={() => setResetOpen(true)}
                  className="text-xs text-primary hover:underline"
                >
                  هل نسيت كلمة المرور؟
                </button>
              </div>
              <Input id="password" name="password" type="password" autoComplete="current-password" required />
            </div>
            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              دخول
            </Button>
          </form>
        </Card>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">Nexora</span>
        </p>
      </div>

      <Dialog open={resetOpen} onOpenChange={setResetOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle className="text-right">إعادة تعيين كلمة المرور</DialogTitle>
            <DialogDescription className="text-right">
              أدخل بريدك الإلكتروني وسنرسل لك رابطاً لتعيين كلمة مرور جديدة.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={handleResetPassword} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="reset-email">البريد الإلكتروني</Label>
              <Input
                id="reset-email"
                type="email"
                autoComplete="email"
                value={resetEmail}
                onChange={(e) => setResetEmail(e.target.value)}
                required
              />
            </div>
            <DialogFooter>
              <Button type="submit" disabled={resetting} className="w-full">
                {resetting && <Loader2 className="h-4 w-4 animate-spin" />}
                إرسال رابط الإعادة
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
