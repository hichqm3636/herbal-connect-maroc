import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { z } from "zod";
import { Leaf, Loader2, ArrowLeft, CheckCircle2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useTenant } from "@/hooks/useTenant";
import { toast } from "sonner";

export const Route = createFileRoute("/signup")({
  component: SignupPage,
  head: () => ({
    meta: [
      { title: "إنشاء بوابة شركة جديدة — Nexora" },
      {
        name: "description",
        content:
          "سجّل شركتك على Nexora واحصل فوراً على بوابة موزعين خاصة بك على نطاق فرعي مثل company.nexora.app.",
      },
    ],
  }),
});

const RESERVED = new Set([
  "app",
  "www",
  "api",
  "admin",
  "super",
  "nexora",
  "root",
  "platform",
  "dashboard",
  "login",
  "signup",
]);

const schema = z.object({
  companyName: z
    .string()
    .trim()
    .min(2, { message: "اسم الشركة قصير جداً" })
    .max(80, { message: "اسم الشركة طويل جداً" }),
  slug: z
    .string()
    .trim()
    .min(2, { message: "النطاق الفرعي قصير جداً" })
    .max(40, { message: "النطاق الفرعي طويل جداً" })
    .regex(/^[a-z0-9-]+$/, { message: "النطاق يقبل حروفاً صغيرة وأرقاماً وشرطات فقط" }),
  adminFullName: z
    .string()
    .trim()
    .min(2, { message: "اسم المسؤول مطلوب" })
    .max(80),
  adminEmail: z.string().trim().email({ message: "بريد إلكتروني غير صالح" }).max(255),
  adminPassword: z
    .string()
    .min(8, { message: "كلمة المرور يجب أن تكون 8 أحرف على الأقل" })
    .max(100)
    .regex(/[A-Za-z]/, { message: "كلمة المرور يجب أن تحتوي على حروف" })
    .regex(/[0-9]/, { message: "كلمة المرور يجب أن تحتوي على أرقام" }),
});

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

function buildPortalUrl(slug: string): string {
  if (typeof window === "undefined") return `https://${slug}.nexora.app`;
  const host = window.location.hostname.toLowerCase();
  if (host === "nexora.app" || host.endsWith(".nexora.app")) {
    return `https://${slug}.nexora.app`;
  }
  // Lovable preview / localhost: use ?company= override
  const url = new URL(window.location.origin + "/dashboard");
  url.searchParams.set("company", slug);
  return url.toString();
}

