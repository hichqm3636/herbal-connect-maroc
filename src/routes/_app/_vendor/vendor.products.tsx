import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, Plus, Pencil, Trash2, Package, Image as ImageIcon, Upload, X,
  Copy, FileSpreadsheet, Link2, ChevronDown,
} from "lucide-react";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { ProductImportDialog } from "@/components/vendor/ProductImportDialog";
import { QuickAddDialog } from "@/components/vendor/QuickAddDialog";
import { UrlImportDialog } from "@/components/vendor/UrlImportDialog";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger,
} from "@/components/ui/sheet";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";
import { z } from "zod";

export const Route = createFileRoute("/_app/_vendor/vendor/products")({
  component: VendorProductsPage,
  head: () => ({ meta: [{ title: "المنتجات — Nexora" }] }),
});

interface Supplier { id: string; name: string }

interface ProductRow {
  id: string;
  name_ar: string;
  description_ar: string;
  category: string | null;
  sku: string | null;
  image_url: string | null;
  price_mad: number;
  cost_price: number | null;
  pharmacy_price: number | null;
  rrp_price: number | null;
  map_price: number | null;
  stock: number | null;
  low_stock_threshold: number;
  minimum_order: number;
  pack_size: number;
  points_per_unit: number;
  active: boolean;
  supplier_id: string | null;
  external_id: string;
  source: string;
}

const productSchema = z.object({
  name_ar: z.string().trim().min(2, "الاسم قصير جداً").max(200),
  description_ar: z.string().trim().max(2000).optional().default(""),
  category: z.string().trim().max(100).optional().nullable(),
  sku: z.string().trim().max(100).optional().nullable(),
  price_mad: z.number().positive("السعر يجب أن يكون أكبر من 0"),
  cost_price: z.number().nonnegative().optional().nullable(),
  pharmacy_price: z.number().nonnegative().optional().nullable(),
  rrp_price: z.number().nonnegative().optional().nullable(),
  map_price: z.number().nonnegative().optional().nullable(),
  stock: z.number().int().nonnegative().optional().nullable(),
  low_stock_threshold: z.number().int().nonnegative().default(5),
  minimum_order: z.number().int().positive().default(1),
  pack_size: z.number().int().positive().default(1),
  points_per_unit: z.number().int().nonnegative().default(0),
  active: z.boolean().default(true),
  supplier_id: z.string().uuid().nullable().optional(),
  image_url: z.string().url().nullable().optional(),
});

type FormState = {
  name_ar: string;
  description_ar: string;
  category: string;
  sku: string;
  price_mad: string;
  cost_price: string;
  pharmacy_price: string;
  rrp_price: string;
  map_price: string;
  stock: string;
  low_stock_threshold: string;
  minimum_order: string;
  pack_size: string;
  points_per_unit: string;
  active: boolean;
  supplier_id: string;
  image_url: string;
};

const EMPTY_FORM: FormState = {
  name_ar: "", description_ar: "", category: "", sku: "",
  price_mad: "", cost_price: "", pharmacy_price: "", rrp_price: "", map_price: "",
  stock: "", low_stock_threshold: "5", minimum_order: "1", pack_size: "1", points_per_unit: "0",
  active: true, supplier_id: "", image_url: "",
};

function toForm(p: ProductRow): FormState {
  return {
    name_ar: p.name_ar,
    description_ar: p.description_ar ?? "",
    category: p.category ?? "",
    sku: p.sku ?? "",
    price_mad: String(p.price_mad ?? ""),
    cost_price: p.cost_price != null ? String(p.cost_price) : "",
    pharmacy_price: p.pharmacy_price != null ? String(p.pharmacy_price) : "",
    rrp_price: p.rrp_price != null ? String(p.rrp_price) : "",
    map_price: p.map_price != null ? String(p.map_price) : "",
    stock: p.stock != null ? String(p.stock) : "",
    low_stock_threshold: String(p.low_stock_threshold ?? 5),
    minimum_order: String(p.minimum_order ?? 1),
    pack_size: String(p.pack_size ?? 1),
    points_per_unit: String(p.points_per_unit ?? 0),
    active: p.active,
    supplier_id: p.supplier_id ?? "",
    image_url: p.image_url ?? "",
  };
}

