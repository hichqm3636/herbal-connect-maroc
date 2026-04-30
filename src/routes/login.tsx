import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2, Mail, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const passwordSchema = z
  .string()
  .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
  .max(72, { message: "كلمة المرور طويلة جداً" });

const fullNameSchema = z
  .string()
  .trim()
  .min(2, { message: "الاسم الكامل مطلوب" })
  .max(100);

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const tenant = useTenant();

  // Password mode (default — fastest)
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Magic-link mode (kept as alternative)
  const [magicEmail, setMagicEmail] = useState("");
  const [magicSubmitting, setMagicSubmitting] = useState(false);
  const [magicSent, setMagicSent] = useState(false);

  // If we already have a session, bounce to /auth/callback so it routes by role.
  useEffect(() => {
    if (!loading && session) navigate({ to: "/auth/callback" });
  }, [session, loading, navigate]);

  const companyName =
    tenant.company?.display_name || tenant.company?.name || "Nexora";
  const companyLogo = tenant.company?.logo_url || null;
  const companyInitial = companyName.charAt(0).toUpperCase();

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();

    const emailParsed = emailSchema.safeParse(email);
    if (!emailParsed.success) {
      toast.error(emailParsed.error.issues[0].message);
      return;
    }
    const passwordParsed = passwordSchema.safeParse(password);
    if (!passwordParsed.success) {
      toast.error(passwordParsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);

    if (mode === "signup") {
      const nameParsed = fullNameSchema.safeParse(fullName);
      if (!nameParsed.success) {
        setSubmitting(false);
        toast.error(nameParsed.error.issues[0].message);
        return;
      }

      const { error } = await supabase.auth.signUp({
        email: emailParsed.data,
        password: passwordParsed.data,
        options: {
          emailRedirectTo: `${window.location.origin}/auth/callback`,
          data: { full_name: nameParsed.data },
        },
      });
      setSubmitting(false);
      if (error) {
        toast.error(error.message || "تعذر إنشاء الحساب");
        return;
      }
      toast.success("تم إنشاء الحساب — جارٍ تسجيل دخولك");
      // Auto-confirm is enabled, so the session is set immediately.
      // The useEffect above will redirect via /auth/callback.
      return;
    }

    const { error } = await supabase.auth.signInWithPassword({
      email: emailParsed.data,
      password: passwordParsed.data,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message || "بيانات الدخول غير صحيحة");
      return;
    }
    toast.success("تم تسجيل الدخول");
  };

  const handleMagicSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = emailSchema.safeParse(magicEmail);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setMagicSubmitting(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: parsed.data,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setMagicSubmitting(false);
    if (error) {
      toast.error(error.message || "تعذر إرسال رابط الدخول");
      return;
    }
    setMagicSent(true);
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
            {tenant.company ? "Marketplace Portal" : "Marketplace Platform"}
          </p>
        </div>

        <Card className="p-6 shadow-elegant">
          <Tabs defaultValue="password" className="w-full">
            <TabsList className="grid w-full grid-cols-2 mb-4">
              <TabsTrigger value="password" className="gap-2">
                <KeyRound className="h-3.5 w-3.5" />
                كلمة المرور
              </TabsTrigger>
              <TabsTrigger value="magic" className="gap-2">
                <Mail className="h-3.5 w-3.5" />
                رابط بالبريد
              </TabsTrigger>
            </TabsList>

            {/* PASSWORD TAB */}
            <TabsContent value="password" className="space-y-4">
              <div className="flex rounded-lg border bg-muted/40 p-1 text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setMode("signin")}
                  className={`flex-1 rounded-md py-1.5 transition ${
                    mode === "signin"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  تسجيل الدخول
                </button>
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className={`flex-1 rounded-md py-1.5 transition ${
                    mode === "signup"
                      ? "bg-background shadow-sm text-foreground"
                      : "text-muted-foreground"
                  }`}
                >
                  إنشاء حساب
                </button>
              </div>

              <form onSubmit={handlePasswordSubmit} className="space-y-3">
                {mode === "signup" && (
                  <div className="space-y-2">
                    <Label htmlFor="full_name">الاسم الكامل</Label>
                    <Input
                      id="full_name"
                      name="full_name"
                      type="text"
                      autoComplete="name"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="محمد العلوي"
                    />
                  </div>
                )}

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

                <div className="space-y-2">
                  <Label htmlFor="password">كلمة المرور</Label>
                  <Input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete={
                      mode === "signup" ? "new-password" : "current-password"
                    }
                    required
                    dir="ltr"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                  />
                  {mode === "signup" && (
                    <p className="text-[11px] text-muted-foreground">
                      8 أحرف على الأقل
                    </p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  {mode === "signup" ? "إنشاء حساب ودخول" : "تسجيل الدخول"}
                </Button>
              </form>
            </TabsContent>

            {/* MAGIC LINK TAB */}
            <TabsContent value="magic">
              {magicSent ? (
                <div className="space-y-4 text-center">
                  <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
                    <Mail className="h-7 w-7 text-primary" />
                  </div>
                  <div className="space-y-1">
                    <p className="font-semibold">تحقق من بريدك الإلكتروني</p>
                    <p className="text-sm text-muted-foreground">
                      أرسلنا رابط دخول إلى{" "}
                      <span dir="ltr" className="font-mono text-foreground">
                        {magicEmail}
                      </span>
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={() => {
                      setMagicSent(false);
                      setMagicEmail("");
                    }}
                  >
                    إرسال إلى بريد آخر
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleMagicSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="magic_email">البريد الإلكتروني</Label>
                    <Input
                      id="magic_email"
                      name="magic_email"
                      type="email"
                      autoComplete="email"
                      required
                      dir="ltr"
                      value={magicEmail}
                      onChange={(e) => setMagicEmail(e.target.value)}
                      placeholder="you@example.com"
                    />
                  </div>
                  <Button
                    type="submit"
                    className="w-full"
                    disabled={magicSubmitting}
                  >
                    {magicSubmitting && (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    )}
                    إرسال رابط الدخول
                  </Button>
                  <p className="text-center text-[11px] text-muted-foreground">
                    سنرسل لك رابطاً آمناً لتسجيل الدخول بدون كلمة مرور.
                  </p>
                </form>
              )}
            </TabsContent>
          </Tabs>
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
