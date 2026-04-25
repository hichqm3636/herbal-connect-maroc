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
  Download,
} from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { syncWooCommerceProducts } from "@/utils/woocommerce.functions";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { useAuth } from "@/hooks/useAuth";
import { logActivity, logFieldChanges } from "@/lib/activityLog";
import { formatMAD } from "@/lib/format";
import { deriveWholesaleFromRRP, deriveFromCost, parseTiers } from "@/lib/pricing";
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
  cost_price: number | null;
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  minimum_order: number;
  pack_size: number;
  price_tiers: PriceTier[];
  low_stock_threshold: number;
}

interface CsvPreviewRow {
  line: number;
  name: string;
  sku: string;
  price: number;
  category: string;
  stock: number;
  stockStatus: string; // raw "instock"/"outofstock"
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  tier_6: number | null;
  tier_12: number | null;
  tier_24: number | null;
  minimum_order: number;
  // Presence flags: true ONLY when the CSV column had a non-empty value.
  // Used to safely skip internal pricing fields when not explicitly provided.
  has_pharmacy_price: boolean;
  has_map_price: boolean;
  has_any_tier: boolean;
  status: "ok" | "missing_sku" | "missing_name" | "invalid_price" | "invalid_min_order";
  statusLabel: string;
  willUpdate: boolean;
  // Diagnostic: which sensitive fields will be applied vs skipped.
  appliedFields: string[];
  skippedFields: string[];
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
  cost_price: null,
  rrp_price: null,
  pharmacy_price: null,
  map_price: null,
  minimum_order: 1,
  pack_size: 1,
  price_tiers: [
    { min_qty: 6, price: 0 },
    { min_qty: 12, price: 0 },
    { min_qty: 24, price: 0 },
  ],
  low_stock_threshold: 5,
};