// Stable HSL color from category string (or product fallback).
function categoryColor(category: string | null | undefined): string {
  const s = (category ?? "").trim() || "default";
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return `hsl(${h % 360}, 55%, 45%)`;
}

function firstLetter(name: string): string {
  const t = (name ?? "").trim();
  return t ? t.charAt(0).toUpperCase() : "•";
}

function VendorProductsPage() {
  const { companyId, user } = useAuth();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [activeFilter, setActiveFilter] = useState<"all" | "active" | "inactive">("all");

  const [editing, setEditing] = useState<ProductRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ProductRow | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [urlOpen, setUrlOpen] = useState(false);
  const [addMenuOpen, setAddMenuOpen] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [{ data: prods, error }, { data: sups }] = await Promise.all([
      supabase
        .from("products")
        .select("*")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("suppliers")
        .select("id, name")
        .eq("company_id", companyId)
        .eq("is_active", true),
    ]);
    if (error) {
      toast.error("تعذر تحميل المنتجات");
      setLoading(false);
      return;
    }
    setProducts(
      (prods ?? []).map((p) => ({
        ...p,
        price_mad: Number(p.price_mad),
        cost_price: p.cost_price != null ? Number(p.cost_price) : null,
        pharmacy_price: p.pharmacy_price != null ? Number(p.pharmacy_price) : null,
        rrp_price: p.rrp_price != null ? Number(p.rrp_price) : null,
        map_price: p.map_price != null ? Number(p.map_price) : null,
      })) as ProductRow[],
    );
    setSuppliers((sups ?? []) as Supplier[]);
    setLoading(false);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (activeFilter === "active" && !p.active) return false;
      if (activeFilter === "inactive" && p.active) return false;
      if (!q) return true;
      return (
        p.name_ar.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q) ||
        (p.category ?? "").toLowerCase().includes(q)
      );
    });
  }, [products, search, activeFilter]);

  const openCreate = () => {
    setForm(EMPTY_FORM);
    setEditing(null);
    setCreating(true);
  };

  const openEdit = (p: ProductRow) => {
    setForm(toForm(p));
    setEditing(p);
    setCreating(false);
  };

  const closeForm = () => {
    setEditing(null);
    setCreating(false);
    setForm(EMPTY_FORM);
  };

  const toggleActive = async (p: ProductRow) => {
    const { error } = await supabase
      .from("products")
      .update({ active: !p.active })
      .eq("id", p.id);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    setProducts((prev) => prev.map((x) => (x.id === p.id ? { ...x, active: !x.active } : x)));
    toast.success(p.active ? "تم إلغاء التفعيل" : "تم التفعيل");
  };

  const handleImageUpload = async (file: File) => {
    if (!companyId || !user) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error("حجم الصورة يجب أن يكون أقل من 5 ميغا");
      return;
    }
    setUploading(true);
    const ext = file.name.split(".").pop()?.toLowerCase() || "jpg";
    const path = `${companyId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage
      .from("product-images")
      .upload(path, file, { cacheControl: "3600", upsert: false, contentType: file.type });
    if (error) {
      console.error("[product-image upload]", { path, error });
      setUploading(false);
      const msg = error.message || "";
      if (/row-level security|not authorized|permission/i.test(msg)) {
        toast.error("ليس لديك صلاحية رفع الصور — تواصل مع المسؤول");
      } else if (/duplicate|exists/i.test(msg)) {
        toast.error("ملف بنفس الاسم موجود مسبقاً، حاول مجدداً");
      } else if (/exceeded|too large|size/i.test(msg)) {
        toast.error("حجم الملف كبير جداً");
      } else {
        toast.error(`فشل رفع الصورة: ${msg || "خطأ غير معروف"}`);
      }
      return;
    }
    const { data: pub } = supabase.storage.from("product-images").getPublicUrl(path);
    setForm((f) => ({ ...f, image_url: pub.publicUrl }));
    setUploading(false);
    toast.success("تم رفع الصورة");
  };

  const handleSave = async () => {
    if (!companyId) return;
    const num = (s: string) => (s.trim() === "" ? undefined : Number(s));
    const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

    const parsed = productSchema.safeParse({
      name_ar: form.name_ar,
      description_ar: form.description_ar,
      category: form.category.trim() || null,
      sku: form.sku.trim() || null,
      price_mad: num(form.price_mad),
      cost_price: numOrNull(form.cost_price),
      pharmacy_price: numOrNull(form.pharmacy_price),
      rrp_price: numOrNull(form.rrp_price),
      map_price: numOrNull(form.map_price),
      stock: numOrNull(form.stock),
      low_stock_threshold: num(form.low_stock_threshold),
      minimum_order: num(form.minimum_order),
      pack_size: num(form.pack_size),
      points_per_unit: num(form.points_per_unit),
      active: form.active,
      supplier_id: form.supplier_id || null,
      image_url: form.image_url || null,
    });
    if (!parsed.success) {
      toast.error(parsed.error.issues[0].message);
      return;
    }

    setSaving(true);
    const payload = {
      ...parsed.data,
      company_id: companyId,
      // Required by schema but Vendor-managed products don't sync from external systems.
      external_id: editing?.external_id ?? `internal-${crypto.randomUUID()}`,
      source: editing?.source ?? "internal",
    };

    const { error } = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);

    setSaving(false);
    if (error) {
      const { handleLimitError } = await import("@/lib/limitErrors");
      if (handleLimitError(error, "منتج")) return;
      toast.error(error.message || "فشل الحفظ");
      return;
    }
    toast.success(editing ? "تم التحديث" : "تم إنشاء المنتج");
    closeForm();
    load();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const { error } = await supabase.from("products").delete().eq("id", deleteTarget.id);
    if (error) {
      toast.error("تعذر الحذف. قد يكون المنتج مرتبطاً بطلبات.");
      setDeleteTarget(null);
      return;
    }
    toast.success("تم حذف المنتج");
    setProducts((prev) => prev.filter((p) => p.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  const handleDuplicate = async (p: ProductRow) => {
    if (!companyId) return;
    const { id: _omit, ...rest } = p;
    void _omit;
    const payload = {
      ...rest,
      company_id: companyId,
      name_ar: `${p.name_ar} (نسخة)`,
      sku: p.sku ? `${p.sku}-COPY` : null,
      external_id: `dup-${crypto.randomUUID()}`,
      source: "duplicate",
      active: false,
    };
    const { error } = await supabase.from("products").insert(payload);
    if (error) {
      const { handleLimitError } = await import("@/lib/limitErrors");
      if (handleLimitError(error, "منتج")) return;
      toast.error(error.message || "فشل النسخ");
      return;
    }
    toast.success("تم نسخ المنتج (معطّل افتراضياً)");
    load();
  };

  const formOpen = creating || !!editing;

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {products.length} منتج · {filtered.length} معروض
          </p>
        </div>
        <Sheet open={addMenuOpen} onOpenChange={setAddMenuOpen}>
          <SheetTrigger asChild>
            <Button className="gap-1.5">
              <Plus className="h-4 w-4" />
              <span>إضافة منتج</span>
              <ChevronDown className="h-4 w-4 opacity-80" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="bottom"
            dir="rtl"
            className="rounded-t-2xl max-h-[85vh] sm:max-w-md sm:mx-auto"
          >
            <SheetHeader className="text-right">
              <SheetTitle>طريقة إضافة المنتج</SheetTitle>
              <SheetDescription>اختر الطريقة الأنسب لك</SheetDescription>
            </SheetHeader>
            <div className="grid grid-cols-1 gap-2 mt-4 pb-4">
              <button
                type="button"
                onClick={() => { setAddMenuOpen(false); openCreate(); }}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent transition text-right"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Pencil className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">نموذج كامل</div>
                  <div className="text-xs text-muted-foreground">جميع الحقول والتسعير المتقدم</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setAddMenuOpen(false); setQuickOpen(true); }}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent transition text-right"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Plus className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">إضافة سريعة</div>
                  <div className="text-xs text-muted-foreground">اسم + سعر فقط</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setAddMenuOpen(false); setImportOpen(true); }}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent transition text-right"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <FileSpreadsheet className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">استيراد من CSV</div>
                  <div className="text-xs text-muted-foreground">دفعة منتجات من ملف</div>
                </div>
              </button>
              <button
                type="button"
                onClick={() => { setAddMenuOpen(false); setUrlOpen(true); }}
                className="flex items-center gap-3 p-3 rounded-xl border bg-card hover:bg-accent transition text-right"
              >
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                  <Link2 className="h-5 w-5" />
                </div>
                <div className="flex-1">
                  <div className="font-semibold text-sm">استيراد من رابط</div>
                  <div className="text-xs text-muted-foreground">WooCommerce / Shopify / أي صفحة</div>
                </div>
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </header>

      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث بالاسم أو SKU أو الفئة..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={activeFilter} onValueChange={(v) => setActiveFilter(v as typeof activeFilter)}>
          <SelectTrigger className="sm:w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">الكل</SelectItem>
            <SelectItem value="active">المفعّلة</SelectItem>
            <SelectItem value="inactive">المعطّلة</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            لا توجد منتجات
          </div>
        ) : (
          <>
            {/* Mobile: vertical card list */}
            <ul className="divide-y md:hidden">
              {filtered.map((p) => {
                const lowStock = p.stock != null && p.stock <= p.low_stock_threshold;
                return (
                  <li key={p.id} className="p-4 space-y-3">
                    <div className="flex items-start gap-3">
                      {p.image_url ? (
                        <img src={p.image_url} alt={p.name_ar} className="h-14 w-14 rounded-lg object-cover border shrink-0" />
                      ) : (
                        <div
                          className="h-14 w-14 rounded-lg flex items-center justify-center shrink-0 text-white font-bold text-lg shadow-sm"
                          style={{ background: categoryColor(p.category) }}
                        >
                          {firstLetter(p.name_ar)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold truncate">{p.name_ar}</p>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-1 text-xs text-muted-foreground">
                          {p.sku && <span className="font-mono" dir="ltr">{p.sku}</span>}
                        </div>
                        {p.category && (
                          <Badge
                            variant="secondary"
                            className="mt-1.5 text-[10px] border"
                            style={{
                              background: `${categoryColor(p.category)}22`,
                              color: categoryColor(p.category),
                              borderColor: `${categoryColor(p.category)}55`,
                            }}
                          >
                            {p.category}
                          </Badge>
                        )}
                        <p className="font-bold mt-1">{formatMAD(p.price_mad)}</p>
                      </div>
                      <Switch checked={p.active} onCheckedChange={() => toggleActive(p)} />
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="text-xs">
                        <span className="text-muted-foreground">المخزون: </span>
                        {p.stock == null ? (
                          <span className="text-muted-foreground">غير محدد</span>
                        ) : (
                          <span className={lowStock ? "text-destructive font-bold" : "font-medium"}>
                            {p.stock}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="تعديل">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => handleDuplicate(p)} title="نسخ">
                          <Copy className="h-4 w-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive"
                          onClick={() => setDeleteTarget(p)}
                          title="حذف"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop / tablet: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs">
                  <tr className="text-right">
                    <th className="px-4 py-3 font-medium">المنتج</th>
                    <th className="px-4 py-3 font-medium">الفئة</th>
                    <th className="px-4 py-3 font-medium">السعر</th>
                    <th className="px-4 py-3 font-medium">المخزون</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">إجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((p) => {
                    const lowStock = p.stock != null && p.stock <= p.low_stock_threshold;
                    return (
                      <tr key={p.id} className="hover:bg-muted/30">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            {p.image_url ? (
                              <img src={p.image_url} alt={p.name_ar} className="h-10 w-10 rounded object-cover border" />
                            ) : (
                              <div
                                className="h-10 w-10 rounded flex items-center justify-center text-white font-bold"
                                style={{ background: categoryColor(p.category) }}
                              >
                                {firstLetter(p.name_ar)}
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="font-medium truncate">{p.name_ar}</p>
                              {p.sku && <p className="text-xs text-muted-foreground font-mono">{p.sku}</p>}
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {p.category ? (
                            <Badge
                              variant="secondary"
                              className="text-[10px] border"
                              style={{
                                background: `${categoryColor(p.category)}22`,
                                color: categoryColor(p.category),
                                borderColor: `${categoryColor(p.category)}55`,
                              }}
                            >
                              {p.category}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 font-bold">{formatMAD(p.price_mad)}</td>
                        <td className="px-4 py-3">
                          {p.stock == null ? (
                            <span className="text-muted-foreground text-xs">غير محدد</span>
                          ) : (
                            <span className={lowStock ? "text-destructive font-bold" : ""}>
                              {p.stock}
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <Switch checked={p.active} onCheckedChange={() => toggleActive(p)} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1">
                            <Button size="sm" variant="ghost" onClick={() => openEdit(p)} title="تعديل">
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => handleDuplicate(p)} title="نسخ المنتج">
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => setDeleteTarget(p)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Create/Edit dialog */}
      <Dialog open={formOpen} onOpenChange={(open) => !open && closeForm()}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>{editing ? "تعديل المنتج" : "منتج جديد"}</DialogTitle>
            <DialogDescription>
              املأ الحقول المطلوبة. الحقول الأخرى اختيارية.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5">
            {/* Image */}
            <div>
              <Label>صورة المنتج</Label>
              <div className="mt-2 flex items-center gap-3">
                {form.image_url ? (
                  <div className="relative">
                    <img src={form.image_url} alt="" className="h-20 w-20 rounded object-cover border" />
                    <button
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, image_url: "" }))}
                      className="absolute -top-2 -right-2 bg-destructive text-destructive-foreground rounded-full p-0.5"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-20 rounded border-2 border-dashed flex items-center justify-center bg-muted/40">
                    <ImageIcon className="h-6 w-6 text-muted-foreground" />
                  </div>
                )}
                <label className="cursor-pointer">
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    disabled={uploading}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) handleImageUpload(f);
                      e.target.value = "";
                    }}
                  />
                  <span className="inline-flex items-center gap-2 rounded-md border bg-background px-3 py-2 text-sm hover:bg-muted">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    {uploading ? "جاري الرفع..." : "اختر صورة"}
                  </span>
                </label>
              </div>
            </div>

            <Separator />

            {/* Basics */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2">
                <Label htmlFor="name_ar">الاسم *</Label>
                <Input
                  id="name_ar"
                  value={form.name_ar}
                  onChange={(e) => setForm((f) => ({ ...f, name_ar: e.target.value }))}
                  required
                />
              </div>
              <div className="sm:col-span-2">
                <Label htmlFor="description_ar">الوصف</Label>
                <Textarea
                  id="description_ar"
                  rows={3}
                  value={form.description_ar}
                  onChange={(e) => setForm((f) => ({ ...f, description_ar: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="category">الفئة</Label>
                <Input
                  id="category"
                  value={form.category}
                  onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="sku">SKU</Label>
                <Input
                  id="sku"
                  dir="ltr"
                  value={form.sku}
                  onChange={(e) => setForm((f) => ({ ...f, sku: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="supplier_id">المورّد</Label>
                <Select
                  value={form.supplier_id || "__none__"}
                  onValueChange={(v) => setForm((f) => ({ ...f, supplier_id: v === "__none__" ? "" : v }))}
                >
                  <SelectTrigger><SelectValue placeholder="— بدون —" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— بدون —</SelectItem>
                    {suppliers.map((s) => (
                      <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 pt-6">
                <Switch
                  id="active"
                  checked={form.active}
                  onCheckedChange={(v) => setForm((f) => ({ ...f, active: v }))}
                />
                <Label htmlFor="active">منتج مفعّل</Label>
              </div>
            </div>

            <Separator />

            {/* Pricing */}
            <div>
              <h3 className="text-sm font-bold mb-3">التسعير (د.م)</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <NumField label="سعر البيع *" value={form.price_mad} onChange={(v) => setForm((f) => ({ ...f, price_mad: v }))} />
                <NumField label="سعر التكلفة" value={form.cost_price} onChange={(v) => setForm((f) => ({ ...f, cost_price: v }))} />
                <NumField label="سعر الصيدلية" value={form.pharmacy_price} onChange={(v) => setForm((f) => ({ ...f, pharmacy_price: v }))} />
                <NumField label="السعر للجمهور (RRP)" value={form.rrp_price} onChange={(v) => setForm((f) => ({ ...f, rrp_price: v }))} />
                <NumField label="الحد الأدنى المعلن (MAP)" value={form.map_price} onChange={(v) => setForm((f) => ({ ...f, map_price: v }))} />
              </div>
            </div>

            <Separator />

            {/* Inventory */}
            <div>
              <h3 className="text-sm font-bold mb-3">المخزون والكميات</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                <NumField label="المخزون" value={form.stock} onChange={(v) => setForm((f) => ({ ...f, stock: v }))} integer />
                <NumField label="حد التنبيه" value={form.low_stock_threshold} onChange={(v) => setForm((f) => ({ ...f, low_stock_threshold: v }))} integer />
                <NumField label="الحد الأدنى للطلب" value={form.minimum_order} onChange={(v) => setForm((f) => ({ ...f, minimum_order: v }))} integer />
                <NumField label="حجم العبوة" value={form.pack_size} onChange={(v) => setForm((f) => ({ ...f, pack_size: v }))} integer />
                <NumField label="نقاط لكل وحدة" value={form.points_per_unit} onChange={(v) => setForm((f) => ({ ...f, points_per_unit: v }))} integer />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeForm} disabled={saving}>إلغاء</Button>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              {editing ? "حفظ التغييرات" : "إنشاء"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>حذف المنتج؟</AlertDialogTitle>
            <AlertDialogDescription>
              سيتم حذف <span className="font-bold">{deleteTarget?.name_ar}</span> نهائياً.
              إذا كان مرتبطاً بطلبات قائمة، يفضّل تعطيله بدلاً من حذفه.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              حذف
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {companyId && (
        <>
          <ProductImportDialog
            open={importOpen}
            onOpenChange={setImportOpen}
            companyId={companyId}
            onImported={load}
          />
          <QuickAddDialog
            open={quickOpen}
            onOpenChange={setQuickOpen}
            companyId={companyId}
            onCreated={load}
          />
          <UrlImportDialog
            open={urlOpen}
            onOpenChange={setUrlOpen}
            companyId={companyId}
            onCreated={load}
          />
        </>
      )}
    </div>
  );
}

function NumField({
  label, value, onChange, integer = false,
}: {
  label: string; value: string; onChange: (v: string) => void; integer?: boolean;
}) {
  return (
    <div>
      <Label>{label}</Label>
      <Input
        type="number"
        inputMode={integer ? "numeric" : "decimal"}
        step={integer ? "1" : "0.01"}
        min="0"
        dir="ltr"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

