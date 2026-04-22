import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { TerritorySelect } from "@/components/admin/TerritorySelect";
import { PricingTierSelect } from "@/components/admin/PricingTierSelect";
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { formatPhoneMA } from "@/utils/whatsapp";
import { DistributorCredentialsDialog } from "@/components/admin/DistributorCredentialsDialog";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}

const CLIENT_ROLES = [
  { value: "buyer", label: "مشتري" },
  { value: "seller", label: "بائع" },
  { value: "sales_agent", label: "مندوب مبيعات" },
] as const;
type ClientRole = (typeof CLIENT_ROLES)[number]["value"];

const empty = {
  fullName: "",
  phone: "",
  territoryId: "",
  accountType: "distributor" as PartnerType,
  pricingTierId: "" as string,
  customDiscount: "" as string,
  email: "",
  password: "",
  initialPoints: 0,
};

export function CreateDistributorDialog({ open, onOpenChange, onCreated }: Props) {
  const { companyId } = useAuth();
  const [form, setForm] = useState(empty);
  const [roles, setRoles] = useState<Set<ClientRole>>(new Set(["buyer"]));
  const [busy, setBusy] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [credentials, setCredentials] = useState<{
    name: string;
    phone: string;
    password: string;
  } | null>(null);

  const toggleRole = (role: ClientRole) => {
    setRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const reset = () => {
    setForm(empty);
    setRoles(new Set(["buyer"]));
    setErrors({});
  };

  const validate = () => {
    const e: Record<string, string> = {};
    if (form.fullName.trim().length < 2) e.fullName = "الاسم قصير جداً";
    if (form.phone.trim().length < 6) e.phone = "رقم الهاتف غير صالح";
    if (!form.territoryId) e.territoryId = "المنطقة مطلوبة";
    if (!form.email.trim()) e.email = "البريد الإلكتروني مطلوب";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim()))
      e.email = "بريد إلكتروني غير صالح";
    if (form.password.length < 8 || !/[A-Za-z]/.test(form.password) || !/[0-9]/.test(form.password))
      e.password = "8 أحرف على الأقل مع حروف وأرقام";
    if (roles.size === 0) e.roles = "اختر دوراً واحداً على الأقل";
    if (form.customDiscount.trim() !== "") {
      const n = Number(form.customDiscount);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        e.customDiscount = "النسبة يجب أن تكون بين 0 و 100";
      else if (!form.pricingTierId)
        e.customDiscount = "اختر فئة تسعير أولاً";
    }
    if (form.initialPoints < 0) e.initialPoints = "قيمة غير صالحة";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const submit = async () => {
    if (!validate()) return;
    setBusy(true);
    const normalizedPhone = formatPhoneMA(form.phone);
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      if (!sessionData.session) {
        await supabase.auth.signOut();
        toast.error("انتهت الجلسة، يرجى تسجيل الدخول من جديد");
        window.location.href = "/login";
        return;
      }
      const { data, error } = await supabase.functions.invoke("create-distributor", {
        body: {
          action: "create",
          companyId,
          fullName: form.fullName,
          phone: normalizedPhone,
          territoryId: form.territoryId,
          accountType: form.accountType,
          roles: [...roles],
          pricingTierId: form.pricingTierId || null,
          customDiscountPercent:
            form.customDiscount.trim() === "" ? null : Number(form.customDiscount),
          email: form.email,
          password: form.password,
          initialPoints: form.initialPoints,
        },
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
      toast.success("تم إنشاء حساب العميل بنجاح");
      const created = {
        name: form.fullName.trim(),
        phone: normalizedPhone,
        password: form.password,
      };
      reset();
      onOpenChange(false);
      onCreated();
      // Show WhatsApp credentials dialog so admin can send login info immediately.
      setCredentials(created);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر الإنشاء");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent dir="rtl" className="max-w-lg">
        <DialogHeader>
          <DialogTitle>إنشاء حساب عميل جديد</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
          <Field label="الاسم الكامل" error={errors.fullName} required>
            <Input
              value={form.fullName}
              onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="الهاتف" error={errors.phone} required>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel"
              />
            </Field>
            <Field label="البريد الإلكتروني" error={errors.email} required>
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                inputMode="email"
                dir="ltr"
              />
            </Field>
          </div>
          <Field label="المدينة / المنطقة" error={errors.territoryId} required>
            <TerritorySelect
              value={form.territoryId || null}
              onChange={(id) => setForm({ ...form, territoryId: id })}
            />
          </Field>
          <Field label="نوع الحساب">
            <Select
              value={form.accountType}
              onValueChange={(v) => setForm({ ...form, accountType: v as PartnerType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(PARTNER_TYPE_LABELS) as PartnerType[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PARTNER_TYPE_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="الأدوار في المنصة" error={errors.roles}>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CLIENT_ROLES.map((r) => {
                const checked = roles.has(r.value);
                return (
                  <label
                    key={r.value}
                    className={`flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer transition-colors ${
                      checked ? "border-primary bg-primary/5" : "border-border"
                    }`}
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={() => toggleRole(r.value)}
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                );
              })}
            </div>
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="فئة التسعير">
              <PricingTierSelect
                value={form.pricingTierId || null}
                onChange={(id) => setForm({ ...form, pricingTierId: id ?? "" })}
              />
            </Field>
            <Field label="نسبة خصم مخصصة (%)" error={errors.customDiscount}>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                placeholder="اختياري"
                value={form.customDiscount}
                disabled={!form.pricingTierId}
                onChange={(e) => setForm({ ...form, customDiscount: e.target.value })}
              />
            </Field>
          </div>
          <Field label="كلمة المرور (8+ أحرف، حروف وأرقام)" error={errors.password} required>
            <Input
              type="text"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="شارك كلمة المرور مع العميل"
              dir="ltr"
            />
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
  required,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">
        {label}
        {required && <span className="text-destructive mr-1">*</span>}
      </Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
