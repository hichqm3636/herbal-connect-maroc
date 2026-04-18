import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Loader2, Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { createCompanyWithAdmin } from "@/server/companies";
import { toast } from "sonner";


export const Route = createFileRoute("/_app/super-admin/companies")({
  component: CompaniesPage,
});

interface CompanyRow {
  id: string;
  name: string;
  display_name: string;
  brand_color: string;
  logo_url: string | null;
  created_at: string;
}

function CompaniesPage() {
  const [rows, setRows] = useState<CompanyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("companies")
      .select("id, name, display_name, brand_color, logo_url, created_at")
      .order("created_at", { ascending: false });
    if (error) toast.error(error.message);
    setRows((data as CompanyRow[]) ?? []);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <div className="mx-auto max-w-5xl space-y-6" dir="rtl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Building2 className="h-6 w-6 text-primary" />
            الشركات
          </h1>
          <p className="text-sm text-muted-foreground">إنشاء وإدارة الشركات على المنصة</p>
        </div>
        <Button onClick={() => setOpen(true)} className="gap-2">
          <Plus className="h-4 w-4" />
          شركة جديدة
        </Button>
      </div>

      <Card className="shadow-soft">
        <CardHeader>
          <CardTitle>قائمة الشركات</CardTitle>
          <CardDescription>{rows.length} شركة</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : rows.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">لا توجد شركات بعد.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((c) => (
                <div
                  key={c.id}
                  className="flex items-center gap-3 rounded-lg border bg-card p-3"
                >
                  <div
                    className="h-10 w-10 rounded-lg flex items-center justify-center text-white text-sm font-bold overflow-hidden shrink-0"
                    style={{ backgroundColor: c.brand_color }}
                  >
                    {c.logo_url ? (
                      <img src={c.logo_url} alt="" className="h-full w-full object-cover" />
                    ) : (
                      c.display_name?.[0] || c.name[0]
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{c.display_name || c.name}</p>
                    <p className="text-xs text-muted-foreground truncate" dir="ltr">{c.name}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <CreateCompanyDialog open={open} onOpenChange={setOpen} onCreated={load} />
    </div>
  );
}

function CreateCompanyDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [brandColor, setBrandColor] = useState("#16a34a");
  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [adminFullName, setAdminFullName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setName("");
    setDisplayName("");
    setBrandColor("#16a34a");
    setAdminEmail("");
    setAdminPassword("");
    setAdminFullName("");
  };

  const submit = async () => {
    const slug = name.trim().toLowerCase().replace(/\s+/g, "-");
    if (slug.length < 2) return toast.error("اسم الشركة قصير جداً");
    const email = adminEmail.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return toast.error("بريد المسؤول غير صالح");
    if (adminPassword.length < 8 || !/[A-Za-z]/.test(adminPassword) || !/[0-9]/.test(adminPassword))
      return toast.error("كلمة المرور: 8 أحرف على الأقل مع حروف وأرقام");
    if (adminFullName.trim().length < 2) return toast.error("اسم المسؤول مطلوب");

    setSubmitting(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) throw new Error("الجلسة منتهية، يرجى تسجيل الدخول من جديد");

      const result = await createCompanyWithAdmin({
        data: {
          name: slug,
          display_name: displayName.trim() || name.trim(),
          brand_color: brandColor,
          admin_email: email,
          admin_password: adminPassword,
          admin_full_name: adminFullName.trim(),
        },
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      toast.success(`تم إنشاء الشركة. معرّف: ${result.company_id}`);
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "تعذر إنشاء الشركة");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>إنشاء شركة جديدة</DialogTitle>
          <DialogDescription>
            ستُنشأ الشركة مع حساب مسؤول (Admin) مفعّل مباشرةً ويستطيع تسجيل الدخول فوراً.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-2">
            <Label>الاسم الداخلي (slug-friendly)</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="acme-pharma" dir="ltr" />
          </div>
          <div className="space-y-2">
            <Label>الاسم المعروض</Label>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} placeholder="Acme Pharma" />
          </div>
          <div className="space-y-2">
            <Label>لون العلامة التجارية</Label>
            <div className="flex items-center gap-2">
              <Input
                type="color"
                value={brandColor}
                onChange={(e) => setBrandColor(e.target.value)}
                className="h-10 w-16 p-1"
              />
              <Input value={brandColor} onChange={(e) => setBrandColor(e.target.value)} dir="ltr" />
            </div>
          </div>
          <div className="border-t pt-3 space-y-3">
            <p className="text-sm font-semibold">حساب المسؤول</p>
            <div className="space-y-2">
              <Label>الاسم الكامل</Label>
              <Input value={adminFullName} onChange={(e) => setAdminFullName(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>البريد الإلكتروني</Label>
              <Input
                type="email"
                value={adminEmail}
                onChange={(e) => setAdminEmail(e.target.value)}
                dir="ltr"
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label>كلمة المرور المؤقتة</Label>
              <Input
                type="password"
                value={adminPassword}
                onChange={(e) => setAdminPassword(e.target.value)}
                dir="ltr"
                autoComplete="new-password"
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء الشركة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
