import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  AlertCircle,
  ArrowLeft,
  CheckCircle2,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/reset-password")({
  component: ResetPasswordPage,
  head: () => ({
    meta: [
      { title: "إعادة تعيين كلمة المرور — Nexora" },
      {
        name: "description",
        content: "صفحة إعادة تعيين كلمة المرور لحسابك على منصة Nexora.",
      },
    ],
  }),
});

const passwordSchema = z
  .string()
  .min(8, "كلمة المرور يجب أن تكون 8 أحرف على الأقل")
  .max(128, "كلمة المرور طويلة جداً (الحد الأقصى 128 حرفاً)")
  .regex(/[A-Za-z]/, "يجب أن تحتوي على حرف لاتيني واحد على الأقل")
  .regex(/[0-9]/, "يجب أن تحتوي على رقم واحد على الأقل");

/** Friendly Arabic translations for common Supabase auth errors. */
function translateAuthError(message: string | undefined): string {
  if (!message) return "حدث خطأ غير متوقع. حاول مجدداً.";
  const m = message.toLowerCase();
  if (m.includes("same") && m.includes("password")) {
    return "كلمة المرور الجديدة لا يمكن أن تكون نفس الكلمة السابقة.";
  }
  if (m.includes("expired") || m.includes("invalid token")) {
    return "انتهت صلاحية الرابط. يرجى طلب رابط استعادة جديد.";
  }
  if (m.includes("rate limit") || m.includes("too many")) {
    return "محاولات كثيرة في وقت قصير. انتظر دقيقة ثم حاول مجدداً.";
  }
  if (m.includes("network") || m.includes("fetch")) {
    return "تعذر الاتصال بالخادم. تحقق من اتصالك بالإنترنت.";
  }
  if (m.includes("weak")) return "كلمة المرور ضعيفة. اختر كلمة أقوى.";
  return message;
}

type Strength = { score: 0 | 1 | 2 | 3 | 4; label: string; color: string };

