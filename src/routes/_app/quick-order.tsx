import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Loader2, Plus, Trash2, Upload, ShoppingCart, AlertCircle, CheckCircle2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { getUnitPrice, parseTiers, type PriceTier } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/quick-order")({
  component: QuickOrderPage,
  head: () => ({ meta: [{ title: "طلب سريع — بوابة هيرباليفي" }] }),
});

interface Row {
  id: string;
  sku: string;
  qty: number;
}

interface ResolvedRow extends Row {
  status: "pending" | "found" | "not_found" | "inactive" | "out_of_stock";
  product?: {
    id: string;
    name_ar: string;
    price_mad: number;
    image_url: string | null;
    stock: number;
    rrp_price: number | null;
    pharmacy_price: number | null;
    map_price: number | null;
    minimum_order: number;
    price_tiers: PriceTier[];
  };
  unitPrice?: number;
  message?: string;
}

const newRow = (): Row => ({
  id: crypto.randomUUID(),
  sku: "",
  qty: 1,
});

function QuickOrderPage() {
  const { addItem, openCart } = useCart();
  const { partnerType } = useAuth();
  const [rows, setRows] = useState<Row[]>([newRow(), newRow(), newRow()]);
  const [bulkText, setBulkText] = useState("");
  const [resolved, setResolved] = useState<ResolvedRow[] | null>(null);
  const [loading, setLoading] = useState(false);

  const updateRow = (id: string, patch: Partial<Row>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    setResolved(null);
  };
  const removeRow = (id: string) => {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev));
    setResolved(null);
  };
  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const parseBulk = () => {
    const lines = bulkText
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (lines.length === 0) {
      toast.error("الرجاء لصق قائمة المنتجات أولاً");
      return;
    }
    const parsed: Row[] = lines.map((line) => {
      // Accept "SKU,QTY" or "SKU QTY" or "SKU\tQTY" or just "SKU"
      const parts = line.split(/[,\t\s]+/).filter(Boolean);
      const sku = parts[0] ?? "";
      const qty = Number(parts[1] ?? 1);
      return {
        id: crypto.randomUUID(),
        sku,
        qty: Number.isFinite(qty) && qty > 0 ? qty : 1,
      };
    });
    setRows(parsed);
    setBulkText("");
    setResolved(null);
    toast.success(`تم استيراد ${parsed.length} سطر`);
  };

  const validate = async () => {
    const cleanRows = rows.filter((r) => r.sku.trim().length > 0);
    if (cleanRows.length === 0) {
      toast.error("الرجاء إدخال رمز منتج (SKU) واحد على الأقل");
      return;
    }
    setLoading(true);
    try {
      const skus = Array.from(
        new Set(cleanRows.map((r) => r.sku.trim())),
      );
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name_ar, sku, price_mad, image_url, stock, active, rrp_price, pharmacy_price, map_price, minimum_order, price_tiers",
        )
        .in("sku", skus);
      if (error) throw error;
      const bySku = new Map<string, (typeof data)[number]>();
      (data ?? []).forEach((p) => {
        if (p.sku) bySku.set(p.sku, p);
      });

      const results: ResolvedRow[] = cleanRows.map((r) => {
        const found = bySku.get(r.sku.trim());
        if (!found) {
          return { ...r, status: "not_found", message: "غير موجود" };
        }
        if (!found.active) {
          return { ...r, status: "inactive", message: "غير نشط" };
        }
        const product = {
          id: found.id,
          name_ar: found.name_ar,
          price_mad: Number(found.price_mad),
          image_url: found.image_url,
          stock: found.stock,
          rrp_price: found.rrp_price != null ? Number(found.rrp_price) : null,
          pharmacy_price:
            found.pharmacy_price != null ? Number(found.pharmacy_price) : null,
          map_price: found.map_price != null ? Number(found.map_price) : null,
          minimum_order: found.minimum_order,
          price_tiers: parseTiers(found.price_tiers),
        };
        if (product.stock < r.qty) {
          return {
            ...r,
            status: "out_of_stock",
            product,
            message: `المخزون: ${product.stock}`,
          };
        }
        const { unitPrice } = getUnitPrice(product, partnerType, r.qty);
        return { ...r, status: "found", product, unitPrice };
      });
      setResolved(results);
    } catch (err) {
      console.error(err);
      toast.error("تعذّر التحقق من المنتجات");
    } finally {
      setLoading(false);
    }
  };

  const addAllToCart = () => {
    if (!resolved) return;
    const ok = resolved.filter((r) => r.status === "found" && r.product);
    if (ok.length === 0) {
      toast.error("لا توجد منتجات صالحة لإضافتها");
      return;
    }
    ok.forEach((r) => {
      addItem(
        {
          id: r.product!.id,
          name_ar: r.product!.name_ar,
          price_mad: r.product!.price_mad,
          image_url: r.product!.image_url,
          stock: r.product!.stock,
          rrp_price: r.product!.rrp_price,
          pharmacy_price: r.product!.pharmacy_price,
          map_price: r.product!.map_price,
          minimum_order: r.product!.minimum_order,
          price_tiers: r.product!.price_tiers,
        },
        r.qty,
      );
    });
    toast.success(`تمت إضافة ${ok.length} منتج إلى السلة`);
    openCart();
  };

  const validCount = resolved?.filter((r) => r.status === "found").length ?? 0;
  const totalEstimate =
    resolved?.reduce(
      (s, r) => (r.status === "found" && r.unitPrice ? s + r.unitPrice * r.qty : s),
      0,
    ) ?? 0;

  return (
    <div className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold md:text-3xl">طلب سريع</h1>
        <p className="text-sm text-muted-foreground">
          أدخل رموز المنتجات (SKU) والكميات لإضافتها دفعة واحدة إلى السلة.
        </p>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">لصق قائمة (اختياري)</CardTitle>
          <CardDescription>
            سطر لكل منتج بصيغة <code className="rounded bg-muted px-1">SKU,QTY</code> — مثال: <code className="rounded bg-muted px-1">HRB-001,3</code>
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            placeholder={"HRB-001, 3\nHRB-002, 6\nHRB-007, 12"}
            rows={4}
            className="font-mono text-sm"
            dir="ltr"
          />
          <Button variant="secondary" size="sm" onClick={parseBulk}>
            <Upload className="ml-2 h-4 w-4" />
            استيراد إلى الجدول
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-lg">المنتجات</CardTitle>
            <CardDescription>أدخل رمز المنتج والكمية لكل سطر</CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={addRow}>
            <Plus className="ml-2 h-4 w-4" />
            إضافة سطر
          </Button>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="hidden gap-3 px-1 text-xs font-medium text-muted-foreground md:grid md:grid-cols-[1fr_120px_40px]">
            <Label>رمز المنتج (SKU)</Label>
            <Label>الكمية</Label>
            <span />
          </div>
          {rows.map((row) => {
            const res = resolved?.find((r) => r.id === row.id);
            return (
              <div key={row.id} className="space-y-2">
                <div className="grid grid-cols-[1fr_90px_auto] items-center gap-2 md:grid-cols-[1fr_120px_40px]">
                  <Input
                    value={row.sku}
                    onChange={(e) => updateRow(row.id, { sku: e.target.value })}
                    placeholder="HRB-001"
                    dir="ltr"
                    className="font-mono"
                  />
                  <Input
                    type="number"
                    min={1}
                    value={row.qty}
                    onChange={(e) =>
                      updateRow(row.id, { qty: Math.max(1, Number(e.target.value) || 1) })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => removeRow(row.id)}
                    disabled={rows.length <= 1}
                    aria-label="حذف السطر"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
                {res && (
                  <div className="flex flex-wrap items-center gap-2 px-1 text-xs">
                    {res.status === "found" && res.product && res.unitPrice != null && (
                      <>
                        <Badge variant="default" className="gap-1">
                          <CheckCircle2 className="h-3 w-3" />
                          {res.product.name_ar}
                        </Badge>
                        <span className="text-muted-foreground">
                          {formatMAD(res.unitPrice)} × {res.qty} ={" "}
                          <span className="font-semibold text-foreground">
                            {formatMAD(res.unitPrice * res.qty)}
                          </span>
                        </span>
                      </>
                    )}
                    {res.status !== "found" && (
                      <Badge variant="destructive" className="gap-1">
                        <AlertCircle className="h-3 w-3" />
                        {res.message}
                      </Badge>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="space-y-1">
            {resolved ? (
              <>
                <p className="text-sm">
                  منتجات صالحة:{" "}
                  <span className="font-semibold">{validCount}</span> /{" "}
                  {resolved.length}
                </p>
                <p className="text-lg font-bold">
                  الإجمالي التقديري: {formatMAD(totalEstimate)}
                </p>
              </>
            ) : (
              <p className="text-sm text-muted-foreground">
                اضغط "تحقق" لمعاينة الأسعار قبل الإضافة إلى السلة.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={validate} disabled={loading}>
              {loading && <Loader2 className="ml-2 h-4 w-4 animate-spin" />}
              تحقق
            </Button>
            <Button onClick={addAllToCart} disabled={!resolved || validCount === 0}>
              <ShoppingCart className="ml-2 h-4 w-4" />
              إضافة إلى السلة
            </Button>
          </div>
        </CardContent>
      </Card>

      <Separator />
      <p className="text-center text-xs text-muted-foreground">
        لا تعرف رمز المنتج؟{" "}
        <Link to="/products" className="text-primary underline">
          تصفح كتالوج المنتجات
        </Link>
      </p>
    </div>
  );
}
