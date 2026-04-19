import { useEffect, useState } from "react";
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
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/pricing";
import { PricingTierSelect } from "@/components/admin/PricingTierSelect";
import { useAuth } from "@/hooks/useAuth";

interface DistributorEditable {
  id: string;
  full_name: string;
  phone: string | null;
  territory_id: string | null;
  partner_type?: PartnerType | null;
}

interface Props {
  distributor: DistributorEditable | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditDistributorDialog({ distributor, onClose, onSaved }: Props) {
  const { companyId } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    territory_id: "",
    partner_type: "distributor" as PartnerType,
    pricing_tier_id: "" as string,
    custom_discount: "" as string, // empty string means "use base"
  });
  const [busy, setBusy] = useState(false);
  const [loadingPricing, setLoadingPricing] = useState(false);

  useEffect(() => {
    if (!distributor) return;
    setForm((f) => ({
      ...f,
      full_name: distributor.full_name ?? "",
      phone: distributor.phone ?? "",
      territory_id: distributor.territory_id ?? "",
      partner_type: (distributor.partner_type as PartnerType) ?? "distributor",
      pricing_tier_id: "",
      custom_discount: "",
    }));
    if (!companyId) return;
    setLoadingPricing(true);
    supabase
      .from("company_distributor_pricing")
      .select("pricing_tier_id, custom_discount_percent")
      .eq("company_id", companyId)
      .eq("distributor_id", distributor.id)
      .maybeSingle()
      .then(({ data }) => {
        setForm((f) => ({
          ...f,
          pricing_tier_id: data?.pricing_tier_id ?? "",
          custom_discount:
            data?.custom_discount_percent != null
              ? String(data.custom_discount_percent)
              : "",
        }));
        setLoadingPricing(false);
      });
  }, [distributor, companyId]);

  const save = async () => {
    if (!distributor) return;
    if (form.full_name.trim().length < 2) return toast.error("الاسم قصير جداً");
    if (form.phone.trim().length < 6) return toast.error("رقم هاتف غير صالح");
    if (!form.territory_id) return toast.error("المنطقة مطلوبة");
    if (!companyId) return toast.error("الشركة غير محددة");

    let customNum: number | null = null;
    if (form.custom_discount.trim() !== "") {
      const n = Number(form.custom_discount);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        return toast.error("نسبة الخصم المخصصة يجب أن تكون بين 0 و 100");
      customNum = n;
    }

    setBusy(true);

    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        territory_id: form.territory_id,
        partner_type: form.partner_type,
      })
      .eq("id", distributor.id);
    if (profErr) {
      setBusy(false);
      return toast.error(profErr.message);
    }

    if (form.pricing_tier_id) {
      const { error: cdpErr } = await supabase
        .from("company_distributor_pricing")
        .upsert(
          {
            company_id: companyId,
            distributor_id: distributor.id,
            pricing_tier_id: form.pricing_tier_id,
            custom_discount_percent: customNum,
          },
          { onConflict: "company_id,distributor_id" },
        );
      if (cdpErr) {
        setBusy(false);
        return toast.error(cdpErr.message);
      }
    } else {
      // No tier selected → remove any existing assignment
      const { error: delErr } = await supabase
        .from("company_distributor_pricing")
        .delete()
        .eq("company_id", companyId)
        .eq("distributor_id", distributor.id);
      if (delErr) {
        setBusy(false);
        return toast.error(delErr.message);
      }
    }

    setBusy(false);
    toast.success("تم التحديث");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!distributor} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl">
        <DialogHeader>
          <DialogTitle>تعديل بيانات الموزع</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>الاسم الكامل</Label>
            <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} inputMode="tel" />
            </div>
            <div className="space-y-1.5">
              <Label>المدينة / المنطقة</Label>
              <TerritorySelect
                value={form.territory_id || null}
                onChange={(id) => setForm({ ...form, territory_id: id })}
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>نوع الشريك</Label>
            <Select
              value={form.partner_type}
              onValueChange={(v) => setForm({ ...form, partner_type: v as PartnerType })}
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
          </div>
          <div className="space-y-1.5">
            <Label>فئة التسعير</Label>
            <PricingTierSelect
              value={form.pricing_tier_id || null}
              onChange={(id) => setForm({ ...form, pricing_tier_id: id ?? "" })}
            />
          </div>
          <div className="space-y-1.5">
            <Label>نسبة خصم مخصصة (%) — اختيارية</Label>
            <Input
              type="number"
              min={0}
              max={100}
              step="0.01"
              placeholder="اتركه فارغاً لاستخدام نسبة الفئة"
              value={form.custom_discount}
              disabled={loadingPricing || !form.pricing_tier_id}
              onChange={(e) => setForm({ ...form, custom_discount: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              عند تعبئتها، تستخدم هذه النسبة بدلاً من نسبة الفئة الأساسية لهذا الموزع فقط.
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>إلغاء</Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
