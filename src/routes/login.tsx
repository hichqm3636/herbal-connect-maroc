import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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

const signUpSchema = z.object({
  email: z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255),
  password: z
    .string()
    .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
    .max(100)
    .regex(/[A-Za-z]/, { message: "يجب أن تحتوي كلمة المرور على حرف" })
    .regex(/[0-9]/, { message: "يجب أن تحتوي كلمة المرور على رقم" }),
  fullName: z.string().trim().min(2, { message: "الاسم مطلوب" }).max(100),
  phone: z.string().trim().min(6, { message: "رقم الهاتف مطلوب" }).max(20),
  city: z.string().trim().min(2, { message: "المدينة مطلوبة" }).max(80),
});

function LoginPage() {
  const navigate = useNavigate();
  const { session, loading } = useAuth();
  const [tab, setTab] = useState("signin");
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
      toast.error("بيانات الدخول غير صحيحة");
      return;
    }
    toast.success("مرحباً بعودتك");
    navigate({ to: "/dashboard" });
  };

  const handleSignUp = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const parsed = signUpSchema.safeParse({
      email: form.get("email"),
      password: form.get("password"),
      fullName: form.get("fullName"),
      phone: form.get("phone"),
      city: form.get("city"),
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    setSubmitting(true);
    const redirectUrl = `${window.location.origin}/dashboard`;
    const { error } = await supabase.auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: redirectUrl,
        data: {
          full_name: parsed.data.fullName,
          phone: parsed.data.phone,
          city: parsed.data.city,
        },
      },
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message.includes("already") ? "هذا الحساب موجود بالفعل" : "تعذر إنشاء الحساب");
      return;
    }
    toast.success("تم إنشاء الحساب بنجاح");
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
            <h1 className="text-xl font-extrabold leading-tight">هيرباليفي</h1>
            <p className="text-xs text-muted-foreground">بوابة الشركاء</p>
          </div>
        </Link>

        <Card className="p-6 shadow-elegant">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList className="grid w-full grid-cols-2 mb-6">
              <TabsTrigger value="signin">تسجيل الدخول</TabsTrigger>
              <TabsTrigger value="signup">حساب جديد</TabsTrigger>
            </TabsList>

            <TabsContent value="signin">
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
            </TabsContent>

            <TabsContent value="signup">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="fullName">الاسم الكامل</Label>
                  <Input id="fullName" name="fullName" required />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label htmlFor="phone">الهاتف</Label>
                    <Input id="phone" name="phone" type="tel" required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="city">المدينة</Label>
                    <Input id="city" name="city" required />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email-up">البريد الإلكتروني</Label>
                  <Input id="email-up" name="email" type="email" required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password-up">كلمة المرور</Label>
                  <Input id="password-up" name="password" type="password" minLength={6} required />
                </div>
                <Button type="submit" className="w-full" disabled={submitting}>
                  {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                  إنشاء حساب
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </Card>

        <p className="mt-4 text-center text-xs text-muted-foreground">
          البوابة الرسمية للموزعين بالمغرب • العملة بالدرهم المغربي
        </p>
      </div>
    </div>
  );
}
