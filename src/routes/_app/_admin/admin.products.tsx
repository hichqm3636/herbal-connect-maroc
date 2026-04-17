import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Upload,
  Star,
  StarOff,
  ArrowUp,
  ArrowDown,
  FileSpreadsheet,
  RefreshCw,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { syncWooCommerceProducts } from "@/utils/woocommerce.functions";
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
import { deriveWholesaleFromRRP, parseTiers } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/products")({
  component: AdminProducts,
  head: () => ({ meta: [{ title: "إدارة المنتجات — هيرباليفي" }] }),
});

interface PriceTier {
  min_qty: number;
  price: number;
}

interface Product {
  id: string;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  image_url: string | null;
  category: string | null;
  stock: number;
  active: boolean;
  points_per_unit: number;
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  minimum_order: number;
  price_tiers: PriceTier[];
}

interface ProductImage {
  id: string;
  product_id: string;
  url: string;
  position: number;
  is_primary: boolean;
}

const empty: Omit<Product, "id" | "image_url"> = {
  name_ar: "",
  description_ar: "",
  price_mad: 0,
  category: "",
  stock: 0,
  active: true,
  points_per_unit: 0,
  rrp_price: null,
  pharmacy_price: null,
  map_price: null,
  minimum_order: 1,
  price_tiers: [
    { min_qty: 6, price: 0 },
    { min_qty: 12, price: 0 },
    { min_qty: 24, price: 0 },
  ],
};