function evaluateStrength(pwd: string): Strength {
  if (!pwd) return { score: 0, label: "—", color: "bg-slate-200" };
  let score = 0;
  if (pwd.length >= 8) score++;
  if (pwd.length >= 12) score++;
  if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd) && /[^A-Za-z0-9]/.test(pwd)) score++;
  const map: Record<number, Strength> = {
    0: { score: 0, label: "ضعيفة جداً", color: "bg-rose-500" },
    1: { score: 1, label: "ضعيفة", color: "bg-rose-500" },
    2: { score: 2, label: "متوسطة", color: "bg-amber-500" },
    3: { score: 3, label: "جيدة", color: "bg-emerald-500" },
    4: { score: 4, label: "قوية جداً", color: "bg-emerald-600" },
  };
  return map[score as 0 | 1 | 2 | 3 | 4];
}

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [ready, setReady] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

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

  const strength = useMemo(() => evaluateStrength(password), [password]);
  const passwordsMatch = confirm.length > 0 && password === confirm;
  const passwordsMismatch = confirm.length > 0 && password !== confirm;

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setErrorMsg(null);

    const parsed = passwordSchema.safeParse(password);
    if (!parsed.success) {
      const msg = parsed.error.issues[0].message;
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }
    if (password !== confirm) {
      const msg = "كلمتا المرور غير متطابقتين";
      setErrorMsg(msg);
      toast.error(msg);
      return;
    }

    setSubmitting(true);
    const { error } = await supabase.auth.updateUser({ password: parsed.data });
    setSubmitting(false);

    if (error) {
      const friendly = translateAuthError(error.message);
      setErrorMsg(friendly);
      toast.error(friendly);
      return;
    }

    setSuccess(true);
    toast.success("تم تحديث كلمة المرور بنجاح");

    // Auto-redirect after 2.5s, but user can click the CTA anytime.
    setTimeout(async () => {
      await supabase.auth.signOut();
      navigate({ to: "/login" });
    }, 2500);
  };

  return (
    <div
      className="min-h-screen bg-gradient-soft flex items-center justify-center p-4"
      dir="rtl"
    >
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-accent text-primary-foreground shadow-glow">
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
          {/* ===== Loading ===== */}
          {!ready && (
            <div className="flex flex-col items-center justify-center gap-3 py-10">
              <Loader2 className="h-7 w-7 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">
                جاري التحقق من رابط الاستعادة...
              </p>
            </div>
          )}

          {/* ===== Invalid / expired link ===== */}
          {ready && !hasSession && !success && (
            <div className="space-y-5 text-center">
              <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-bold">
                  الرابط غير صالح أو منتهي الصلاحية
                </p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  قد يكون الرابط قد استُخدم من قبل، أو مرّت 60 دقيقة على إرساله.
                  اطلب رابطاً جديداً لإعادة تعيين كلمة المرور.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <Button asChild className="w-full">
                  <Link to="/login">
                    <ArrowLeft className="ml-1 h-4 w-4" />
                    طلب رابط جديد
                  </Link>
                </Button>
                <Button asChild variant="ghost" size="sm" className="w-full">
                  <Link to="/">العودة إلى الصفحة الرئيسية</Link>
                </Button>
              </div>
            </div>
          )}

          {/* ===== Success ===== */}
          {success && (
            <div className="space-y-5 py-2 text-center">
              <div className="relative mx-auto flex h-16 w-16 items-center justify-center">
                <div className="absolute inset-0 animate-ping rounded-full bg-emerald-400/30" />
                <div className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/40">
                  <CheckCircle2 className="h-8 w-8 text-white" />
                </div>
              </div>
              <div className="space-y-1.5">
                <p className="text-base font-bold">تم تحديث كلمة المرور بنجاح</p>
                <p className="text-sm leading-relaxed text-muted-foreground">
                  سيتم تحويلك إلى صفحة الدخول خلال ثوانٍ، أو اضغط الزر أدناه.
                </p>
              </div>
              <Button asChild className="w-full">
                <Link to="/login">
                  الانتقال إلى تسجيل الدخول
                  <ArrowLeft className="mr-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          )}

          {/* ===== Form ===== */}
          {ready && hasSession && !success && (
            <form onSubmit={handleSubmit} className="space-y-4">
              {errorMsg && (
                <div
                  role="alert"
                  className="flex items-start gap-2.5 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive"
                >
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <p className="leading-relaxed">{errorMsg}</p>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="password">كلمة المرور الجديدة</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="px-9"
                    dir="ltr"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPwd((v) => !v)}
                    className="absolute left-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:bg-muted hover:text-foreground"
                    aria-label={showPwd ? "إخفاء كلمة المرور" : "إظهار كلمة المرور"}
                  >
                    {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>

                {/* Strength meter */}
                {password.length > 0 && (
                  <div className="space-y-1 pt-1">
                    <div className="flex gap-1">
                      {[1, 2, 3, 4].map((i) => (
                        <div
                          key={i}
                          className={cn(
                            "h-1 flex-1 rounded-full transition-colors",
                            i <= strength.score ? strength.color : "bg-slate-200",
                          )}
                        />
                      ))}
                    </div>
                    <p className="text-[11px] text-muted-foreground">
                      قوة كلمة المرور:{" "}
                      <span className="font-semibold text-foreground">{strength.label}</span>
                    </p>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirm">تأكيد كلمة المرور</Label>
                <div className="relative">
                  <Lock className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="confirm"
                    type={showPwd ? "text" : "password"}
                    autoComplete="new-password"
                    required
                    minLength={8}
                    maxLength={128}
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className={cn(
                      "pr-9",
                      passwordsMismatch && "border-destructive focus-visible:ring-destructive/30",
                      passwordsMatch && "border-emerald-500 focus-visible:ring-emerald-500/30",
                    )}
                    dir="ltr"
                  />
                  {passwordsMatch && (
                    <CheckCircle2 className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-emerald-600" />
                  )}
                </div>
                {passwordsMismatch && (
                  <p className="text-[11px] text-destructive">
                    كلمتا المرور غير متطابقتين
                  </p>
                )}
              </div>

              <p className="text-[11px] leading-relaxed text-muted-foreground">
                يجب أن تحتوي كلمة المرور على 8 أحرف على الأقل، وتشمل حرفاً ورقماً.
                نوصي بإضافة رمز خاص لزيادة الأمان.
              </p>

              <Button
                type="submit"
                className="h-11 w-full text-sm font-semibold"
                disabled={submitting || !password || !confirm}
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ التحديث...
                  </>
                ) : (
                  "تحديث كلمة المرور"
                )}
              </Button>

              <div className="pt-1 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground transition hover:text-foreground"
                >
                  <ArrowLeft className="h-3 w-3" />
                  العودة إلى تسجيل الدخول
                </Link>
              </div>
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
