import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search,
  Share2,
  ShoppingCart,
  TrendingUp,
  Loader2,
  Copy,
  MessageCircle,
  CheckCircle2,
  Package,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/partner/catalog")({
  component: PartnerCatalogPage,
  head: () => ({ meta: [{ title: "كتالوج الشريك" }] }),
});

interface PartnerProduct {
  id: string;
  name_ar: string;
  price_mad: number;
  rrp_price: number | null;
  image_url: string | null;
  stock: number | null;
  sku: string | null;
  minimum_order: number;
  active: boolean;
}

const COMMISSION_RATE = 0.1; // 10% — keep in sync with default_commission_rate()

function safeMAD(n: number) {
  try {
    return formatMAD(n);
  } catch {
    return `${n.toFixed(2)} MAD`;
  }
}

/** Selling price shown to the end customer.
 *  RRP if defined, otherwise the company price. */
function sellingPrice(p: PartnerProduct): number {
  return p.rrp_price && p.rrp_price > 0 ? Number(p.rrp_price) : Number(p.price_mad);
}

/** Estimated profit per unit = commission on the company price. */
function profitPerUnit(p: PartnerProduct): number {
  return Number(p.price_mad) * COMMISSION_RATE;
}

function PartnerCatalogPage() {
  const { user, companyId } = useAuth();
  const [products, setProducts] = useState<PartnerProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");

  // Share sheet
  const [shareTarget, setShareTarget] = useState<PartnerProduct | null>(null);

  // Order sheet
  const [orderTarget, setOrderTarget] = useState<PartnerProduct | null>(null);
  const [qty, setQty] = useState(1);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("products")
        .select(
          "id, name_ar, price_mad, rrp_price, image_url, stock, sku, minimum_order, active",
        )
        .eq("active", true)
        .order("name_ar", { ascending: true })
        .limit(200);

      if (cancelled) return;
      if (error) {
        toast.error("تعذّر تحميل المنتجات");
        setProducts([]);
      } else {
        setProducts((data ?? []) as PartnerProduct[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name_ar.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  // -------- Share helpers --------
  function buildShareMessage(p: PartnerProduct): string {
    const price = safeMAD(sellingPrice(p));
    return `🌿 ${p.name_ar}\n💰 ${price}\n\nاطلب الآن!`;
  }

  async function copyShare(p: PartnerProduct) {
    const msg = buildShareMessage(p);
    try {
      await navigator.clipboard.writeText(msg);
      toast.success("تم نسخ الرسالة");
    } catch {
      toast.error("تعذّر النسخ");
    }
  }

  function whatsappShare(p: PartnerProduct) {
    const msg = encodeURIComponent(buildShareMessage(p));
    window.open(`https://wa.me/?text=${msg}`, "_blank", "noopener");
  }

  // -------- Quick Order --------
  function openOrder(p: PartnerProduct) {
    setOrderTarget(p);
    setQty(Math.max(1, p.minimum_order || 1));
    setCustomerName("");
    setCustomerPhone("");
  }

  async function submitOrder() {
    if (!orderTarget || !user || !companyId) return;
    if (qty < 1) {
      toast.error("الكمية غير صحيحة");
      return;
    }
    if (orderTarget.stock !== null && orderTarget.stock < qty) {
      toast.error(`المخزون المتاح: ${orderTarget.stock}`);
      return;
    }
    setSubmitting(true);
    try {
      const unitPrice = Number(orderTarget.price_mad);
      const total = unitPrice * qty;
      const orderNumber = `PRT-${Date.now().toString(36).toUpperCase()}`;
      const notes = [
        customerName ? `العميل: ${customerName}` : null,
        customerPhone ? `الهاتف: ${customerPhone}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || null;

      const { data: order, error: orderErr } = await supabase
        .from("orders")
        .insert({
          distributor_id: user.id,
          partner_id: user.id,
          company_id: companyId,
          total_mad: total,
          points_earned: 0,
          status: "pending",
          notes,
          order_number: orderNumber,
        } as never)
        .select("id")
        .single();

      if (orderErr || !order) {
        throw new Error(orderErr?.message ?? "تعذّر إنشاء الطلب");
      }

      const { error: itemErr } = await supabase.from("order_items").insert({
        order_id: order.id,
        product_id: orderTarget.id,
        quantity: qty,
        unit_price_mad: unitPrice,
      } as never);

      if (itemErr) {
        await supabase.from("orders").delete().eq("id", order.id);
        throw new Error(itemErr.message ?? "تعذّر حفظ عناصر الطلب");
      }

      toast.success("تم إنشاء الطلب بنجاح ✅");
      setOrderTarget(null);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "خطأ غير متوقع";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mx-auto w-full max-w-3xl space-y-4 pb-24" dir="rtl">
      <header className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">المنتجات</h1>
        <p className="text-sm text-muted-foreground">
          شارك المنتجات وأنشئ طلبًا في خطوتين فقط.
        </p>
      </header>

      {/* Search */}
      <div className="relative">
        <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="ابحث باسم المنتج أو SKU…"
          className="pr-9"
        />
      </div>

      {loading ? (
        <Card className="flex items-center justify-center p-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </Card>
      ) : filtered.length === 0 ? (
        <Card className="p-10 text-center">
          <Package className="mx-auto mb-3 h-8 w-8 text-muted-foreground" />
          <p className="text-sm font-medium">لا توجد منتجات</p>
        </Card>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {filtered.map((p) => {
            const sp = sellingPrice(p);
            const profit = profitPerUnit(p);
            const outOfStock = p.stock === 0;
            return (
              <li key={p.id}>
                <Card className="overflow-hidden p-0 shadow-soft">
                  <div className="flex gap-3 p-3">
                    <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-muted">
                      {p.image_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={p.image_url}
                          alt={p.name_ar}
                          className="h-full w-full object-cover"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                          <Package className="h-6 w-6" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">
                        {p.name_ar}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {p.sku ?? "—"}
                      </p>
                      <div className="mt-2 flex items-baseline gap-2">
                        <span className="text-base font-bold tracking-tight">
                          {safeMAD(sp)}
                        </span>
                        {outOfStock && (
                          <Badge variant="destructive" className="text-[10px]">
                            نفد
                          </Badge>
                        )}
                      </div>
                      <Badge
                        variant="outline"
                        className="mt-1.5 gap-1 border-success/30 bg-success/10 text-success"
                      >
                        <TrendingUp className="h-3 w-3" />
                        ربح: {safeMAD(profit)}
                      </Badge>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t">
                    <Button
                      variant="ghost"
                      className="h-12 rounded-none gap-2"
                      onClick={() => setShareTarget(p)}
                    >
                      <Share2 className="h-4 w-4" />
                      مشاركة
                    </Button>
                    <Button
                      variant="ghost"
                      className="h-12 rounded-none gap-2 border-r text-primary"
                      disabled={outOfStock}
                      onClick={() => openOrder(p)}
                    >
                      <ShoppingCart className="h-4 w-4" />
                      طلب
                    </Button>
                  </div>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      {/* Share Sheet */}
      <Sheet
        open={!!shareTarget}
        onOpenChange={(o) => !o && setShareTarget(null)}
      >
        <SheetContent side="bottom" className="rounded-t-2xl" dir="rtl">
          <SheetHeader className="text-right">
            <SheetTitle>مشاركة المنتج</SheetTitle>
            <SheetDescription>
              أرسل المنتج لعميلك عبر واتساب أو انسخ الرسالة.
            </SheetDescription>
          </SheetHeader>
          {shareTarget && (
            <div className="mt-4 space-y-4">
              <Card className="p-3">
                <pre className="whitespace-pre-wrap font-sans text-sm leading-6 text-foreground">
                  {buildShareMessage(shareTarget)}
                </pre>
              </Card>
              <div className="grid grid-cols-2 gap-2">
                <Button
                  variant="outline"
                  onClick={() => copyShare(shareTarget)}
                  className="gap-2"
                >
                  <Copy className="h-4 w-4" />
                  نسخ
                </Button>
                <Button
                  onClick={() => whatsappShare(shareTarget)}
                  className="gap-2 bg-[#25D366] text-white hover:bg-[#1ebe57]"
                >
                  <MessageCircle className="h-4 w-4" />
                  واتساب
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Quick Order Sheet */}
      <Sheet
        open={!!orderTarget}
        onOpenChange={(o) => !o && setOrderTarget(null)}
      >
        <SheetContent side="bottom" className="rounded-t-2xl" dir="rtl">
          <SheetHeader className="text-right">
            <SheetTitle>طلب سريع</SheetTitle>
            <SheetDescription>
              أنشئ طلبًا للعميل — العمولة ستُحسب تلقائيًا.
            </SheetDescription>
          </SheetHeader>
          {orderTarget && (
            <div className="mt-4 space-y-4">
              <div className="flex items-center gap-3">
                <div className="h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-muted">
                  {orderTarget.image_url ? (
                    <img
                      src={orderTarget.image_url}
                      alt={orderTarget.name_ar}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-5 w-5" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">
                    {orderTarget.name_ar}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    سعر الوحدة: {safeMAD(Number(orderTarget.price_mad))}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <label className="text-xs font-medium text-muted-foreground">
                  الكمية
                </label>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQty((q) => Math.max(1, q - 1))}
                  >
                    −
                  </Button>
                  <Input
                    type="number"
                    min={1}
                    value={qty}
                    onChange={(e) =>
                      setQty(Math.max(1, Number(e.target.value) || 1))
                    }
                    className="text-center"
                  />
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setQty((q) => q + 1)}
                  >
                    +
                  </Button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    اسم العميل (اختياري)
                  </label>
                  <Input
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="—"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    الهاتف (اختياري)
                  </label>
                  <Input
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="06xxxxxxxx"
                    inputMode="tel"
                  />
                </div>
              </div>

              <Card className="bg-muted/40 p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">الإجمالي</span>
                  <span className="font-bold">
                    {safeMAD(Number(orderTarget.price_mad) * qty)}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">عمولتك المقدّرة</span>
                  <span className="font-semibold text-success">
                    {safeMAD(profitPerUnit(orderTarget) * qty)}
                  </span>
                </div>
              </Card>

              <Button
                className="h-12 w-full gap-2 text-base"
                onClick={submitOrder}
                disabled={submitting}
              >
                {submitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                تأكيد الطلب
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
