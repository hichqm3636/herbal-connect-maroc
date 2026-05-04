import { useState } from "react";
import { Loader2, Link2, Sparkles, Image as ImageIcon } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { fetchProductFromUrl } from "@/server/productFetch.functions";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  onCreated: () => void;
}

export function UrlImportDialog({ open, onOpenChange, companyId, onCreated }: Props) {
  const [url, setUrl] = useState("");
  const [fetching, setFetching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [fetched, setFetched] = useState(false);

  function reset() {
    setUrl("");
    setName("");
    setDescription("");
    setPrice("");
    setImageUrl("");
    setFetched(false);
  }

  async function handleFetch() {
    const trimmed = url.trim();
    if (!/^https?:\/\//i.test(trimmed)) {
      toast.error("الرابط غير صالح");
      return;
    }
    setFetching(true);
    try {
      const data = await fetchProductFromUrl({ data: { url: trimmed } });
      setName(data.name?.slice(0, 200) ?? "");
      setDescription(data.description?.slice(0, 2000) ?? "");
      setPrice(data.price ? String(data.price) : "");
      setImageUrl(data.image_url ?? "");
      setFetched(true);
      if (!data.name && !data.image_url && !data.price) {
        toast.warning("لم نجد بيانات منتج كافية. يمكنك تعبئتها يدوياً.");
      } else {
        toast.success("تم جلب البيانات — راجع وعدّل قبل الحفظ");
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "فشل الجلب");
    } finally {
      setFetching(false);
    }
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
    const { error } = await supabase.from("products").insert({
      company_id: companyId,
      name_ar: trimmedName,
      description_ar: description.trim(),
      price_mad: priceNum,
      image_url: imageUrl.trim() || null,
      active: true,
      external_id: `url-${crypto.randomUUID()}`,
      source: "url_import",
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
      <DialogContent dir="rtl" className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5 text-primary" />
            استيراد من رابط
          </DialogTitle>
          <DialogDescription>
            ألصق رابط صفحة المنتج (متجر WooCommerce، Shopify، أي صفحة بيانات منتج). سنحاول جلب الاسم والصورة والسعر تلقائياً.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="url">رابط المنتج</Label>
            <div className="mt-1 flex gap-2">
              <Input
                id="url"
                type="url"
                dir="ltr"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com/product/..."
                disabled={fetching}
              />
              <Button onClick={handleFetch} disabled={fetching || !url.trim()}>
                {fetching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                جلب
              </Button>
            </div>
          </div>

          {fetched && (
            <>
              {imageUrl && (
                <Card className="overflow-hidden">
                  <div className="aspect-video bg-muted">
                    <img
                      src={imageUrl}
                      alt={name}
                      className="h-full w-full object-contain"
                      onError={(e) => {
                        (e.currentTarget as HTMLImageElement).style.display = "none";
                      }}
                    />
                  </div>
                </Card>
              )}

              <div>
                <Label htmlFor="ui-name">الاسم *</Label>
                <Input
                  id="ui-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div>
                <Label htmlFor="ui-desc">الوصف</Label>
                <Textarea
                  id="ui-desc"
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label htmlFor="ui-price">السعر (د.م) *</Label>
                  <Input
                    id="ui-price"
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
                  <Label htmlFor="ui-image">رابط الصورة</Label>
                  <div className="relative">
                    <ImageIcon className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="ui-image"
                      type="url"
                      dir="ltr"
                      value={imageUrl}
                      onChange={(e) => setImageUrl(e.target.value)}
                      className="pr-9"
                    />
                  </div>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            إلغاء
          </Button>
          {fetched && (
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              حفظ المنتج
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
