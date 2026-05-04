import { useState } from "react";
import { Loader2, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated: () => void;
}

export function QuickAddDialog({ open, onOpenChange, companyId, onCreated }: Props) {
  const [name, setName] = useState("");
  const [price, setPrice] = useState("");
  const [stock, setStock] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [saving, setSaving] = useState(false);

  function reset() {
    setName("");
    setPrice("");
    setStock("");
    setImageUrl("");
  }

  async function handleSave() {
    const trimmedName = name.trim();
    const priceNum = Number(price);
    if (trimmedName.length < 2) {
      toast.error("الاسم قصير جداً");
      return;
    }
    if (!Number.isFinite(priceNum) || priceNum <= 0) {
      toast.error("السعر غير صالح");
      return;
    }
    setSaving(true);
    const stockNum = stock.trim() === "" ? null : Number(stock);
    const { error } = await supabase.from("products").insert({
      company_id: companyId,
      name_ar: trimmedName,
      description_ar: "",
      price_mad: priceNum,
      stock: stockNum,
      image_url: imageUrl.trim() || null,
      active: true,
      external_id: `quick-${crypto.randomUUID()}`,
      source: "quick_add",
    });
    setSaving(false);
    if (error) {
      const { handleLimitError } = await import("@/lib/limitErrors");
      if (handleLimitError(error, "منتج")) return;
      toast.error(error.message || "فشل الحفظ");
      return;
    }
    toast.success("تم إضافة المنتج");
    reset();
    onOpenChange(false);
    onCreated();
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent dir="rtl" className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Zap className="h-5 w-5 text-primary" />
            إضافة سريعة
          </DialogTitle>
          <DialogDescription>
            أنشئ منتجاً بسرعة بالحقول الأساسية فقط. يمكنك تعديله لاحقاً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="qa-name">اسم المنتج *</Label>
            <Input
              id="qa-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="مثال: عسل طبيعي 500غ"
              autoFocus
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="qa-price">السعر (د.م) *</Label>
              <Input
                id="qa-price"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                dir="ltr"
                value={price}
                onChange={(e) => setPrice(e.target.value)}
              />
            </div>
            <div>
              <Label htmlFor="qa-stock">المخزون</Label>
              <Input
                id="qa-stock"
                type="number"
                inputMode="numeric"
                min="0"
                dir="ltr"
                value={stock}
                onChange={(e) => setStock(e.target.value)}
                placeholder="اختياري"
              />
            </div>
          </div>
          <div>
            <Label htmlFor="qa-image">رابط الصورة</Label>
            <Input
              id="qa-image"
              type="url"
              dir="ltr"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
              placeholder="https://..."
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            إضافة
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
