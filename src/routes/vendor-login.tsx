import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, Mail, Store, ShieldCheck, TrendingUp, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/vendor-login")({
  component: VendorLoginPage,
  head: () => ({
    meta: [
      { title: "دخول الموردين — Nexora" },
      { name: "description", content: "بوابة دخول الموردين والشركاء التجاريين على منصة Nexora." },
      { property: "og:title", content: "دخول الموردين — Nexora" },
      { property: "og:description", content: "بوابة دخول الموردين والشركاء التجاريين." },
    ],
  }),
});

const emailSchema = z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255);

function VendorLoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!loading && session) navigate({ to: "/auth/callback" });
  }, [session, loading, navigate]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
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
      className="min-h-screen grid lg:grid-cols-2 bg-background"
      dir="rtl"
    >
      {/* Left brand panel — vendor focused */}
      <div className="relative hidden lg:flex flex-col justify-between overflow-hidden bg-gradient-to-br from-primary via-primary to-accent p-10 text-primary-foreground">
        <div className="absolute inset-0 opacity-20">
          <div className="absolute top-10 right-10 h-64 w-64 rounded-full bg-white/30 blur-3xl" />
          <div className="absolute bottom-10 left-10 h-72 w-72 rounded-full bg-white/20 blur-3xl" />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-white/15 backdrop-blur ring-1 ring-white/30">
            <Store className="h-6 w-6" />
          </div>
          <div>
            <p className="text-sm opacity-80">Nexora</p>
            <p className="text-lg font-bold">بوابة الموردين</p>
          </div>
        </div>

        <div className="relative z-10 space-y-6">
          <h2 className="text-4xl font-extrabold leading-tight">
            أدِر متجرك،
            <br />
            وزِّع منتجاتك،
            <br />
            وانمو معنا.
          </h2>
          <p className="text-base opacity-90 max-w-md">
            منصة متكاملة للموردين لإدارة الكتالوج، الطلبات، والفواتير في مكان واحد.
          </p>

          <div className="grid gap-4 pt-4">
            <Feature icon={<Package className="h-5 w-5" />} title="إدارة المخزون" desc="تحكم كامل في منتجاتك وأسعارك" />
            <Feature icon={<TrendingUp className="h-5 w-5" />} title="تقارير لحظية" desc="تابع المبيعات والأداء فوراً" />
            <Feature icon={<ShieldCheck className="h-5 w-5" />} title="مدفوعات آمنة" desc="نظام دفع موثوق ومحمي" />
          </div>
        </div>

        <p className="relative z-10 text-xs opacity-70">
          © {new Date().getFullYear()} Nexora — All rights reserved
        </p>
      </div>

      {/* Right form panel */}
      <div className="flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          <div className="lg:hidden flex items-center gap-3 mb-8">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground">
              <Store className="h-6 w-6" />
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Nexora</p>
              <p className="text-base font-bold">بوابة الموردين</p>
            </div>
          </div>

          <div className="mb-8">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-3 py-1 text-xs font-semibold text-primary">
              <Store className="h-3 w-3" />
              مورّد
            </span>
            <h1 className="mt-3 text-3xl font-extrabold tracking-tight">
              مرحباً بك مجدداً
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              سجّل دخولك للوصول إلى لوحة تحكم متجرك
            </p>
          </div>

          <Card className="p-6 border-2 shadow-elegant">
            {sent ? (
              <div className="space-y-4 text-center py-2">
                <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                  <Mail className="h-8 w-8 text-primary" />
                </div>
                <div className="space-y-1">
                  <p className="font-semibold">تحقق من بريدك الإلكتروني</p>
                  <p className="text-sm text-muted-foreground">
                    أرسلنا رابط دخول إلى{" "}
                    <span dir="ltr" className="font-mono text-foreground">{email}</span>
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  className="w-full"
                  onClick={() => { setSent(false); setEmail(""); }}
                >
                  إرسال إلى بريد آخر
                </Button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-2">
                  <Label htmlFor="vendor-email">البريد الإلكتروني للمورد</Label>
                  <Input
                    id="vendor-email"
                    name="email"
                    type="email"
                    autoComplete="email"
                    required
                    dir="ltr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="vendor@company.com"
                    className="h-11"
                  />
                </div>
                <Button type="submit" className="w-full h-11 text-base font-semibold" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  إرسال رابط الدخول الآمن
                </Button>
                <p className="text-center text-[11px] text-muted-foreground">
                  دخول بدون كلمة مرور — نرسل رابطاً آمناً إلى بريدك.
                </p>
              </form>
            )}
          </Card>

          <div className="mt-6 space-y-2 text-center text-xs text-muted-foreground">
            <p>
              لست مورداً؟{" "}
              <Link to="/login" className="font-semibold text-primary hover:underline">
                تسجيل دخول العملاء
              </Link>
            </p>
            <p>
              تريد الانضمام كمورد؟{" "}
              <Link to="/signup" className="font-semibold text-primary hover:underline">
                أنشئ بوابة شركتك
              </Link>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/30 backdrop-blur">
        {icon}
      </div>
      <div>
        <p className="font-semibold">{title}</p>
        <p className="text-sm opacity-80">{desc}</p>
      </div>
    </div>
  );
}
