import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

const emailSchema = z
  .string()
  .trim()
  .email({ message: "بريد إلكتروني غير صالح" })
  .max(255);

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const tenant = useTenant();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);
  const [usePassword, setUsePassword] = useState(false);

  // If we already have a session, bounce to /auth/callback so it routes by role.
  useEffect(() => {
    if (!loading && session) navigate({ to: "/auth/callback" });
  }, [session, loading, navigate]);

  const companyName =
    tenant.company?.display_name || tenant.company?.name || "Nexora";
  const companyLogo = tenant.company?.logo_url || null;
  const companyInitial = companyName.charAt(0).toUpperCase();

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    if (usePassword) {
      if (!password || password.length < 6) {
        toast.error("كلمة المرور قصيرة جداً");
        return;
      }
      setSubmitting(true);
      const { error } = await supabase.auth.signInWithPassword({
        email: parsed.data,
        password,
      });
      setSubmitting(false);
      if (error) {
        toast.error(error.message || "تعذر تسجيل الدخول");
        return;
      }
      toast.success("مرحباً بعودتك");
      navigate({ to: "/auth/callback" });
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال رابط الدخول");
      return;
    }
    setSent(true);
    toast.success("تم إرسال رابط الدخول إلى بريدك الإلكتروني");
  };

  return (
    <div
      className="min-h-screen bg-gradient-soft flex items-center justify-center p-4"
      dir="rtl"
    >
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
          <h1 className="mt-4 text-2xl font-extrabold leading-tight">
            {companyName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tenant.company ? "Distributor Portal" : "Distribution Management Platform"}
          </p>
        </div>

        <Card className="p-6 shadow-elegant">
          <h2 className="text-lg font-bold mb-1 text-center">تسجيل الدخول</h2>
          <p className="text-xs text-muted-foreground mb-6 text-center">
            أدخل بريدك الإلكتروني وسنرسل لك رابط دخول آمن
          </p>

          {sent ? (
            <div className="space-y-4 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                <Mail className="h-7 w-7 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="font-semibold">تحقق من بريدك الإلكتروني</p>
                <p className="text-sm text-muted-foreground">
                  أرسلنا رابط دخول إلى{" "}
                  <span dir="ltr" className="font-mono text-foreground">
                    {email}
                  </span>
                </p>
                <p className="text-xs text-muted-foreground">
                  انقر على الرابط في الرسالة لإكمال تسجيل الدخول. الرابط صالح لفترة محدودة.
                </p>
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={() => {
                  setSent(false);
                  setEmail("");
                }}
              >
                إرسال إلى بريد آخر
              </Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </div>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                إرسال رابط الدخول
              </Button>
            </form>
          )}
        </Card>

        {!tenant.company && (
          <p className="mt-4 text-center text-xs text-muted-foreground">
            ليس لديك بوابة بعد؟{" "}
            <Link to="/signup" className="font-semibold text-primary hover:underline">
              أنشئ بوابة شركتك
            </Link>
          </p>
        )}

        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold text-foreground">Nexora</span>
        </p>
      </div>
    </div>
  );
}
