import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus, Pencil, Trash2, Tag } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/super-admin/pricing-tiers")({
  component: SuperAdminPricingTiers,
  head: () => ({ meta: [{ title: "فئات التسعير العالمية — DistribHub" }] }),
});

interface PricingTier {
  id: string;
  name: string;
  base_discount_percent: number;
  created_at: string;
}

function SuperAdminPricingTiers() {
  const { companyId } = useAuth();
  const [tiers, setTiers] = useState<PricingTier[]>([]);
  const [loading, setLoading] = useState(true);

  const [editing, setEditing] = useState<PricingTier | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", base_discount_percent: 0 });
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<PricingTier | null>(null);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("pricing_tiers")
      .select("id, name, base_discount_percent, created_at")
      .order("base_discount_percent", { ascending: true });
    setTiers((data ?? []) as PricingTier[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  const openCreate = () => {
    setForm({ name: "", base_discount_percent: 0 });
    setCreating(true);
  };

  const openEdit = (t: PricingTier) => {
    setForm({ name: t.name, base_discount_percent: t.base_discount_percent });
    setEditing(t);
  };

  const closeDialog = () => {
    setCreating(false);
    setEditing(null);
    setForm({ name: "", base_discount_percent: 0 });
  };

  const save = async () => {
    if (form.name.trim().length < 2) return toast.error("الاسم قصير جداً");
    if (form.base_discount_percent < 0 || form.base_discount_percent > 100)
      return toast.error("نسبة الخصم يجب أن تكون بين 0 و 100");
    setBusy(true);
    if (editing) {
      const { error } = await supabase
        .from("pricing_tiers")
        .update({
          name: form.name.trim(),
          base_discount_percent: form.base_discount_percent,
        })
        .eq("id", editing.id);
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("تم تحديث الفئة");
    } else {
      if (!companyId) {
        setBusy(false);
        return toast.error("اختر شركة أولاً من قائمة الشركات");
      }
      const { error } = await supabase.from("pricing_tiers").insert({
        name: form.name.trim(),
        base_discount_percent: form.base_discount_percent,
        company_id: companyId,
      });
      setBusy(false);
      if (error) return toast.error(error.message);
      toast.success("تم إنشاء الفئة");
    }
    closeDialog();
    load();
  };

  const remove = async () => {
    if (!confirmDelete) return;
    setBusy(true);
    const { error } = await supabase.from("pricing_tiers").delete().eq("id", confirmDelete.id);
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success("تم الحذف");
    setConfirmDelete(null);
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">فئات التسعير العالمية</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {tiers.length} فئة — تُستخدم من قبل جميع الشركات على المنصة. مثال: Retail 20%، Gold 30%، Master 40%
          </p>
        </div>
        <Button className="gap-2 self-start" onClick={openCreate}>
          <Plus className="h-4 w-4" />
          إضافة فئة
        </Button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : tiers.length === 0 ? (
        <Card className="p-8 text-center text-muted-foreground">
          لا توجد فئات تسعير بعد. أضف أول فئة لتبدأ.
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tiers.map((t) => (
            <Card key={t.id} className="p-4 shadow-soft">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className="bg-primary/15 text-primary border border-primary/30 hover:bg-primary/20 gap-1">
                      <Tag className="h-3 w-3" />
                      {t.name}
                    </Badge>
                  </div>
                  <p className="mt-3 text-2xl font-bold text-primary">
                    {t.base_discount_percent}%
                  </p>
                  <p className="text-xs text-muted-foreground">نسبة الخصم الأساسية</p>
                </div>
                <div className="flex flex-col gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="تعديل"
                    onClick={() => openEdit(t)}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    aria-label="حذف"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(t)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={creating || !!editing} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل فئة التسعير" : "إنشاء فئة تسعير"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>اسم الفئة</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="Gold"
              />
            </div>
            <div className="space-y-1.5">
              <Label>نسبة الخصم الأساسية (%)</Label>
              <Input
                type="number"
                min={0}
                max={100}
                step="0.01"
                value={form.base_discount_percent}
                onChange={(e) =>
                  setForm({
                    ...form,
                    base_discount_percent: Math.max(0, Math.min(100, Number(e.target.value) || 0)),
                  })
                }
              />
            </div>
          </div>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button variant="outline" onClick={closeDialog} disabled={busy}>
              إلغاء
            </Button>
            <Button onClick={save} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف فئة التسعير</AlertDialogTitle>
            <AlertDialogDescription>
              لا يمكن الحذف إذا كانت الفئة مستخدمة من قبل أي شركة. هل أنت متأكد؟
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>إلغاء</AlertDialogCancel>
            <AlertDialogAction onClick={remove} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
