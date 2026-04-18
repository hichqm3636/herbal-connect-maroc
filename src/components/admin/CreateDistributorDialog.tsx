import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TerritorySelect } from "@/components/admin/TerritorySelect";
import { PricingTierSelect } from "@/components/admin/PricingTierSelect";
import { useAuth } from "@/hooks/useAuth";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

const empty = {
  fullName: "",
  phone: "",
  territoryId: "",
  pricingTierId: "" as string,
  email: "",
  password: "",
  initialPoints: 0,
};

export function CreateDistributorDialog({ open, onOpenChange, onCreated }: Props) {
  const { companyId } = useAuth();
  const [form, setForm] = useState(empty);
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = "الاسم قصير جداً";
    if (form.phone.trim().length < 6) e.phone = "رقم الهاتف غير صالح";
    if (!form.territoryId) e.territoryId = "المنطقة مطلوبة";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "بريد إلكتروني غير صالح";
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      e.password = "8 أحرف على الأقل مع حروف وأرقام";
    if (form.initialPoints < 0) e.initialPoints = "قيمة غير صالحة";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await supabase.auth.signOut();
        toast.error("انتهت الجلسة، يرجى تسجيل الدخول من جديد");
        window.location.href = "/login";
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: { action: "create", companyId, ...form },
      });
      if (error) {
        let msg = error.message;
        let status: number | undefined;
        try {
          const ctx = (error as { context?: Response }).context;
          if (ctx) {
            status = ctx.status;
            const j = await ctx.clone().json();
            if (j?.error) msg = j.error;
          }
        } catch { /* ignore */ }
        if (status === 401) {
          await supabase.auth.signOut();
          toast.error("انتهت الجلسة، يرجى تسجيل الدخول من جديد");
          window.location.href = "/login";
          return;
        }
        throw new Error(msg);
      }
      if (data?.error) throw new Error(data.error);
      toast.success("تم إنشاء حساب الموزع بنجاح");
      setForm(empty);
      setErrors({});
      onOpenChange(false);
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإنشاء");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setForm(empty); setErrors({}); } }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إنشاء حساب موزع جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="الاسم الكامل" error={errors.fullName}>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الهاتف" error={errors.phone}>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel"
              />
            </Field>
            <Field label="المدينة / المنطقة" error={errors.territoryId}>
              <TerritorySelect
                value={form.territoryId || null}
                onChange={(id) => setForm({ ...form, territoryId: id })}
              />
            </Field>
          </div>
          <Field label="فئة التسعير">
            <PricingTierSelect
              value={form.pricingTierId || null}
              onChange={(id) => setForm({ ...form, pricingTierId: id ?? "" })}
            />
          </Field>
          <Field label="البريد الإلكتروني" error={errors.email}>
            <Input
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              inputMode="email"
              dir="ltr"
            />
          </Field>
          <Field label="كلمة المرور (8+ أحرف، حروف وأرقام)" error={errors.password}>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="شارك كلمة المرور مع الموزع"
              dir="ltr"
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الدور">
              <Input value="موزع" disabled />
            </Field>
            <Field label="نقاط ولاء ابتدائية" error={errors.initialPoints}>
              <Input
                type="number"
                min={0}
                value={form.initialPoints}
                onChange={(e) =>
                  setForm({ ...form, initialPoints: Math.max(0, Number(e.target.value) || 0) })
                }
              />
            </Field>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            إنشاء الحساب
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