function AdminProducts() {
  const { companyId } = useAuth();
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
    failedRows?: CsvPreviewRow[];
  } | null>(null);
  const [previewRows, setPreviewRows] = useState<CsvPreviewRow[] | null>(null);
  const [previewOpen, setPreviewOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const csvInputRef = useRef<HTMLInputElement>(null);
  const catalogInputRef = useRef<HTMLInputElement>(null);
  const syncWoo = useServerFn(syncWooCommerceProducts);
  const [costDialogOpen, setCostDialogOpen] = useState(false);
  const [costInput, setCostInput] = useState<string>("");
  // Reference cost used for live margin indicators in the pricing form.
  // Not persisted to DB — purely an editing aid.
  const [refCost, setRefCost] = useState<string>("");

  const marginPct = (price: number | null | undefined): string | null => {
    const c = Number(refCost);
    if (!Number.isFinite(c) || c <= 0) return null;
    if (price == null || !Number.isFinite(price) || price <= 0) return null;
    const pct = ((price - c) / c) * 100;
    return `${Math.round(pct)}%`;
  };

  const MarginBadge = ({ price }: { price: number | null | undefined }) => {
    const m = marginPct(price);
    if (!m) return null;
    const c = Number(refCost);
    const ratio = c > 0 && price != null ? (price - c) / c : 0;
    const tone =
      ratio >= 1 ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
      : ratio >= 0.5 ? "bg-sky-500/15 text-sky-700 dark:text-sky-400"
      : ratio > 0 ? "bg-amber-500/15 text-amber-700 dark:text-amber-400"
      : "bg-destructive/15 text-destructive";
    return (
      <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${tone}`}>
        هامش {m}
      </span>
    );
  };

  const applyCostPricing = () => {
    const cost = Number(costInput);
    if (!Number.isFinite(cost) || cost <= 0) {
      toast.error("أدخل تكلفة صالحة");
      return;
    }
    const d = deriveFromCost(cost);
    setForm({
      ...form,
      cost_price: cost,
      price_mad: d.distributor_price,
      rrp_price: d.rrp_price,
      pharmacy_price: d.pharmacy_price,
      map_price: d.map_price,
      price_tiers: d.price_tiers,
    });
    setRefCost(String(cost));
    setCostDialogOpen(false);
    setCostInput("");
    toast.success("تم احتساب جميع الأسعار من التكلفة");
  };

  const handleWooSync = async () => {
    setSyncing(true);
    setImportResult(null);
    try {
      if (!companyId) {
        toast.error("لا توجد شركة مرتبطة بحسابك");
        setSyncing(false);
        return;
      }
      const result = await syncWoo({ data: { companyId } });
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
    if (!companyId) return;
    const { data } = await supabase
      .from("products")
      .select("*")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });
    const rows = (data ?? []).map((p) => ({
      ...p,
      price_tiers: parseTiers((p as { price_tiers?: unknown }).price_tiers),
    })) as Product[];
    setProducts(rows);
  };

  useEffect(() => {
    load();
  }, [companyId]);

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
    setRefCost("");
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
      cost_price: p.cost_price,
      rrp_price: p.rrp_price,
      pharmacy_price: p.pharmacy_price,
      map_price: p.map_price,
      minimum_order: p.minimum_order ?? 1,
      pack_size: p.pack_size ?? 1,
      low_stock_threshold: p.low_stock_threshold ?? 5,
      price_tiers:
        p.price_tiers && p.price_tiers.length > 0
          ? p.price_tiers
          : [
              { min_qty: 6, price: 0 },
              { min_qty: 12, price: 0 },
              { min_qty: 24, price: 0 },
            ],
    });
    // Pre-fill the live margin reference with the persisted cost (if any).
    setRefCost(p.cost_price != null ? String(p.cost_price) : "");
    await loadImages(p.id);
    setOpen(true);
  };

  const ensureProductId = async (): Promise<string | null> => {
    if (editing) return editing.id;
    // Catalog is Woo-only: products must originate from WooCommerce sync
    // (external_id is now NOT NULL). Manual creation is disabled.
    toast.error("لا يمكن إنشاء منتجات يدوياً. المنتجات تُضاف فقط عبر مزامنة WooCommerce.");
    return null;
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
    if (form.minimum_order < 1) {
      toast.error("الحد الأدنى للطلب يجب أن يكون 1 على الأقل");
      return;
    }
    // Pricing hierarchy guardrails:
    //   Cost < Distributor tier < Pharmacy < MAP < RRP
    // Distributor tiers are wholesale and are NOT validated against MAP.
    if (
      form.pharmacy_price != null &&
      form.pharmacy_price > 0
    ) {
      const offendingTier = form.price_tiers.find(
        (t) => t.price > 0 && t.price >= form.pharmacy_price!,
      );
      if (offendingTier) {
        toast.error(
          `سعر الموزع (${offendingTier.min_qty}+) يجب أن يكون أقل من سعر الصيدلية`,
        );
        return;
      }
    }
    if (
      form.pharmacy_price != null &&
      form.pharmacy_price > 0 &&
      form.map_price != null &&
      form.map_price > 0 &&
      form.pharmacy_price >= form.map_price
    ) {
      toast.error("سعر الصيدلية يجب أن يكون أقل من السعر الأدنى المعلن (MAP)");
      return;
    }
    if (
      form.map_price != null &&
      form.map_price > 0 &&
      form.rrp_price != null &&
      form.rrp_price > 0 &&
      form.map_price >= form.rrp_price
    ) {
      toast.error("السعر الأدنى المعلن (MAP) يجب أن يكون أقل من السعر الموصى به (RRP)");
      return;
    }
    if (
      form.cost_price != null &&
      form.cost_price > 0
    ) {
      const offendingTier = form.price_tiers.find(
        (t) => t.price > 0 && t.price <= form.cost_price!,
      );
      if (offendingTier) {
        toast.error(
          `سعر الموزع (${offendingTier.min_qty}+) يجب أن يكون أعلى من التكلفة`,
        );
        return;
      }
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
      cost_price: form.cost_price,
      rrp_price: form.rrp_price,
      pharmacy_price: form.pharmacy_price,
      map_price: form.map_price,
      minimum_order: form.minimum_order,
      pack_size: Math.max(1, form.pack_size || 1),
      price_tiers: form.price_tiers,
      low_stock_threshold: form.low_stock_threshold,
    };
    const { error, data: saved } = editing
      ? await supabase.from("products").update(payload as never).eq("id", editing.id).select("id").maybeSingle()
      : await supabase.from("products").insert(payload as never).select("id").maybeSingle();
    setSaving(false);
    if (error) {
      toast.error("تعذر الحفظ");
      return;
    }
    const productId = (saved as { id?: string } | null)?.id ?? editing?.id;
    if (companyId && productId) {
      if (editing) {
        logFieldChanges(
          { companyId, action: "product_updated", entityType: "product", entityId: productId },
          editing as unknown as Record<string, unknown>,
          payload as unknown as Record<string, unknown>,
          ["name_ar", "price_mad", "stock", "active", "category", "cost_price", "rrp_price", "pharmacy_price", "map_price", "minimum_order", "pack_size", "points_per_unit", "low_stock_threshold", "description_ar"],
        );
      } else {
        logActivity({
          companyId,
          action: "product_created",
          entityType: "product",
          entityId: productId,
          metadata: { name_ar: payload.name_ar },
        });
      }
    }
    toast.success(editing ? "تم تحديث المنتج" : "تمت إضافة المنتج");
    setOpen(false);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("حذف هذا المنتج؟")) return;
    const target = products.find((p) => p.id === id);
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) {
      console.error("Product delete failed:", error);
      const isFk = error.code === "23503" || /foreign key|violates/i.test(error.message);
      toast.error(
        isFk
          ? "لا يمكن حذف المنتج لارتباطه بطلبات أو فواتير سابقة. يمكنك تعطيله بدلاً من حذفه."
          : `تعذر الحذف: ${error.message}`,
      );
      return;
    }
    if (companyId) {
      void logActivity({
        companyId,
        action: "product_deleted",
        entityType: "product",
        entityId: id,
        metadata: {
          name_ar: target?.name_ar ?? null,
          price_mad: target?.price_mad ?? null,
        },
      });
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

  const numOrNull = (v: unknown): number | null => {
    if (v === undefined || v === null) return null;
    const s = String(v).trim();
    if (s === "") return null;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : null;
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
        return;
      }

      // Pre-fetch existing SKUs to mark create vs update in preview
      const skus = rows
        .map((r) => (r.sku ?? "").trim())
        .filter(Boolean);
      const existingSet = new Set<string>();
      if (skus.length > 0) {
        const { data: existing } = await supabase
          .from("products")
          .select("sku")
          .in("sku", skus);
        for (const p of existing ?? []) {
          if (p.sku) existingSet.add(p.sku);
        }
      }

      const preview: CsvPreviewRow[] = rows.map((row, idx) => {
        const sku = (row.sku ?? "").trim();
        const name = (row.name ?? row.name_ar ?? "").trim();
        const rawPrice = (row.price ?? "").toString().trim();
        const rawRrp = (row.rrp_price ?? "").toString().trim();
        const priceSource = rawPrice !== "" ? rawPrice : rawRrp;
        const price = parseFloat(priceSource);
        const stockStatus = (row.stock ?? "").toString().trim().toLowerCase();
        let stock = 0;
        if (stockStatus === "instock") stock = 1;
        else if (stockStatus === "outofstock") stock = 0;
        else {
          const n = parseFloat(stockStatus);
          stock = Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
        }

        // minimum_order: empty → default 1; must be integer >= 1
        const rawMin = (row.minimum_order ?? "").toString().trim();
        let minimum_order = 1;
        let minOrderInvalid = false;
        if (rawMin !== "") {
          const mn = Number(rawMin);
          if (!Number.isFinite(mn) || !Number.isInteger(mn) || mn < 1) {
            minOrderInvalid = true;
          } else {
            minimum_order = mn;
          }
        }

        let status: CsvPreviewRow["status"] = "ok";
        let statusLabel = "OK";
        if (!sku) {
          status = "missing_sku";
          statusLabel = "SKU required";
        } else if (!name) {
          status = "missing_name";
          statusLabel = "Missing name";
        } else if (!Number.isFinite(price) || price < 0) {
          status = "invalid_price";
          statusLabel = "Invalid price";
        } else if (minOrderInvalid) {
          status = "invalid_min_order";
          statusLabel = "Invalid minimum_order";
        }

        return {
          line: idx + 2,
          name,
          sku,
          price: Number.isFinite(price) ? price : NaN,
          category: (row.category ?? "").trim(),
          stock,
          stockStatus,
          rrp_price: numOrNull(row.rrp_price),
          pharmacy_price: numOrNull(row.pharmacy_price),
          map_price: numOrNull(row.map_price),
          tier_6: numOrNull(row.distributor_6),
          tier_12: numOrNull(row.distributor_12),
          tier_24: numOrNull(row.distributor_24),
          minimum_order,
          status,
          statusLabel,
          willUpdate: !!sku && existingSet.has(sku),
        };
      });

      setPreviewRows(preview);
      setPreviewOpen(true);
    } catch (err) {
      toast.error("تعذر قراءة الملف");
      console.error(err);
    } finally {
      setImporting(false);
    }
  };

  const executeCsvImport = async () => {
    if (!previewRows) return;
    setImporting(true);
    const errors: string[] = [];
    let created = 0;
    let updated = 0;

    const valid = previewRows.filter((r) => r.status === "ok");
    for (const r of previewRows) {
      if (r.status !== "ok") {
        errors.push(`السطر ${r.line} (${r.sku || "—"}): ${r.statusLabel}`);
      }
    }

    // Pre-fetch existing rows once with full id+sku map
    const skus = valid.map((r) => r.sku);
    const existingMap = new Map<string, string>();
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
        if (p.sku) existingMap.set(p.sku, p.id);
      }
    }

    for (const r of valid) {
      // Build wholesale fields. Auto-derive missing tiers from RRP.
      const rrp = r.rrp_price ?? r.price;
      const derived = rrp > 0 ? deriveWholesaleFromRRP(rrp) : null;

      const tiers = [
        {
          min_qty: 6,
          price: r.tier_6 ?? derived?.price_tiers[0].price ?? 0,
        },
        {
          min_qty: 12,
          price: r.tier_12 ?? derived?.price_tiers[1].price ?? 0,
        },
        {
          min_qty: 24,
          price: r.tier_24 ?? derived?.price_tiers[2].price ?? 0,
        },
      ];

      const payload = {
        sku: r.sku,
        name_ar: r.name,
        price_mad: r.price,
        category: r.category || null,
        stock: r.stock,
        rrp_price: r.rrp_price,
        pharmacy_price: r.pharmacy_price ?? derived?.pharmacy_price ?? null,
        map_price: r.map_price ?? derived?.map_price ?? null,
        price_tiers: tiers,
        minimum_order: r.minimum_order,
      };

      const existingId = existingMap.get(r.sku);
      if (existingId) {
        const { error } = await supabase
          .from("products")
          .update(payload)
          .eq("id", existingId);
        if (error) {
          errors.push(`السطر ${r.line} (${r.sku}): ${error.message}`);
        } else {
          updated++;
        }
      } else {
        // Catalog is Woo-only: cannot create new products from CSV. Only
        // existing products (matched by SKU) can be updated.
        errors.push(`السطر ${r.line} (${r.sku}): منتج غير موجود — الكاتالوج يُضاف فقط عبر مزامنة WooCommerce`);
      }
    }

    const failedSkus = new Set<string>();
    for (const e of errors) {
      const m = e.match(/\(([^)]+)\)/);
      if (m && m[1] !== "—") failedSkus.add(m[1]);
    }
    const failedRows = previewRows.filter(
      (r) => r.status !== "ok" || failedSkus.has(r.sku),
    );

    setImportResult({
      created,
      updated,
      failed: errors.length,
      errors: errors.slice(0, 20),
      failedRows,
    });
    setPreviewOpen(false);
    setPreviewRows(null);
    setImporting(false);
    if (created + updated > 0) {
      toast.success(`تم: ${created} جديد، ${updated} محدّث`);
      load();
    } else if (errors.length > 0) {
      toast.error("فشل الاستيراد");
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
          // Catalog is Woo-only: cannot create new products from CSV.
          errors.push(`السطر ${lineNum} (${sku}): منتج غير موجود — الكاتالوج يُضاف فقط عبر مزامنة WooCommerce`);
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
    <div className="space-y-6 min-w-0">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">{products.length} منتج</p>
        </div>
        <div className="grid grid-cols-2 sm:flex sm:items-center sm:flex-wrap gap-2 [&>button]:min-w-0 [&>button]:w-full sm:[&>button]:w-auto">
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
            onClick={() => {
              const headers = [
                "name",
                "sku",
                "price",
                "category",
                "stock",
                "rrp_price",
                "pharmacy_price",
                "distributor_6",
                "distributor_12",
                "distributor_24",
                "map_price",
                "minimum_order",
              ];
              const sample = [
                "Magnesium glycinate",
                "MAG-001",
                "180",
                "Supplements",
                "instock",
                "180",
                "126",
                "122",
                "117",
                "108",
                "162",
                "1",
              ];
              const csv = `\uFEFF${headers.join(",")}\n${sample.join(",")}\n`;
              const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
              const url = URL.createObjectURL(blob);
              const a = document.createElement("a");
              a.href = url;
              a.download = "products-template.csv";
              document.body.appendChild(a);
              a.click();
              document.body.removeChild(a);
              URL.revokeObjectURL(url);
            }}
            className="gap-2"
          >
            <Download className="h-4 w-4" />
            قالب CSV
          </Button>
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
                  <Label className="flex items-center justify-between gap-2">
                    <span>السعر (درهم)</span>
                    <MarginBadge price={form.price_mad} />
                  </Label>
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
                  <Label>حد التنبيه للمخزون المنخفض</Label>
                  <Input
                    type="number"
                    min="0"
                    value={form.low_stock_threshold}
                    onChange={(e) =>
                      setForm({ ...form, low_stock_threshold: Number(e.target.value) })
                    }
                  />
                  <p className="text-[11px] text-muted-foreground">
                    سيظهر تنبيه عندما يصبح المخزون أقل من أو يساوي هذا الرقم
                  </p>
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

              {/* === Wholesale pricing engine === */}
              <div className="space-y-3 border rounded-md p-3 bg-muted/30">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <Label className="font-semibold">التسعير بالجملة</Label>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      type="button"
                      variant="default"
                      size="sm"
                      onClick={() => {
                        setCostInput("");
                        setCostDialogOpen(true);
                      }}
                    >
                      تسعير تلقائي (من التكلفة)
                    </Button>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const rrp = form.rrp_price ?? 0;
                        if (!rrp || rrp <= 0) {
                          toast.error("أدخل السعر الموصى به (RRP) أولاً");
                          return;
                        }
                        const d = deriveWholesaleFromRRP(rrp);
                        setForm({
                          ...form,
                          pharmacy_price: d.pharmacy_price,
                          map_price: d.map_price,
                          price_tiers: d.price_tiers,
                        });
                        toast.success("تم احتساب الأسعار من RRP");
                      }}
                    >
                      احتساب من RRP
                    </Button>
                  </div>
                </div>

                <Dialog open={costDialogOpen} onOpenChange={setCostDialogOpen}>
                  <DialogContent className="max-w-sm">
                    <DialogHeader>
                      <DialogTitle>تسعير تلقائي من التكلفة</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">تكلفة المنتج (MAD)</Label>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          autoFocus
                          value={costInput}
                          onChange={(e) => setCostInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              applyCostPricing();
                            }
                          }}
                          placeholder="مثال: 50"
                        />
                      </div>
                      {Number(costInput) > 0 && (() => {
                        const d = deriveFromCost(Number(costInput));
                        return (
                          <div className="text-xs space-y-1 bg-muted/50 rounded p-2">
                            <div className="flex justify-between"><span>سعر الموزع:</span><span className="font-medium">{formatMAD(d.distributor_price)}</span></div>
                            <div className="flex justify-between"><span>سعر الصيدلية:</span><span className="font-medium">{formatMAD(d.pharmacy_price)}</span></div>
                            <div className="flex justify-between"><span>RRP:</span><span className="font-medium">{formatMAD(d.rrp_price)}</span></div>
                            <div className="flex justify-between"><span>MAP:</span><span className="font-medium">{formatMAD(d.map_price)}</span></div>
                            <div className="border-t pt-1 mt-1 space-y-0.5">
                              {d.price_tiers.map((t) => (
                                <div key={t.min_qty} className="flex justify-between">
                                  <span>{t.min_qty}+ وحدة:</span>
                                  <span className="font-medium">{formatMAD(t.price)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="ghost" onClick={() => setCostDialogOpen(false)}>إلغاء</Button>
                      <Button type="button" onClick={applyCostPricing}>تطبيق</Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>


                {/* Product cost — persisted; drives live margin badges */}
                <div className="space-y-1.5">
                  <Label className="text-xs flex items-center justify-between">
                    <span>تكلفة المنتج (للهامش والربح)</span>
                    {Number(refCost) > 0 && (
                      <span className="text-[10px] text-muted-foreground font-normal">
                        {formatMAD(Number(refCost))}
                      </span>
                    )}
                  </Label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={refCost}
                    onChange={(e) => {
                      const v = e.target.value;
                      setRefCost(v);
                      const n = v === "" ? null : Number(v);
                      setForm({
                        ...form,
                        cost_price: Number.isFinite(n as number) ? (n as number) : null,
                      });
                    }}
                    placeholder="مثال: 50 — تُحفظ مع المنتج لاحتساب الربح"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between gap-2">
                      <span>السعر الموصى به (RRP)</span>
                      <MarginBadge price={form.rrp_price} />
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.rrp_price ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        setForm({ ...form, rrp_price: v });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between gap-2">
                      <span>السعر الأدنى المعلن (MAP)</span>
                      <MarginBadge price={form.map_price} />
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.map_price ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        setForm({ ...form, map_price: v });
                      }}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs flex items-center justify-between gap-2">
                      <span>سعر الصيدلية</span>
                      <MarginBadge price={form.pharmacy_price} />
                    </Label>
                    <Input
                      type="number"
                      min="0"
                      step="0.01"
                      value={form.pharmacy_price ?? ""}
                      onChange={(e) => {
                        const v = e.target.value === "" ? null : Number(e.target.value);
                        setForm({ ...form, pharmacy_price: v });
                      }}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">الحد الأدنى للطلب</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.minimum_order}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          minimum_order: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">حجم العبوة (Pack size)</Label>
                    <Input
                      type="number"
                      min="1"
                      value={form.pack_size}
                      onChange={(e) =>
                        setForm({
                          ...form,
                          pack_size: Math.max(1, Number(e.target.value) || 1),
                        })
                      }
                    />
                    <p className="text-[10px] text-muted-foreground">
                      الكمية ستزيد بمضاعفات هذا الرقم في السلة
                    </p>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">طبقات الأسعار حسب الكمية</Label>
                  <div className="space-y-2">
                    {form.price_tiers.map((t, idx) => (
                      <div key={idx} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center">
                        <div className="text-xs text-muted-foreground whitespace-nowrap">
                          {t.min_qty}+ وحدة
                        </div>
                        <Input
                          type="number"
                          min="0"
                          step="0.01"
                          value={t.price}
                          onChange={(e) => {
                            const next = [...form.price_tiers];
                            next[idx] = { ...t, price: Number(e.target.value) || 0 };
                            setForm({ ...form, price_tiers: next });
                          }}
                        />
                        <MarginBadge price={t.price} />
                      </div>
                    ))}
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    الموزع الرئيسي يحصل دائمًا على سعر الطبقة الأعلى. التعديلات
                    اليدوية مسموحة بعد الاحتساب التلقائي.
                  </p>
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

      <Dialog open={previewOpen} onOpenChange={(v) => { if (!v) { setPreviewOpen(false); setPreviewRows(null); } }}>
        <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto" dir="rtl">
          <DialogHeader>
            <DialogTitle>معاينة استيراد CSV</DialogTitle>
          </DialogHeader>
          {previewRows && (
            <div className="space-y-3">
              <div className="text-sm text-muted-foreground flex flex-wrap gap-3">
                <span>الإجمالي: <strong>{previewRows.length}</strong></span>
                <span className="text-primary">
                  جاهز: <strong>{previewRows.filter((r) => r.status === "ok").length}</strong>
                </span>
                <span className="text-muted-foreground">
                  للتحديث: <strong>{previewRows.filter((r) => r.status === "ok" && r.willUpdate).length}</strong>
                </span>
                <span className="text-destructive">
                  أخطاء: <strong>{previewRows.filter((r) => r.status !== "ok").length}</strong>
                </span>
              </div>
              <div className="border rounded-md max-h-[50vh] overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>الاسم</TableHead>
                      <TableHead>SKU</TableHead>
                      <TableHead>السعر</TableHead>
                      <TableHead>الحالة</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRows.map((r, i) => (
                      <TableRow key={i}>
                        <TableCell className="max-w-[200px] truncate">{r.name || "—"}</TableCell>
                        <TableCell className="font-mono text-xs">{r.sku || "—"}</TableCell>
                        <TableCell>{Number.isFinite(r.price) ? formatMAD(r.price) : "—"}</TableCell>
                        <TableCell>
                          {r.status === "ok" ? (
                            <Badge variant={r.willUpdate ? "secondary" : "default"}>
                              {r.willUpdate ? "تحديث" : "جديد"}
                            </Badge>
                          ) : (
                            <Badge variant="destructive">{r.statusLabel}</Badge>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => { setPreviewOpen(false); setPreviewRows(null); }}
              disabled={importing}
            >
              إلغاء
            </Button>
            <Button
              onClick={executeCsvImport}
              disabled={importing || !previewRows?.some((r) => r.status === "ok")}
            >
              {importing && <Loader2 className="h-4 w-4 animate-spin" />}
              تأكيد الاستيراد
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
            ، تم تخطي <span className="font-bold text-destructive">{importResult.failed}</span> سطر.
          </p>
          {importResult.failedRows && importResult.failedRows.length > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="gap-2"
              onClick={() => {
                const headers = [
                  "name","sku","price","category","stock",
                  "rrp_price","pharmacy_price",
                  "distributor_6","distributor_12","distributor_24",
                  "map_price","minimum_order","_error",
                ];
                const escape = (v: unknown) => {
                  const s = v == null || (typeof v === "number" && !Number.isFinite(v)) ? "" : String(v);
                  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
                };
                const lines = [headers.join(",")];
                for (const r of importResult.failedRows!) {
                  lines.push([
                    r.name, r.sku, r.price, r.category, r.stockStatus || r.stock,
                    r.rrp_price, r.pharmacy_price,
                    r.tier_6, r.tier_12, r.tier_24,
                    r.map_price, r.minimum_order, r.statusLabel,
                  ].map(escape).join(","));
                }
                const csv = "\uFEFF" + lines.join("\n") + "\n";
                const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = "failed-rows.csv";
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="h-4 w-4" />
              تنزيل الأسطر الفاشلة ({importResult.failedRows.length})
            </Button>
          )}
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
          <Card key={p.id} className="p-4 shadow-soft flex items-start gap-3 sm:gap-4 overflow-hidden">
            <img
              src={p.image_url ?? ""}
              alt=""
              className="h-14 w-14 sm:h-16 sm:w-16 rounded-md object-cover bg-muted shrink-0"
            />
            <div className="flex-1 min-w-0 overflow-hidden">
              <div className="flex items-center gap-2 min-w-0">
                <h3 className="font-semibold truncate min-w-0 flex-1">{p.name_ar}</h3>
                {!p.active && <Badge variant="secondary" className="shrink-0">معطّل</Badge>}
                {p.stock === 0 ? (
                  <Badge variant="destructive" className="shrink-0">نفد المخزون</Badge>
                ) : p.stock <= (p.low_stock_threshold ?? 5) ? (
                  <Badge variant="outline" className="shrink-0 border-destructive text-destructive">مخزون منخفض</Badge>
                ) : null}
                {p.category && <Badge variant="outline" className="shrink-0 hidden sm:inline-flex">{p.category}</Badge>}
              </div>
              <p className="text-xs text-muted-foreground line-clamp-1 mt-1">
                {p.description_ar}
              </p>
              <div className="flex items-center gap-3 mt-2 text-sm flex-wrap">
                <span className="font-bold text-primary">{formatMAD(p.price_mad)}</span>
                <span className="text-muted-foreground">المخزون: {p.stock}</span>
                <span className="text-muted-foreground">
                  الحد الأدنى: {p.minimum_order}
                </span>
              </div>
            </div>
            <div className="flex gap-1 shrink-0">
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
