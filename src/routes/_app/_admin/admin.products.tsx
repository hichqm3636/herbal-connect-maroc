import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/products")({
  component: AdminProducts,
  head: () => ({ meta: [{ title: "إدارة المنتجات — هيرباليفي" }] }),
});

interface Product {
  id: string;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  image_url: string | null;
  category: string | null;
  stock: number;
  active: boolean;
}

const empty: Omit<Product, "id"> = {
  name_ar: "",
  description_ar: "",
  price_mad: 0,
  image_url: "",
  category: "",
  stock: 0,
  active: true,
};

function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id">>(empty);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("products").select("*").order("created_at", { ascending: false });
    setProducts(data ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setOpen(true);
  };

  const openEdit = (p: Product) => {
    setEditing(p);
    setForm({ ...p });
    setOpen(true);
  };

  const save = async () => {
    if (!form.name_ar.trim() || form.price_mad < 0) {
      toast.error("اسم المنتج والسعر مطلوبان");
      return;
    }
    setSaving(true);
    const payload = { ...form, image_url: form.image_url || null, category: form.category || null };
    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) {
      toast.error("تعذر الحفظ");
      return;
    }
    toast.success(editing ? "تم تحديث المنتج" : "تمت إضافة المنتج");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا المنتج؟")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      toast.error("تعذر الحذف");
      return;
    }
    toast.success("تم الحذف");
    load();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} منتج</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openNew} className="gap-2">
              <Plus className="h-4 w-4" />
              منتج جديد
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل منتج" : "منتج جديد"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>اسم المنتج</Label>
                <Input value={form.name_ar} onChange={(e) => setForm({ ...form, name_ar: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Textarea value={form.description_ar} onChange={(e) => setForm({ ...form, description_ar: e.target.value })} rows={3} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>السعر (درهم)</Label>
                  <Input type="number" min="0" step="0.01" value={form.price_mad} onChange={(e) => setForm({ ...form, price_mad: Number(e.target.value) })} />
                </div>
                <div className="space-y-2">
                  <Label>المخزون</Label>
                  <Input type="number" min="0" value={form.stock} onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })} />
                </div>
              </div>
              <div className="space-y-2">
                <Label>التصنيف</Label>
                <Input value={form.category ?? ""} onChange={(e) => setForm({ ...form, category: e.target.value })} />
              </div>
              <div className="space-y-2">
                <Label>رابط الصورة</Label>
                <Input value={form.image_url ?? ""} onChange={(e) => setForm({ ...form, image_url: e.target.value })} placeholder="https://..." />
              </div>
              <div className="flex items-center gap-2">
                <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
                <Label>منتج نشط</Label>
              </div>
            </div>
            <DialogFooter>
              <Button onClick={save} disabled={saving} className="w-full sm:w-auto">
                {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                حفظ
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4 shadow-soft flex items-center gap-4">
            <img src={p.image_url ?? ""} alt="" className="h-16 w-16 rounded-md object-cover bg-muted shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{p.name_ar}</h3>
                {!p.active && <Badge variant="secondary">معطّل</Badge>}
                {p.category && <Badge variant="outline">{p.category}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-1">{p.description_ar}</p>
              <div className="flex items-center gap-3 mt-2 text-sm">
                <span className="font-bold text-primary">{formatMAD(p.price_mad)}</span>
                <span className="text-muted-foreground">المخزون: {p.stock}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" className="text-destructive" onClick={() => remove(p.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
