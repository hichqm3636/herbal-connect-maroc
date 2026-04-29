import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Loader2, ShieldCheck, Lock, KeyRound } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { verifySuperAdminSecret } from "@/server/superAdmin.functions";
import { markSuperAdminGatePassed, clearSuperAdminGate } from "@/lib/superAdminGate";
import { toast } from "sonner";

export const Route = createFileRoute("/control")({
  component: ControlPage,
  head: () => ({
    meta: [
      { title: "Nexora Control" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
});

const emailSchema = z.string().trim().email({ message: "بريد غير صالح" }).max(255);
const passwordSchema = z.string().min(8, { message: "كلمة المرور قصيرة" }).max(128);
const codeSchema = z.string().min(1, { message: "أدخل الرمز" }).max(128);

type Step = "credentials" | "secret";

function ControlPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<Step>("credentials");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ensure no stale gate flag persists on this page
  useEffect(() => {
    clearSuperAdminGate();
  }, []);

  const handleCredentials = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const emailParsed = emailSchema.safeParse(email);
    if (!emailParsed.success) {
      setError(emailParsed.error.issues[0].message);
      return;
    }
    const passParsed = passwordSchema.safeParse(password);
    if (!passParsed.success) {
      setError(passParsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    const { data, error: signInError } = await supabase.auth.signInWithPassword({
      email: emailParsed.data,
      password: passParsed.data,
    });
    setSubmitting(false);

    if (signInError || !data.session) {
      setError("بيانات الدخول غير صحيحة.");
      return;
    }

    // Verify super_admin role server-side BEFORE asking for the secret code,
    // so non-super-admins can't even see the secret step.
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", data.user!.id);

    const isSuper = (roles ?? []).some((r) => r.role === "super_admin");
    if (!isSuper) {
      await supabase.auth.signOut();
      setError("غير مصرح بالدخول.");
      return;
    }

    setStep("secret");
  };

  const handleSecret = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const codeParsed = codeSchema.safeParse(code);
    if (!codeParsed.success) {
      setError(codeParsed.error.issues[0].message);
      return;
    }

    setSubmitting(true);
    try {
      const result = await verifySuperAdminSecret({ data: { code: codeParsed.data } });
      if (!result.ok) {
        setError(result.error);
        setSubmitting(false);
        return;
      }
      markSuperAdminGatePassed();
      toast.success("تم التحقق بنجاح");
      navigate({ to: "/super-admin" });
    } catch {
      setError("تعذّر التحقق. حاول مرة أخرى.");
      setSubmitting(false);
    }
  };

  const handleBack = async () => {
    await supabase.auth.signOut();
    setStep("credentials");
    setCode("");
    setPassword("");
    setError(null);
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950"
      dir="rtl"
    >
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center text-center mb-6">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/15 ring-1 ring-primary/30 shadow-glow">
            <ShieldCheck className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold text-white">Nexora Control</h1>
          <p className="mt-1 text-xs text-slate-400">Platform Administration · Restricted Access</p>
        </div>

        <Card className="p-6 shadow-elegant border-slate-800 bg-slate-900/80 backdrop-blur">
          {step === "credentials" ? (
            <form onSubmit={handleCredentials} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-200">
                <Lock className="h-4 w-4" />
                <h2 className="text-sm font-bold">المرحلة 1 — بيانات الدخول</h2>
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-300">البريد الإلكتروني</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  dir="ltr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-300">كلمة المرور</Label>
                <Input
                  id="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  dir="ltr"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white"
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                دخول
              </Button>
            </form>
          ) : (
            <form onSubmit={handleSecret} className="space-y-4">
              <div className="flex items-center gap-2 text-slate-200">
                <KeyRound className="h-4 w-4" />
                <h2 className="text-sm font-bold">المرحلة 2 — الرمز السري</h2>
              </div>
              <p className="text-xs text-slate-400">
                أدخل الرمز السري للوصول إلى لوحة التحكم.
              </p>

              <div className="space-y-2">
                <Label htmlFor="code" className="text-slate-300">Secret Code</Label>
                <Input
                  id="code"
                  type="password"
                  autoComplete="one-time-code"
                  required
                  dir="ltr"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="bg-slate-950 border-slate-700 text-white tracking-widest"
                  autoFocus
                />
              </div>

              {error && (
                <p className="text-xs text-destructive bg-destructive/10 border border-destructive/30 rounded-md p-2">
                  {error}
                </p>
              )}

              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                تأكيد
              </Button>
              <Button
                type="button"
                variant="ghost"
                className="w-full text-slate-400 hover:text-white hover:bg-slate-800"
                onClick={handleBack}
                disabled={submitting}
              >
                رجوع
              </Button>
            </form>
          )}
        </Card>

        <p className="mt-4 text-center text-[11px] text-slate-500">
          Unauthorized access is prohibited and logged.
        </p>
      </div>
    </div>
  );
}
