import { useEffect, useState } from "react";
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
import { PARTNER_TYPE_LABELS, type PartnerType } from "@/lib/pricing";
import { PricingTierSelect } from "@/components/admin/PricingTierSelect";
import { useAuth } from "@/hooks/useAuth";

/** Roles a company admin can grant to a client. */
const CLIENT_ROLES = [
  { value: "buyer", label: "مشتري" },
  { value: "seller", label: "بائع" },
  { value: "sales_agent", label: "مندوب مبيعات" },
] as const;
type ClientRole = (typeof CLIENT_ROLES)[number]["value"];

interface ClientEditable {
  id: string;
  full_name: string;
  phone: string | null;
  territory_id: string | null;
  /** account_type from profiles (was partner_type). Optional for back-compat. */
  account_type?: PartnerType | null;
  partner_type?: PartnerType | null;
}

interface Props {
  client: ClientEditable | null;
  onClose: () => void;
  onSaved: () => void;
}

export function EditClientDialog({ client, onClose, onSaved }: Props) {
  const { companyId } = useAuth();
  const [form, setForm] = useState({
    full_name: "",
    phone: "",
    territory_id: "",
    account_type: "distributor" as PartnerType,
    pricing_tier_id: "" as string,
    custom_discount: "" as string,
  });
  const [selectedRoles, setSelectedRoles] = useState<Set<ClientRole>>(new Set(["buyer"]));
  const [busy, setBusy] = useState(false);
  const [loadingMeta, setLoadingMeta] = useState(false);

  useEffect(() => {
    if (!client || !companyId) return;
    const initialAccountType =
      (client.account_type as PartnerType | null) ??
      (client.partner_type as PartnerType | null) ??
      "distributor";
    setForm({
      full_name: client.full_name ?? "",
      phone: client.phone ?? "",
      territory_id: client.territory_id ?? "",
      account_type: initialAccountType,
      pricing_tier_id: "",
      custom_discount: "",
    });
    setSelectedRoles(new Set(["buyer"]));
    setLoadingMeta(true);
    Promise.all([
      supabase
        .from("company_distributor_pricing")
        .select("pricing_tier_id, custom_discount_percent")
        .eq("company_id", companyId)
        .eq("distributor_id", client.id)
        .maybeSingle(),
      supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", client.id)
        .eq("company_id", companyId),
    ]).then(([{ data: cdp }, { data: roleRows }]) => {
      setForm((f) => ({
        ...f,
        pricing_tier_id: cdp?.pricing_tier_id ?? "",
        custom_discount:
          cdp?.custom_discount_percent != null ? String(cdp.custom_discount_percent) : "",
      }));
      const platformRoles = (roleRows ?? [])
        .map((r) => r.role as string)
        .filter((r): r is ClientRole => CLIENT_ROLES.some((cr) => cr.value === r));
      setSelectedRoles(platformRoles.length > 0 ? new Set(platformRoles) : new Set(["buyer"]));
      setLoadingMeta(false);
    });
  }, [client, companyId]);

  const toggleRole = (role: ClientRole) => {
    setSelectedRoles((prev) => {
      const next = new Set(prev);
      if (next.has(role)) next.delete(role);
      else next.add(role);
      return next;
    });
  };

  const save = async () => {
    if (!client) return;
    if (form.full_name.trim().length < 2) return toast.error("الاسم قصير جداً");
    if (form.phone.trim().length < 6) return toast.error("رقم هاتف غير صالح");
    if (!form.territory_id) return toast.error("المنطقة مطلوبة");
    if (!companyId) return toast.error("الشركة غير محددة");
    if (selectedRoles.size === 0) return toast.error("اختر دوراً واحداً على الأقل");

    let customNum: number | null = null;
    if (form.custom_discount.trim() !== "") {
      const n = Number(form.custom_discount);
      if (!Number.isFinite(n) || n < 0 || n > 100)
        return toast.error("نسبة الخصم المخصصة يجب أن تكون بين 0 و 100");
      customNum = n;
    }

    setBusy(true);

    // 1. Profile (account_type lives here; cast as the generated enum until types regen)
    const { error: profErr } = await supabase
      .from("profiles")
      .update({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        territory_id: form.territory_id,
        account_type: form.account_type,
        // legacy alias still accepted by generated types until next regen
        partner_type: form.account_type,
      } as never)
      .eq("id", client.id);
    if (profErr) {
      setBusy(false);
      return toast.error(profErr.message);
    }

    // 2. Pricing
    if (form.pricing_tier_id) {
      const { error: cdpErr } = await supabase.from("company_distributor_pricing").upsert(
        {
          company_id: companyId,
          distributor_id: client.id,
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
      await supabase
        .from("company_distributor_pricing")
        .delete()
        .eq("company_id", companyId)
        .eq("distributor_id", client.id);
    }

    // 3. Roles — diff against existing client roles in this company
    const { data: currentRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", client.id)
      .eq("company_id", companyId);
    const current = new Set(
      (currentRows ?? [])
        .map((r) => r.role as string)
        .filter((r): r is ClientRole => CLIENT_ROLES.some((cr) => cr.value === r)),
    );
    const toAdd = [...selectedRoles].filter((r) => !current.has(r));
    const toRemove = [...current].filter((r) => !selectedRoles.has(r));

    if (toAdd.length > 0) {
      const { error } = await supabase.from("user_roles").insert(
        toAdd.map((role) => ({
          user_id: client.id,
          role: role as never, // enum cast pending types regen
          company_id: companyId,
        })),
      );
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
    }
    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("user_roles")
        .delete()
        .eq("user_id", client.id)
        .eq("company_id", companyId)
        .in("role", toRemove as never[]);
      if (error) {
        setBusy(false);
        return toast.error(error.message);
      }
    }

    setBusy(false);
    toast.success("تم التحديث");
    onSaved();
    onClose();
  };

  return (
    <Dialog open={!!client} onOpenChange={(o) => !o && onClose()}>
      <DialogContent dir="rtl" className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>تعديل بيانات العميل</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>الاسم الكامل</Label>
            <Input
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الهاتف</Label>
              <Input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                inputMode="tel"
              />
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
            <Label>نوع الحساب</Label>
            <Select
              value={form.account_type}
              onValueChange={(v) => setForm({ ...form, account_type: v as PartnerType })}
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
            <p className="text-xs text-muted-foreground">يحدد التسعير والصلاحيات الأساسية.</p>
          </div>
          <div className="space-y-2">
            <Label>الأدوار في المنصة</Label>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {CLIENT_ROLES.map((r) => {
                const checked = selectedRoles.has(r.value);
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
                      disabled={loadingMeta}
                    />
                    <span className="text-sm">{r.label}</span>
                  </label>
                );
              })}
            </div>
            <p className="text-xs text-muted-foreground">
              يمكن منح الدورين معاً (مشتري + بائع).
            </p>
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
              disabled={loadingMeta || !form.pricing_tier_id}
              onChange={(e) => setForm({ ...form, custom_discount: e.target.value })}
            />
            <p className="text-xs text-muted-foreground">
              عند تعبئتها، تستخدم هذه النسبة بدلاً من نسبة الفئة الأساسية لهذا العميل فقط.
            </p>
          </div>
        </div>
        <DialogFooter className="flex-col sm:flex-row gap-2">
          <Button variant="outline" onClick={onClose} disabled={busy}>
            إلغاء
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            حفظ
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
