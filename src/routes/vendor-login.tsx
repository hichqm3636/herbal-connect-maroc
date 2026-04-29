import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import {
  Loader2,
  Mail,
  Store,
  ShieldCheck,
  TrendingUp,
  Package,
  ArrowLeft,
  CheckCircle2,
  Lock,
  Sparkles,
  BarChart3,
} from "lucide-react";
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
      { title: "بوابة الموردين — Nexora" },
      {
        name: "description",
        content:
          "بوابة دخول مخصّصة للموردين والشركاء التجاريين على Nexora — أدِر متجرك، طلباتك وفواتيرك من مكان واحد.",
      },
      { property: "og:title", content: "بوابة الموردين — Nexora" },
      {
        property: "og:description",
        content: "منصّة B2B احترافية للموردين في القطاع الصحي والرياضي.",
      },
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
  const [resetting, setResetting] = useState(false);

  const handleForgotPassword = async () => {
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      toast.error("أدخل بريدك الإلكتروني أولاً لإرسال رابط الاستعادة");
      return;
    }
    setResetting(true);
    const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
      redirectTo: `${window.location.origin}/reset-password`,
    });
    setResetting(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال رابط الاستعادة");
      return;
    }
    toast.success("تم إرسال رابط استعادة كلمة المرور إلى بريدك");
  };

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
    <div className="min-h-screen w-full bg-[#0B1220] text-white" dir="rtl">
      {/* Top utility bar */}
      <header className="relative z-20 border-b border-white/5 bg-[#0B1220]/80 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-5 py-3.5">
          <Link
            to="/"
            className="inline-flex items-center gap-2 text-xs text-white/60 transition hover:text-white"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            العودة إلى الرئيسية
          </Link>
          <div className="flex items-center gap-2 text-[11px] text-white/50">
            <Lock className="h-3 w-3" />
            <span>اتصال مشفّر TLS 1.3</span>
          </div>
        </div>
      </header>

      <div className="grid min-h-[calc(100vh-49px)] lg:grid-cols-[1.1fr_1fr]">
        {/* ===== Brand panel (left) ===== */}
        <aside className="relative hidden overflow-hidden lg:flex">
          {/* Layered gradient background */}
          <div className="absolute inset-0 bg-gradient-to-br from-[#0B1220] via-[#0F1B33] to-[#1A2547]" />
          {/* Grid pattern */}
          <div
            className="absolute inset-0 opacity-[0.18]"
            style={{
              backgroundImage:
                "linear-gradient(rgba(255,255,255,0.08) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.08) 1px, transparent 1px)",
              backgroundSize: "44px 44px",
              maskImage:
                "radial-gradient(ellipse at 30% 40%, black 30%, transparent 75%)",
            }}
          />
          {/* Glow orbs */}
          <div className="absolute -top-24 right-10 h-80 w-80 rounded-full bg-emerald-400/20 blur-[120px]" />
          <div className="absolute bottom-0 left-0 h-96 w-96 rounded-full bg-indigo-500/25 blur-[140px]" />

          <div className="relative z-10 flex w-full flex-col justify-between p-12 xl:p-16">
            {/* Brand mark */}
            <div className="flex items-center gap-3">
              <div className="relative flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 shadow-lg shadow-emerald-500/30">
                <Store className="h-6 w-6 text-white" strokeWidth={2.2} />
                <div className="absolute -inset-0.5 -z-10 rounded-2xl bg-gradient-to-br from-emerald-400 to-teal-600 opacity-50 blur" />
              </div>
              <div>
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-white/50">
                  Nexora
                </p>
                <p className="text-base font-bold leading-tight">Vendor Portal</p>
              </div>
            </div>

            {/* Headline */}
            <div className="space-y-8">
              <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-[11px] font-medium text-white/70 backdrop-blur">
                <Sparkles className="h-3 w-3 text-emerald-400" />
                منصّة B2B للموردين المعتمدين
              </div>

              <h1 className="text-[2.6rem] font-bold leading-[1.1] tracking-tight xl:text-[3rem]">
                أدِر متجرك بثقة.
                <br />
                <span className="bg-gradient-to-r from-emerald-300 via-teal-200 to-cyan-300 bg-clip-text text-transparent">
                  انمو بسرعة.
                </span>
              </h1>

              <p className="max-w-md text-base leading-relaxed text-white/70">
                لوحة تحكّم متكاملة لإدارة الكتالوج، الطلبات، الفواتير والمدفوعات —
                مصمّمة خصيصاً لموردي القطاع الصحي والرياضي في المغرب.
              </p>

              {/* Stats strip */}
              <div className="grid grid-cols-3 gap-4 border-y border-white/10 py-5">
                <Stat value="99.9%" label="جاهزية الخدمة" />
                <Stat value="<200ms" label="زمن الاستجابة" />
                <Stat value="ISO" label="حماية البيانات" />
              </div>

              {/* Features */}
              <div className="grid gap-3.5">
                <Feature
                  icon={<Package className="h-4 w-4" />}
                  title="إدارة الكتالوج"
                  desc="منتجات، أسعار جملة وتصنيفات بسهولة"
                />
                <Feature
                  icon={<BarChart3 className="h-4 w-4" />}
                  title="تحليلات لحظية"
                  desc="مبيعات، طلبات وأداء العملاء في الوقت الفعلي"
                />
                <Feature
                  icon={<ShieldCheck className="h-4 w-4" />}
                  title="فوترة وامتثال ضريبي"
                  desc="فواتير PDF رسمية مع ICE / IF / RC / TVA"
                />
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-[11px] text-white/40">
              <p>© {new Date().getFullYear()} Nexora B2B Platform</p>
              <div className="flex items-center gap-1.5">
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" />
                جميع الأنظمة تعمل
              </div>
            </div>
          </div>
        </aside>

        {/* ===== Form panel (right) ===== */}
        <main className="relative flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 px-5 py-10 text-slate-900 sm:px-8">
          <div className="w-full max-w-[420px]">
            {/* Mobile brand */}
            <div className="mb-8 flex items-center gap-3 lg:hidden">
              <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-600 text-white shadow-lg shadow-emerald-500/30">
                <Store className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.18em] text-slate-500">
                  Nexora
                </p>
                <p className="text-sm font-bold text-slate-900">بوابة الموردين</p>
              </div>
            </div>

            {/* Header */}
            <div className="mb-8">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
                دخول الموردين
              </span>
              <h2 className="mt-4 text-[1.85rem] font-bold leading-tight tracking-tight text-slate-900">
                أهلاً بعودتك
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-500">
                ادخل بريدك الإلكتروني المسجَّل وسنرسل لك رابط دخول آمن خلال ثوانٍ.
              </p>
            </div>

            {/* Card */}
            <div className="rounded-2xl border border-slate-200 bg-white p-7 shadow-[0_4px_30px_-8px_rgba(15,23,42,0.08)]">
              {sent ? (
                <div className="space-y-5 py-2 text-center">
                  <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                    <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
                    <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/40">
                      <Mail className="h-7 w-7 text-white" />
                    </div>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-base font-bold text-slate-900">
                      تحقّق من بريدك الإلكتروني
                    </p>
                    <p className="text-sm text-slate-500">
                      أرسلنا رابط الدخول إلى
                      <br />
                      <span dir="ltr" className="font-mono text-sm font-semibold text-slate-900">
                        {email}
                      </span>
                    </p>
                  </div>
                  <div className="flex items-center justify-center gap-1.5 text-[11px] text-slate-400">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                    صالح لمدة 60 دقيقة
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
                    استخدام بريد آخر
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-2">
                    <Label
                      htmlFor="vendor-email"
                      className="text-xs font-semibold uppercase tracking-wide text-slate-600"
                    >
                      البريد الإلكتروني المهني
                    </Label>
                    <div className="relative">
                      <Mail className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
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
                        className="h-12 border-slate-200 bg-slate-50/50 pr-10 text-left text-sm font-medium text-slate-900 placeholder:text-slate-400 focus-visible:bg-white focus-visible:ring-2 focus-visible:ring-emerald-500/30"
                      />
                    </div>
                  </div>

                  <Button
                    type="submit"
                    disabled={submitting}
                    className="group h-12 w-full bg-gradient-to-br from-slate-900 to-slate-700 text-sm font-semibold text-white shadow-lg shadow-slate-900/20 transition hover:from-slate-800 hover:to-slate-600 hover:shadow-xl hover:shadow-slate-900/25"
                  >
                    {submitting ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <>
                        إرسال رابط الدخول الآمن
                        <ArrowLeft className="mr-1 h-4 w-4 transition group-hover:-translate-x-0.5" />
                      </>
                    )}
                  </Button>

                  <div className="flex items-center justify-center gap-2 pt-1 text-[11px] text-slate-400">
                    <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
                    دخول بدون كلمة مرور — تشفير من طرف إلى طرف
                  </div>
                </form>
              )}
            </div>

            {/* Footer links */}
            <div className="mt-6 space-y-2.5 text-center text-xs text-slate-500">
              <p>
                هل أنت عميل؟{" "}
                <Link
                  to="/login"
                  className="font-semibold text-slate-900 underline-offset-2 hover:underline"
                >
                  دخول العملاء
                </Link>
              </p>
              <p>
                تريد الانضمام كمورد جديد؟{" "}
                <Link
                  to="/signup"
                  className="font-semibold text-emerald-700 underline-offset-2 hover:underline"
                >
                  أنشئ بوابة شركتك
                </Link>
              </p>
            </div>

            {/* Trust row */}
            <div className="mt-8 flex items-center justify-center gap-5 text-[10px] uppercase tracking-wider text-slate-400">
              <span className="flex items-center gap-1.5">
                <Lock className="h-3 w-3" />
                SSL
              </span>
              <span className="h-3 w-px bg-slate-300" />
              <span>RGPD</span>
              <span className="h-3 w-px bg-slate-300" />
              <span>ISO 27001</span>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function Feature({
  icon,
  title,
  desc,
}: {
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <div className="group flex items-start gap-3 rounded-xl border border-white/5 bg-white/[0.03] p-3 backdrop-blur transition hover:border-white/10 hover:bg-white/[0.06]">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-400/20 to-teal-500/10 text-emerald-300 ring-1 ring-emerald-400/20">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-white">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-white/60">{desc}</p>
      </div>
    </div>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="text-center">
      <p className="text-xl font-bold tracking-tight text-white">{value}</p>
      <p className="mt-1 text-[10px] uppercase tracking-wider text-white/50">{label}</p>
    </div>
  );
}