function SignupPage() {
  const tenant = useTenant();
  const navigate = useNavigate();
  const [companyName, setCompanyName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugTouched, setSlugTouched] = useState(false);
  const [adminFullName, setAdminFullName] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<{ slug: string; portalUrl: string } | null>(null);

  // If somebody opens /signup on a tenant subdomain, send them to the marketing site.
  useEffect(() => {
    if (!tenant.loading && tenant.kind === "tenant" && typeof window !== "undefined") {
      window.location.assign("https://nexora.app/signup");
    }
  }, [tenant.loading, tenant.kind]);

  // Auto-generate slug from company name unless the user has typed in the slug field.
  useEffect(() => {
    if (!slugTouched) setSlug(slugify(companyName));
  }, [companyName, slugTouched]);

  const portalPreview = useMemo(() => (slug ? `${slug}.nexora.app` : "company.nexora.app"), [slug]);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const parsed = schema.safeParse({
      companyName,
      slug,
      adminFullName,
      adminEmail,
      adminPassword,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }
    if (RESERVED.has(parsed.data.slug)) {
      toast.error("هذا النطاق محجوز، اختر اسماً آخر");
      return;
    }

    setSubmitting(true);
    try {
      const { data, error } = await supabase.rpc("public_signup_company", {
        _company_name: parsed.data.companyName,
        _company_slug: parsed.data.slug,
        _admin_full_name: parsed.data.adminFullName,
        _admin_email: parsed.data.adminEmail,
        _admin_password: parsed.data.adminPassword,
        _brand_color: "#16a34a",
      });

      if (error) {
        const msg = error.message || "تعذر إنشاء الشركة";
        toast.error(msg);
        return;
      }

      const created = data as { slug?: string; company_id?: string } | null;
      const newSlug = created?.slug ?? parsed.data.slug;

      // Auto sign-in the new admin
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: parsed.data.adminEmail.trim().toLowerCase(),
        password: parsed.data.adminPassword,
      });

      const portalUrl = buildPortalUrl(newSlug);

      if (signInError) {
        // Account created, but auto-login failed — still show success card.
        toast.success("تم إنشاء بوابتك! سجّل الدخول من بوابتك الجديدة.");
        setSuccess({ slug: newSlug, portalUrl });
        return;
      }

      toast.success(`تم إنشاء بوابة ${parsed.data.companyName}! جاري التوجيه…`);
      setSuccess({ slug: newSlug, portalUrl });

      // Small delay so the user sees the success state, then redirect.
      setTimeout(() => {
        if (portalUrl.startsWith("http")) {
          window.location.assign(portalUrl);
        } else {
          navigate({ to: portalUrl });
        }
      }, 1200);
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div
        className="flex min-h-screen items-center justify-center bg-gradient-soft p-4"
        dir="rtl"
      >
        <Card className="w-full max-w-lg p-8 text-center shadow-elegant">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">تم إنشاء بوابتك!</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            بوابة شركتك جاهزة على:
          </p>
          <p className="mt-2 font-mono text-base font-semibold text-primary" dir="ltr">
            {success.portalUrl.replace(/^https?:\/\//, "")}
          </p>
          <Button asChild className="mt-6 w-full">
            <a href={success.portalUrl}>الانتقال إلى البوابة</a>
          </Button>
          <p className="mt-6 text-[11px] text-muted-foreground">Powered by Nexora</p>
        </Card>
      </div>
    );
  }

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-gradient-soft p-4"
      dir="rtl"
    >
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-primary shadow-glow">
            <Leaf className="h-7 w-7 text-primary-foreground" />
          </div>
          <h1 className="mt-4 text-2xl font-extrabold">سجّل شركتك على Nexora</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            احصل على بوابة موزعين خاصة بك خلال أقل من دقيقة
          </p>
        </div>

        <Card className="p-6 shadow-elegant">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="companyName">اسم الشركة</Label>
              <Input
                id="companyName"
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Herbalife Morocco"
                required
                maxLength={80}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">النطاق الفرعي</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="slug"
                  value={slug}
                  onChange={(e) => {
                    setSlugTouched(true);
                    setSlug(slugify(e.target.value));
                  }}
                  placeholder="herbalife"
                  dir="ltr"
                  required
                  maxLength={40}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground" dir="ltr">
                  .nexora.app
                </span>
              </div>
              <p className="text-xs text-muted-foreground" dir="ltr">
                {portalPreview}
              </p>
            </div>

            <div className="border-t pt-4 space-y-4">
              <p className="text-sm font-semibold">حساب المسؤول الأول</p>

              <div className="space-y-2">
                <Label htmlFor="adminFullName">الاسم الكامل</Label>
                <Input
                  id="adminFullName"
                  value={adminFullName}
                  onChange={(e) => setAdminFullName(e.target.value)}
                  required
                  maxLength={80}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminEmail">البريد الإلكتروني</Label>
                <Input
                  id="adminEmail"
                  type="email"
                  value={adminEmail}
                  onChange={(e) => setAdminEmail(e.target.value)}
                  dir="ltr"
                  autoComplete="email"
                  required
                  maxLength={255}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="adminPassword">كلمة المرور</Label>
                <Input
                  id="adminPassword"
                  type="password"
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  dir="ltr"
                  autoComplete="new-password"
                  required
                  minLength={8}
                  maxLength={100}
                />
                <p className="text-[11px] text-muted-foreground">
                  8 أحرف على الأقل، تحتوي على حروف وأرقام.
                </p>
              </div>
            </div>

            <Button type="submit" className="w-full" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              إنشاء بوابتي
            </Button>
          </form>
        </Card>

        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <Link to="/" className="inline-flex items-center gap-1 hover:text-foreground">
            <ArrowLeft className="h-3 w-3" />
            العودة إلى Nexora
          </Link>
          <span>Powered by Nexora</span>
        </div>
      </div>
    </div>
  );
}