function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [form, setForm] = useState<Omit<Product, "id" | "image_url">>(empty);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [importResult, setImportResult] = useState<{
    created: number;
    updated?: number;
    failed: number;
    errors: string[];
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const syncWoo = useServerFn(syncWooCommerceProducts);

  const handleWooSync = async () => {
    setSyncing(true);
    setImportResult(null);
    try {
      const result = await syncWoo();
      if (!result.ok) {
        toast.error(result.message ?? "تعذر مزامنة المنتجات");
        setImportResult({
          created: result.created,
          updated: result.updated,
          failed: result.failed,
          errors: result.message
            ? [result.message, ...result.errors]
            : result.errors,
        });
        return;
      }
      setImportResult({
        created: result.created,
        updated: result.updated,
        failed: result.failed,
        errors: result.errors,
      });
      if (result.created + result.updated > 0) {
        toast.success(`تمت المزامنة: ${result.created} جديد، ${result.updated} محدّث`);
        load();
      } else {
        toast.message("لا توجد منتجات للمزامنة");
      }
    } catch (err) {
      toast.error("تعذر تشغيل المزامنة");
      console.error(err);
    } finally {
      setSyncing(false);
    }
  };

  const load = async () => {
    const { data } = await supabase
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });
    const rows = (data ?? []).map((p) => ({
      ...p,
      price_tiers: parseTiers((p as { price_tiers?: unknown }).price_tiers),
    })) as Product[];
    setProducts(rows);
  };

  useEffect(() => {
    load();
  }, []);

  const loadImages = async (productId: string) => {
    const { data } = await supabase
      .from("product_images")
      .select("*")
      .eq("product_id", productId)
      .order("position", { ascending: true });
    setImages(data ?? []);
  };

  const openNew = () => {
    setEditing(null);
    setForm(empty);
    setImages([]);
    setOpen(true);
  };

  const openEdit = async (p: Product) => {
    setEditing(p);
    setForm({
      name_ar: p.name_ar,
      description_ar: p.description_ar,
      price_mad: p.price_mad,
      category: p.category ?? "",
      stock: p.stock,
      active: p.active,
      points_per_unit: p.points_per_unit ?? 0,
    });
    await loadImages(p.id);
    setOpen(true);
  };

  const ensureProductId = async (): Promise<string | null> => {
    if (editing) return editing.id;
    if (!form.name_ar.trim()) {
      toast.error("أدخل اسم المنتج أولاً قبل رفع الصور");
      return null;
    }
    const { data, error } = await supabase
      .from("products")
      .insert({
        name_ar: form.name_ar,
        description_ar: form.description_ar,
        price_mad: form.price_mad,
        category: form.category || null,
        stock: form.stock,
        active: form.active,
        points_per_unit: form.points_per_unit,
      })
      .select("*")
      .single();
    if (error || !data) {
      toast.error("تعذر إنشاء المنتج");
      return null;
    }
    setEditing(data as Product);
    return data.id;
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;

    const productId = await ensureProductId();
    if (!productId) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    setUploading(true);
    let nextPosition = images.length > 0 ? Math.max(...images.map((i) => i.position)) + 1 : 0;
    const hasPrimary = images.some((i) => i.is_primary);
    const newRows: ProductImage[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        toast.error(`${file.name}: ليس صورة`);
        continue;
      }
      if (file.size > 5 * 1024 * 1024) {
        toast.error(`${file.name}: حجم أكبر من 5MB`);
        continue;
      }
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${productId}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("product-images")
        .upload(path, file, { cacheControl: "3600", upsert: false });
      if (upErr) {
        toast.error(`تعذر رفع ${file.name}`);
        continue;
      }
      const { data: urlData } = supabase.storage.from("product-images").getPublicUrl(path);
      const { data: row, error: insErr } = await supabase
        .from("product_images")
        .insert({
          product_id: productId,
          url: urlData.publicUrl,
          position: nextPosition,
          is_primary: !hasPrimary && newRows.length === 0 && images.length === 0,
        })
        .select("*")
        .single();
      if (insErr || !row) {
        toast.error(`تعذر حفظ ${file.name}`);
        continue;
      }
      newRows.push(row as ProductImage);
      nextPosition++;
    }

    setImages((prev) => [...prev, ...newRows]);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (newRows.length > 0) toast.success(`تم رفع ${newRows.length} صورة`);
  };

  const setPrimary = async (img: ProductImage) => {
    const { error: clearErr } = await supabase
      .from("product_images")
      .update({ is_primary: false })
      .eq("product_id", img.product_id)
      .eq("is_primary", true);
    if (clearErr) {
      toast.error("تعذر تحديث الصورة الرئيسية");
      return;
    }
    const { error } = await supabase
      .from("product_images")
      .update({ is_primary: true })
      .eq("id", img.id);
    if (error) {
      toast.error("تعذر تعيين الصورة الرئيسية");
      return;
    }
    setImages((prev) =>
      prev.map((i) => ({ ...i, is_primary: i.id === img.id })),
    );
    toast.success("تم تعيين الصورة الرئيسية");
  };

  const moveImage = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= images.length) return;
    const a = images[index];
    const b = images[target];
    const reordered = [...images];
    reordered[index] = b;
    reordered[target] = a;
    setImages(reordered);
    await Promise.all([
      supabase.from("product_images").update({ position: b.position }).eq("id", a.id),
      supabase.from("product_images").update({ position: a.position }).eq("id", b.id),
    ]);
  };

  const removeImage = async (img: ProductImage) => {
    if (!confirm("حذف هذه الصورة؟")) return;
    const { error } = await supabase.from("product_images").delete().eq("id", img.id);
    if (error) {
      toast.error("تعذر حذف الصورة");
      return;
    }
    // Best-effort delete from storage
    try {
      const url = new URL(img.url);
      const marker = "/product-images/";
      const idx = url.pathname.indexOf(marker);
      if (idx >= 0) {
        const path = url.pathname.slice(idx + marker.length);
        await supabase.storage.from("product-images").remove([path]);
      }
    } catch {
      // ignore
    }
    setImages((prev) => prev.filter((i) => i.id !== img.id));
    toast.success("تم الحذف");
  };

  const save = async () => {
    if (!form.name_ar.trim() || form.price_mad < 0) {
      toast.error("اسم المنتج والسعر مطلوبان");
      return;
    }
    setSaving(true);
    const payload = {
      name_ar: form.name_ar,
      description_ar: form.description_ar,
      price_mad: form.price_mad,
      category: form.category || null,
      stock: form.stock,
      active: form.active,
      points_per_unit: form.points_per_unit,
    };
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

  const parseCsv = (text: string): Record<string, string>[] => {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length < 2) return [];
    const splitRow = (row: string): string[] => {
      const out: string[] = [];
      let cur = "";
      let inQuotes = false;
      for (let i = 0; i < row.length; i++) {
        const c = row[i];
        if (c === '"') {
          if (inQuotes && row[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (c === "," && !inQuotes) {
          out.push(cur);
          cur = "";
        } else {
          cur += c;
        }
      }
      out.push(cur);
      return out.map((s) => s.trim());
    };
    const headers = splitRow(lines[0]).map((h) => h.toLowerCase());
    return lines.slice(1).map((line) => {
      const cells = splitRow(line);
      const row: Record<string, string> = {};
      headers.forEach((h, i) => {
        row[h] = cells[i] ?? "";
      });
      return row;
    });
  };

  const handleCsvImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (csvInputRef.current) csvInputRef.current.value = "";

    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error("ملف CSV فارغ أو غير صالح");
        setImporting(false);
        return;
      }

      const errors: string[] = [];
      const payloads: {
        name_ar: string;
        description_ar: string;
        price_mad: number;
        stock: number;
        points_per_unit: number;
        image_url: string | null;
        active: boolean;
      }[] = [];

      rows.forEach((row, idx) => {
        const lineNum = idx + 2;
        const name = (row.name ?? row.name_ar ?? "").trim();
        if (!name) {
          errors.push(`السطر ${lineNum}: اسم المنتج مطلوب`);
          return;
        }
        const price = Number(row.price ?? row.price_mad);
        if (!Number.isFinite(price) || price < 0) {
          errors.push(`السطر ${lineNum}: سعر غير صالح`);
          return;
        }
        const points = Number(row.points ?? row.points_per_unit ?? 0);
        const stock = Number(row.stock ?? 0);
        const imageUrl = (row.image_url ?? "").trim() || null;
        payloads.push({
          name_ar: name,
          description_ar: "",
          price_mad: price,
          stock: Number.isFinite(stock) ? stock : 0,
          points_per_unit: Number.isFinite(points) ? points : 0,
          image_url: imageUrl,
          active: true,
        });
      });

      let created = 0;
      if (payloads.length > 0) {
        const { data, error } = await supabase
          .from("products")
          .insert(payloads)
          .select("id");
        if (error) {
          errors.push(`خطأ في الإدراج: ${error.message}`);
        } else {
          created = data?.length ?? 0;
        }
      }

      setImportResult({ created, failed: errors.length, errors: errors.slice(0, 10) });
      if (created > 0) {
        toast.success(`تم استيراد ${created} منتج`);
        load();
      }
      if (errors.length > 0 && created === 0) {
        toast.error("فشل الاستيراد");
      }
    } catch (err) {
      toast.error("تعذر قراءة الملف");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const handleCatalogImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (catalogInputRef.current) catalogInputRef.current.value = "";

    setImporting(true);
    setImportResult(null);
    try {
      const text = await file.text();
      const rows = parseCsv(text);
      if (rows.length === 0) {
        toast.error("ملف CSV فارغ أو غير صالح");
        setImporting(false);
        return;
      }

      const errors: string[] = [];
      const skus = rows
        .map((r) => (r.sku ?? "").trim())
        .filter(Boolean);

      // Fetch existing products by SKU
      const existingBySku = new Map<string, { id: string }>();
      if (skus.length > 0) {
        const { data: existing, error: fetchErr } = await supabase
          .from("products")
          .select("id, sku")
          .in("sku", skus);
        if (fetchErr) {
          toast.error("تعذر قراءة الكتالوج الحالي");
          setImporting(false);
          return;
        }
        for (const p of existing ?? []) {
          if (p.sku) existingBySku.set(p.sku, { id: p.id });
        }
      }

      let created = 0;
      let updated = 0;

      for (let idx = 0; idx < rows.length; idx++) {
        const row = rows[idx];
        const lineNum = idx + 2;
        const sku = (row.sku ?? "").trim();
        if (!sku) {
          errors.push(`السطر ${lineNum}: SKU مطلوب`);
          continue;
        }
        const name = (row.name ?? row.name_ar ?? "").trim();
        const price = Number(row.price ?? row.price_mad);
        if (!name) {
          errors.push(`السطر ${lineNum} (${sku}): الاسم مطلوب`);
          continue;
        }
        if (!Number.isFinite(price) || price < 0) {
          errors.push(`السطر ${lineNum} (${sku}): سعر غير صالح`);
          continue;
        }
        const points = Number(row.points ?? 0);
        const stock = Number(row.stock ?? 0);
        const imageUrl = (row.image_url ?? "").trim() || null;

        const payload = {
          sku,
          name_ar: name,
          price_mad: price,
          stock: Number.isFinite(stock) ? stock : 0,
          points_per_unit: Number.isFinite(points) ? points : 0,
          image_url: imageUrl,
        };

        const existing = existingBySku.get(sku);
        if (existing) {
          const { error } = await supabase
            .from("products")
            .update(payload)
            .eq("id", existing.id);
          if (error) {
            errors.push(`السطر ${lineNum} (${sku}): ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabase
            .from("products")
            .insert({ ...payload, description_ar: "", active: true });
          if (error) {
            errors.push(`السطر ${lineNum} (${sku}): ${error.message}`);
          } else {
            created++;
          }
        }
      }

      setImportResult({
        created,
        updated,
        failed: errors.length,
        errors: errors.slice(0, 10),
      });
      if (created + updated > 0) {
        toast.success(`تم إنشاء ${created} وتحديث ${updated} منتج`);
        load();
      } else if (errors.length > 0) {
        toast.error("فشل استيراد الكتالوج");
      }
    } catch (err) {
      toast.error("تعذر قراءة الملف");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} منتج</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            ref={csvInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCsvImport}
          />
          <input
            ref={catalogInputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={handleCatalogImport}
          />
          <Button
            type="button"
            variant="outline"
            onClick={() => csvInputRef.current?.click()}
            disabled={importing}
            className="gap-2"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            استيراد المنتجات (CSV)
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => catalogInputRef.current?.click()}
            disabled={importing}
            className="gap-2"
          >
            {importing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            استيراد الكتالوج
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleWooSync}
            disabled={syncing}
            className="gap-2"
          >
            {syncing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            مزامنة المنتجات
          </Button>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button onClick={openNew} className="gap-2">
                <Plus className="h-4 w-4" />
                منتج جديد
              </Button>
            </DialogTrigger>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto" dir="rtl">
            <DialogHeader>
              <DialogTitle>{editing ? "تعديل منتج" : "منتج جديد"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>اسم المنتج</Label>
                <Input
                  value={form.name_ar}
                  onChange={(e) => setForm({ ...form, name_ar: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>الوصف</Label>
                <Textarea
                  value={form.description_ar}
                  onChange={(e) => setForm({ ...form, description_ar: e.target.value })}
                  rows={3}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>السعر (درهم)</Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={form.price_mad}
                    onChange={(e) => setForm({ ...form, price_mad: Number(e.target.value) })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>المخزون</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.stock}
                    onChange={(e) => setForm({ ...form, stock: Number(e.target.value) })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>التصنيف</Label>
                  <Input
                    value={form.category ?? ""}
                    onChange={(e) => setForm({ ...form, category: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label>النقاط لكل وحدة</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.points_per_unit}
                    onChange={(e) =>
                      setForm({ ...form, points_per_unit: Number(e.target.value) })
                    }
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>معرض الصور ({images.length})</Label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    className="gap-2"
                  >
                    {uploading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4" />
                    )}
                    {uploading ? "جارٍ الرفع..." : "رفع صور"}
                  </Button>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleImageUpload}
                />
                {images.length === 0 ? (
                  <p className="text-xs text-muted-foreground py-4 text-center border rounded-md">
                    لا توجد صور بعد. PNG/JPG حتى 5MB لكل صورة.
                  </p>
                ) : (
                  <div className="grid grid-cols-3 gap-2">
                    {images.map((img, idx) => (
                      <div
                        key={img.id}
                        className="relative group border rounded-md overflow-hidden bg-muted"
                      >
                        <img
                          src={img.url}
                          alt=""
                          className="w-full aspect-square object-cover"
                        />
                        {img.is_primary && (
                          <Badge className="absolute top-1 right-1 text-[10px] gap-1 px-1.5">
                            <Star className="h-3 w-3 fill-current" />
                            رئيسية
                          </Badge>
                        )}
                        <div className="absolute inset-x-0 bottom-0 bg-background/90 backdrop-blur-sm p-1 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => setPrimary(img)}
                            disabled={img.is_primary}
                            title="تعيين كرئيسية"
                          >
                            {img.is_primary ? (
                              <Star className="h-3 w-3 fill-current" />
                            ) : (
                              <StarOff className="h-3 w-3" />
                            )}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => moveImage(idx, -1)}
                            disabled={idx === 0}
                          >
                            <ArrowUp className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6"
                            onClick={() => moveImage(idx, 1)}
                            disabled={idx === images.length - 1}
                          >
                            <ArrowDown className="h-3 w-3" />
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="ghost"
                            className="h-6 w-6 text-destructive"
                            onClick={() => removeImage(img)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2">
                <Switch
                  checked={form.active}
                  onCheckedChange={(v) => setForm({ ...form, active: v })}
                />
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
      </div>

      {importResult && (
        <Card className="p-4 shadow-soft space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">نتيجة الاستيراد</h3>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setImportResult(null)}
            >
              إغلاق
            </Button>
          </div>
          <p className="text-sm">
            تم إنشاء <span className="font-bold text-primary">{importResult.created}</span> منتج
            {typeof importResult.updated === "number" && (
              <>
                ، تحديث <span className="font-bold text-primary">{importResult.updated}</span>
              </>
            )}
            ، فشل <span className="font-bold text-destructive">{importResult.failed}</span> سطر.
          </p>
          {importResult.errors.length > 0 && (
            <ul className="text-xs text-muted-foreground list-disc pr-4 space-y-1">
              {importResult.errors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
        </Card>
      )}

      <div className="grid gap-3">
        {products.map((p) => (
          <Card key={p.id} className="p-4 shadow-soft flex items-center gap-4">
            <img
              src={p.image_url ?? ""}
              alt=""
              className="h-16 w-16 rounded-md object-cover bg-muted shrink-0"
            />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-semibold truncate">{p.name_ar}</h3>
                {!p.active && <Badge variant="secondary">معطّل</Badge>}
                {p.category && <Badge variant="outline">{p.category}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                {p.description_ar}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm">
                <span className="font-bold text-primary">{formatMAD(p.price_mad)}</span>
                <span className="text-muted-foreground">المخزون: {p.stock}</span>
              </div>
            </div>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={() => openEdit(p)}>
                <Pencil className="h-4 w-4" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="text-destructive"
                onClick={() => remove(p.id)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
