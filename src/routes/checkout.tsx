import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowLeft,
  Building2,
  CheckCircle2,
  Copy,
  Loader2,
  Package,
  Phone,
  ShoppingBag,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart } from "@/hooks/useCart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "إتمام الطلب — Nexora" },
      { name: "description", content: "أكمل طلبك من البائع المختار." },
    ],
  }),
});

interface VendorInfo {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  brand_color: string;
  payment_instructions: string;
  contact_phone: string | null;
}

function CheckoutPage() {
  const { session, user, loading: authLoading, isClient, marketplaceRole } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();

  const vendorId = useMemo(() => {
    if (cart.items.length === 0) return null;
    return (
      (cart.items[0] as unknown as { vendor_id?: string }).vendor_id ?? null
    );
  }, [cart.items]);

  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{
    id: string;
    orderNumber: string;
  } | null>(null);

  // Form state
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");

  // Auth + role gating: must be signed in AND marketplace role === client.
  useEffect(() => {
    if (authLoading) return;
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (!isClient) {
      navigate({ to: homeForRole(marketplaceRole) });
    }
  }, [authLoading, session, isClient, marketplaceRole, navigate]);

  // Load vendor
  useEffect(() => {
    if (!vendorId) {
      setVendorLoading(false);
      return;
    }
    let alive = true;
    setVendorLoading(true);
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select(
          "id, name, slug, display_name, logo_url, brand_color, payment_instructions, contact_phone",
        )
        .eq("id", vendorId)
        .maybeSingle();
      if (!alive) return;
      setVendor((data as VendorInfo | null) ?? null);
      setVendorLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [vendorId]);

  const total = useMemo(
    () => cart.items.reduce((s, i) => s + Number(i.price_mad) * i.qty, 0),
    [cart.items],
  );

  async function handlePlaceOrder() {
    if (!user || !vendor || cart.items.length === 0) return;
    if (!contactName.trim() || !contactPhone.trim() || !shippingAddress.trim()) {
      toast.error("يرجى ملء بيانات التواصل والعنوان");
      return;
    }
    setSubmitting(true);
    try {
      // Generate order number client-side: NX-YYYYMMDD-xxxx
      const now = new Date();
      const ymd =
        now.getFullYear().toString() +
        (now.getMonth() + 1).toString().padStart(2, "0") +
        now.getDate().toString().padStart(2, "0");
      const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
      const orderNumber = `NX-${ymd}-${rand}`;

      const compactNotes = [
        `الاسم: ${contactName.trim()}`,
        `الهاتف: ${contactPhone.trim()}`,
        `العنوان: ${shippingAddress.trim()}`,
        notes.trim() ? `ملاحظات: ${notes.trim()}` : null,
      ]
        .filter(Boolean)
        .join("\n");

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          company_id: vendor.id,
          distributor_id: user.id,
          order_number: orderNumber,
          total_mad: total,
          status: "pending",
          payment_method: "manual",
          notes: compactNotes,
        })
        .select("id, order_number")
        .single();

      if (orderErr || !orderRow) {
        throw new Error(orderErr?.message ?? "تعذر إنشاء الطلب");
      }

      const itemsPayload = cart.items.map((i) => ({
        order_id: orderRow.id,
        product_id: i.id,
        quantity: i.qty,
        unit_price_mad: Number(i.price_mad),
      }));
      const { error: itemsErr } = await supabase
        .from("order_items")
        .insert(itemsPayload);
      if (itemsErr) {
        throw new Error(itemsErr.message);
      }

      setPlacedOrder({ id: orderRow.id, orderNumber: orderRow.order_number });
      cart.clear();
      toast.success("تم إرسال الطلب بنجاح");
    } catch (err) {
      console.error("[checkout] place order failed", err);
      toast.error(err instanceof Error ? err.message : "تعذر إرسال الطلب");
    } finally {
      setSubmitting(false);
    }
  }

  function copyPaymentInstructions() {
    if (!vendor?.payment_instructions) return;
    navigator.clipboard.writeText(vendor.payment_instructions);
    toast.success("تم نسخ تعليمات الدفع");
  }

  if (authLoading || vendorLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Success state
  if (placedOrder) {
    return (
      <div className="min-h-screen bg-gradient-soft" dir="rtl">
        <main className="mx-auto max-w-2xl px-4 py-8">
          <Card className="p-6 sm:p-8">
            <div className="flex flex-col items-center text-center">
              <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-success/10">
                <CheckCircle2 className="h-9 w-9 text-success" />
              </div>
              <h1 className="text-xl font-bold sm:text-2xl">تم إرسال طلبك</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                رقم الطلب: <span className="font-mono">{placedOrder.orderNumber}</span>
              </p>
            </div>

            {vendor && (
              <>
                <Separator className="my-6" />
                <div className="space-y-4">
                  <div className="flex items-center gap-3">
                    <div
                      className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-white"
                      style={{ backgroundColor: vendor.brand_color }}
                    >
                      {vendor.logo_url ? (
                        <img src={vendor.logo_url} alt={vendor.display_name} className="h-full w-full object-cover" />
                      ) : (
                        <Building2 className="h-6 w-6" />
                      )}
                    </div>
                    <div>
                      <p className="text-sm text-muted-foreground">البائع</p>
                      <p className="font-bold">{vendor.display_name || vendor.name}</p>
                    </div>
                  </div>

                  {vendor.contact_phone && (
                    <a
                      href={`tel:${vendor.contact_phone}`}
                      className="flex items-center gap-2 rounded-lg border bg-card p-3 text-sm hover:bg-accent"
                    >
                      <Phone className="h-4 w-4 text-primary" />
                      <span className="font-medium">{vendor.contact_phone}</span>
                      <span className="mr-auto text-xs text-muted-foreground">اتصل بالبائع</span>
                    </a>
                  )}

                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-bold">تعليمات الدفع</p>
                      {vendor.payment_instructions && (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 gap-1.5 text-xs"
                          onClick={copyPaymentInstructions}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          نسخ
                        </Button>
                      )}
                    </div>
                    {vendor.payment_instructions ? (
                      <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                        {vendor.payment_instructions}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground">
                        سيتواصل معك البائع قريباً لتأكيد الطلب وترتيب الدفع والتوصيل.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            <div className="mt-6 flex flex-col gap-2 sm:flex-row">
              <Button asChild className="flex-1">
                <Link to="/vendors">تصفّح بائعين آخرين</Link>
              </Button>
              <Button asChild variant="outline" className="flex-1">
                <Link to="/">الرئيسية</Link>
              </Button>
            </div>
          </Card>
        </main>
      </div>
    );
  }

  // Empty cart
  if (cart.items.length === 0 || !vendor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4" dir="rtl">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">سلتك فارغة</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            ابدأ بتصفح بائع لإضافة منتجات إلى سلتك.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/vendors">تصفّح البائعين</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft" dir="rtl">
      <header className="sticky top-0 z-10 border-b bg-card/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/store/$slug"
            params={{ slug: vendor.slug }}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span>العودة للمتجر</span>
          </Link>
          <h1 className="text-base font-bold sm:text-lg">إتمام الطلب</h1>
          <div className="w-16" />
        </div>
      </header>

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        {/* Vendor card */}
        <Card className="p-4">
          <div className="flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl text-white"
              style={{ backgroundColor: vendor.brand_color }}
            >
              {vendor.logo_url ? (
                <img src={vendor.logo_url} alt={vendor.display_name} className="h-full w-full object-cover" />
              ) : (
                <Building2 className="h-6 w-6" />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground">طلب من</p>
              <p className="truncate font-bold">{vendor.display_name || vendor.name}</p>
            </div>
          </div>
        </Card>

        {/* Items */}
        <Card className="p-4">
          <h2 className="mb-3 text-sm font-bold">منتجاتك ({cart.totalQty})</h2>
          <div className="space-y-3">
            {cart.items.map((i) => (
              <div key={i.id} className="flex items-center gap-3">
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-md bg-muted">
                  {i.image_url ? (
                    <img src={i.image_url} alt={i.name_ar} className="h-full w-full object-cover" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-5 w-5 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{i.name_ar}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatMAD(Number(i.price_mad))} × {i.qty}
                  </p>
                </div>
                <p className="text-sm font-bold tabular-nums">
                  {formatMAD(Number(i.price_mad) * i.qty)}
                </p>
              </div>
            ))}
          </div>
          <Separator className="my-4" />
          <div className="flex items-center justify-between">
            <span className="text-sm text-muted-foreground">الإجمالي</span>
            <span className="text-lg font-bold">{formatMAD(total)}</span>
          </div>
        </Card>

        {/* Contact + delivery */}
        <Card className="space-y-4 p-4">
          <h2 className="text-sm font-bold">بيانات التواصل والتوصيل</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="name">الاسم الكامل *</Label>
              <Input
                id="name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                placeholder="اسم المسؤول عن الطلب"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="phone">رقم الهاتف *</Label>
              <Input
                id="phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                placeholder="+212 6XX XXX XXX"
              />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="address">عنوان التوصيل *</Label>
            <Textarea
              id="address"
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              placeholder="العنوان الكامل، المدينة، المنطقة"
              rows={2}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="notes">ملاحظات إضافية (اختياري)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="وقت التوصيل المفضل، تعليمات خاصة..."
              rows={2}
              maxLength={500}
            />
          </div>
        </Card>

        {/* Payment notice */}
        <Card className="border-primary/30 bg-primary/5 p-4">
          <p className="text-sm font-bold">طريقة الدفع: تواصل مباشر مع البائع</p>
          <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
            بعد إرسال الطلب، سيتواصل معك البائع لتأكيد التفاصيل وترتيب الدفع
            (تحويل بنكي، الدفع عند الاستلام، أو حسب اتفاقكما). المنصة لا تتدخل
            في عملية الدفع.
          </p>
        </Card>

        <div className="sticky bottom-0 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
          <Button
            size="lg"
            className="w-full"
            disabled={submitting}
            onClick={handlePlaceOrder}
          >
            {submitting ? (
              <>
                <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                جارٍ الإرسال...
              </>
            ) : (
              `إرسال الطلب • ${formatMAD(total)}`
            )}
          </Button>
        </div>
      </main>
    </div>
  );
}
