import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Pencil, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  RULE_TYPE_LABELS,
  type OrderRule,
  type OrderRuleType,
} from "@/lib/orderRules";

interface PricingTierLite {
  id: string;
  name: string;
}

interface RuleManagerProps {
  /** company_id to assign new rules to. Null = global platform rule. */
  companyScope: string | null;
  title: string;
  description: string;
}

export function OrderRulesManager({ companyScope, title, description }: RuleManagerProps) {
  const [rules, setRules] = useState<OrderRule[]>([]);
  const [tiers, setTiers] = useState<PricingTierLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<OrderRule | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    let q = supabase
      .from("order_rules" as never)
      .select("*")
      .order("created_at", { ascending: false });
    if (companyScope === null) q = q.is("company_id", null);
    else q = q.eq("company_id", companyScope);
    const { data, error } = await q;
    if (error) {
      toast.error(`تعذر تحميل القواعد: ${error.message}`);
      setRules([]);
    } else {
      setRules((data as unknown as OrderRule[]) ?? []);
    }
    setLoading(false);
  };

  useEffect(() => {
    reload();
    supabase
      .from("pricing_tiers")
      .select("id, name")
      .order("base_discount_percent", { ascending: true })
      .then(({ data }) => setTiers((data as PricingTierLite[]) ?? []));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyScope]);

  const openNew = () => {
    setEditing({
      id: "",
      company_id: companyScope,
      name: "",
      rule_type: "MIN_ORDER_AMOUNT",
      min_order_amount: 1500,
      min_points: null,
      min_products: null,
      tier_id: null,
      active: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (r: OrderRule) => {
    setEditing({ ...r });
    setDialogOpen(true);
  };

  const toggleActive = async (r: OrderRule, next: boolean) => {
    const { error } = await supabase
      .from("order_rules" as never)
      .update({ active: next } as never)
      .eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRules((prev) => prev.map((x) => (x.id === r.id ? { ...x, active: next } : x)));
  };

  const handleSave = async () => {
    if (!editing) return;
    const name = editing.name.trim();
    if (!name) {
      toast.error("الاسم مطلوب");
      return;
    }
    const payload: Partial<OrderRule> = {
      company_id: companyScope,
      name,
      rule_type: editing.rule_type,
      tier_id: editing.tier_id,
      active: editing.active,
      min_order_amount:
        editing.rule_type === "MIN_ORDER_AMOUNT" ? Number(editing.min_order_amount ?? 0) : null,
      min_points:
        editing.rule_type === "MIN_POINTS" ? Number(editing.min_points ?? 0) : null,
      min_products:
        editing.rule_type === "MIN_PRODUCTS" ? Number(editing.min_products ?? 0) : null,
    };
    const value =
      editing.rule_type === "MIN_ORDER_AMOUNT"
        ? payload.min_order_amount
        : editing.rule_type === "MIN_POINTS"
          ? payload.min_points
          : payload.min_products;
    if (!value || Number(value) <= 0) {
      toast.error("يجب إدخال قيمة موجبة");
      return;
    }

    if (editing.id) {
      const { error } = await supabase
        .from("order_rules" as never)
        .update(payload as never)
        .eq("id", editing.id);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("تم تحديث القاعدة");
    } else {
      const { error } = await supabase.from("order_rules" as never).insert(payload as never);
      if (error) {
        toast.error(error.message);
        return;
      }
      toast.success("تمت إضافة القاعدة");
    }
    setDialogOpen(false);
    setEditing(null);
    reload();
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    const { error } = await supabase
      .from("order_rules" as never)
      .delete()
      .eq("id", deleteId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("تم حذف القاعدة");
    setDeleteId(null);
    reload();
  };

  const tierName = (id: string | null) =>
    id ? (tiers.find((t) => t.id === id)?.name ?? "—") : "كل الفئات";

  const valueLabel = (r: OrderRule) => {
    if (r.rule_type === "MIN_ORDER_AMOUNT") return `${r.min_order_amount} درهم`;
    if (r.rule_type === "MIN_POINTS") return `${r.min_points} نقطة`;
    return `${r.min_products} وحدة`;
  };

  return (
    <div className="space-y-4" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Button onClick={openNew}>
          <Plus className="h-4 w-4 ml-1" />
          قاعدة جديدة
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : rules.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          لا توجد قواعد بعد. أضف قاعدة لتحديد الحد الأدنى للطلب.
        </Card>
      ) : (
        <div className="space-y-2">
          {rules.map((r) => (
            <Card key={r.id} className="p-4 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold">{r.name}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {RULE_TYPE_LABELS[r.rule_type]}
                  </Badge>
                  <Badge className="text-[10px]">{valueLabel(r)}</Badge>
                  <Badge variant="outline" className="text-[10px]">
                    فئة: {tierName(r.tier_id)}
                  </Badge>
                  {!r.active && (
                    <Badge variant="destructive" className="text-[10px]">
                      موقوفة
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex items-center gap-2 text-xs">
                  <Switch
                    checked={r.active}
                    onCheckedChange={(v) => toggleActive(r, v)}
                  />
                  <span className="text-muted-foreground">{r.active ? "نشطة" : "موقوفة"}</span>
                </div>
                <Button size="icon" variant="ghost" onClick={() => openEdit(r)}>
                  <Pencil className="h-4 w-4" />
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="text-destructive"
                  onClick={() => setDeleteId(r.id)}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing?.id ? "تعديل القاعدة" : "قاعدة جديدة"}</DialogTitle>
          </DialogHeader>
          {editing && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label>الاسم</Label>
                <Input
                  value={editing.name}
                  onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  placeholder="مثال: الحد الأدنى للطلب الشهري"
                />
              </div>

              <div className="space-y-1.5">
                <Label>نوع القاعدة</Label>
                <Select
                  value={editing.rule_type}
                  onValueChange={(v) =>
                    setEditing({ ...editing, rule_type: v as OrderRuleType })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MIN_ORDER_AMOUNT">
                      {RULE_TYPE_LABELS.MIN_ORDER_AMOUNT}
                    </SelectItem>
                    <SelectItem value="MIN_POINTS">{RULE_TYPE_LABELS.MIN_POINTS}</SelectItem>
                    <SelectItem value="MIN_PRODUCTS">
                      {RULE_TYPE_LABELS.MIN_PRODUCTS}
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>القيمة</Label>
                {editing.rule_type === "MIN_ORDER_AMOUNT" && (
                  <Input
                    type="number"
                    min={0}
                    value={editing.min_order_amount ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        min_order_amount: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                )}
                {editing.rule_type === "MIN_POINTS" && (
                  <Input
                    type="number"
                    min={0}
                    value={editing.min_points ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        min_points: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                )}
                {editing.rule_type === "MIN_PRODUCTS" && (
                  <Input
                    type="number"
                    min={0}
                    value={editing.min_products ?? ""}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        min_products: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                )}
              </div>

              <div className="space-y-1.5">
                <Label>تطبيق على فئة تسعير محددة (اختياري)</Label>
                <Select
                  value={editing.tier_id ?? "__all__"}
                  onValueChange={(v) =>
                    setEditing({ ...editing, tier_id: v === "__all__" ? null : v })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all__">كل الفئات</SelectItem>
                    {tiers.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  عند اختيار فئة، تُطبَّق هذه القاعدة فقط على الموزعين بهذه الفئة (تضاف فوق القواعد العامة).
                </p>
              </div>

              <div className="flex items-center justify-between">
                <Label>القاعدة نشطة</Label>
                <Switch
                  checked={editing.active}
                  onCheckedChange={(v) => setEditing({ ...editing, active: v })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              إلغاء
            </Button>
            <Button onClick={handleSave}>حفظ</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteId} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف القاعدة؟</AlertDialogTitle>
            <AlertDialogDescription>
              لن تتمكن من استرجاعها بعد الحذف.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>حذف</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
