import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  CheckCircle2,
  Copy,
  Loader2,
  Package,
  Phone,
  ShoppingBag,
  CreditCard,
  Banknote,
  MessageCircle,
  ChevronLeft,
  Truck,
  Receipt,
  AlertCircle,
  Clock,
  PackageCheck,
  Send,
  Sparkles,
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

export const Route = createFileRoute("/_app/checkout")({
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

type PaymentMethod = "cod" | "bank_transfer" | "manual";

const PAYMENT_OPTIONS: {
  value: PaymentMethod;
  title: string;
  desc: string;
  icon: typeof CreditCard;
}[] = [
  { value: "cod", title: "الدفع عند الاستلام", desc: "ادفع نقداً للمندوب عند التسليم", icon: Banknote },
  { value: "bank_transfer", title: "تحويل بنكي", desc: "حوّل المبلغ ثم أضف رقم العملية", icon: CreditCard },
  { value: "manual", title: "تواصل مع البائع", desc: "سيتواصل معك البائع لتحديد طريقة الدفع", icon: MessageCircle },
];

const STEPS = [
  { id: 1, label: "التواصل والتوصيل", icon: Truck },
  { id: 2, label: "طريقة الدفع", icon: CreditCard },
  { id: 3, label: "المراجعة والتأكيد", icon: Receipt },
] as const;

function CheckoutPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();

  const vendorId = useMemo(() => {
    if (cart.items.length === 0) return null;
    return (cart.items[0] as unknown as { vendor_id?: string }).vendor_id ?? null;
  }, [cart.items]);

  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ id: string; orderNumber: string } | null>(null);

  // Stepper
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [paymentReference, setPaymentReference] = useState("");

  // Touched state — drives inline errors only after the user interacts or
  // tries to advance.
  const [touched, setTouched] = useState<{
    name: boolean;
    phone: boolean;
    address: boolean;
  }>({ name: false, phone: false, address: false });

  // Per-field validation. Phone: allow digits, spaces, +, -, parentheses;
  // require at least 8 digits.
  const errors = useMemo(() => {
    const phoneDigits = contactPhone.replace(/\D/g, "");
    return {
      name: !contactName.trim()
        ? "الاسم الكامل مطلوب"
        : contactName.trim().length < 2
          ? "الاسم قصير جداً"
          : null,
      phone: !contactPhone.trim()
        ? "رقم الهاتف مطلوب"
        : phoneDigits.length < 8
          ? "رقم الهاتف غير صالح"
          : null,
      address: !shippingAddress.trim()
        ? "عنوان التوصيل مطلوب"
        : shippingAddress.trim().length < 5
          ? "العنوان قصير جداً"
          : null,
    };
  }, [contactName, contactPhone, shippingAddress]);

  // Prefill from profile
  useEffect(() => {
    if (!user) return;
    let alive = true;
    (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("full_name, phone, address, address_notes")
        .eq("id", user.id)
        .maybeSingle();
      if (!alive || !data) return;
      if (data.full_name) setContactName((v) => v || data.full_name);
      if (data.phone) setContactPhone((v) => v || data.phone!);
      if (data.address) setShippingAddress((v) => v || data.address!);
      if (data.address_notes) setNotes((v) => v || data.address_notes!);
    })();
    return () => {
      alive = false;
    };
  }, [user]);

  // Vendor
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
        .select("id, name, slug, display_name, logo_url, brand_color, payment_instructions, contact_phone")
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

  const step1Valid = !errors.name && !errors.phone && !errors.address;

  function goNext() {
    if (step === 1) {
      if (!step1Valid) {
        setTouched({ name: true, phone: true, address: true });
        return;
      }
      setStep(2);
    } else if (step === 2) {
      setStep(3);
    }
  }

  async function handlePlaceOrder() {
    if (!user || !vendor || cart.items.length === 0) return;
    if (!step1Valid) {
      setStep(1);
      toast.error("يرجى ملء بيانات التواصل والعنوان");
      return;
    }
    setSubmitting(true);
    try {
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

      const initialPaymentStatus =
        paymentMethod === "bank_transfer" && paymentReference.trim()
          ? "awaiting_confirmation"
          : "pending";

      const { data: orderRow, error: orderErr } = await supabase
        .from("orders")
        .insert({
          company_id: vendor.id,
          buyer_id: user.id,
          order_number: orderNumber,
          total_mad: total,
          status: "pending",
          payment_method: paymentMethod,
          payment_status: initialPaymentStatus,
          payment_reference: paymentMethod === "bank_transfer" ? paymentReference.trim() || null : null,
          notes: compactNotes,
        })
        .select("id, order_number")
        .single();

      if (orderErr || !orderRow) throw new Error(orderErr?.message ?? "تعذر إنشاء الطلب");

      const itemsPayload = cart.items.map((i) => ({
        order_id: orderRow.id,
        product_id: i.id,
        quantity: i.qty,
        unit_price_mad: Number(i.price_mad),
      }));
      const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
      if (itemsErr) throw new Error(itemsErr.message);

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

  if (vendorLoading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Success state
  if (placedOrder) {
    return (
      <div className="mx-auto max-w-2xl" dir="rtl">
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

                {paymentMethod === "bank_transfer" && vendor.payment_instructions && (
                  <div className="rounded-lg border bg-muted/40 p-4">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-sm font-bold">تعليمات الدفع</p>
                      <Button size="sm" variant="ghost" className="h-7 gap-1.5 text-xs" onClick={copyPaymentInstructions}>
                        <Copy className="h-3.5 w-3.5" />
                        نسخ
                      </Button>
                    </div>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-muted-foreground">
                      {vendor.payment_instructions}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="flex-1">
              <Link to="/orders" search={{ focus: placedOrder.id } as never}>
                عرض الطلب
              </Link>
            </Button>
            <Button asChild variant="outline" className="flex-1">
              <Link to="/vendors">متابعة التسوق</Link>
            </Button>
          </div>
        </Card>
      </div>
    );
  }

  // Empty cart
  if (cart.items.length === 0 || !vendor) {
    return (
      <div className="mx-auto max-w-md" dir="rtl">
        <Card className="p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <h1 className="text-xl font-bold">سلتك فارغة</h1>
          <p className="mt-2 text-sm text-muted-foreground">ابدأ بتصفح بائع لإضافة منتجات إلى سلتك.</p>
          <Button asChild className="mt-6 w-full">
            <Link to="/vendors">تصفّح البائعين</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-5" dir="rtl">
      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold sm:text-2xl">إتمام الطلب</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            من <span className="font-medium text-foreground">{vendor.display_name || vendor.name}</span>
          </p>
        </div>
        <Button asChild variant="ghost" size="sm" className="gap-1">
          <Link to="/store/$slug" params={{ slug: vendor.slug }}>
            <ChevronLeft className="h-4 w-4" />
            العودة للمتجر
          </Link>
        </Button>
      </div>

      {/* Sticky Stepper */}
      <div className="sticky top-16 z-20 -mx-4 border-b bg-background/95 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-xl sm:border sm:px-4">
        <ol className="flex items-center justify-between gap-2">
          {STEPS.map((s, idx) => {
            const isDone = step > s.id;
            const isCurrent = step === s.id;
            return (
              <li key={s.id} className="flex flex-1 items-center gap-2">
                <div
                  className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                    isDone
                      ? "bg-success text-success-foreground"
                      : isCurrent
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-muted-foreground"
                  }`}
                  aria-current={isCurrent ? "step" : undefined}
                >
                  {isDone ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                </div>
                <span
                  className={`hidden truncate text-xs font-medium sm:inline ${
                    isCurrent ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
                {idx < STEPS.length - 1 && (
                  <div className={`mx-1 h-px flex-1 ${isDone ? "bg-success" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step 1 — Contact + delivery */}
      {step === 1 && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <Truck className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">بيانات التواصل والتوصيل</h2>
          </div>
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
          <p className="text-[11px] text-muted-foreground">
            ستُحفظ هذه البيانات في حسابك تلقائياً للطلبات القادمة.
          </p>
        </Card>
      )}

      {/* Step 2 — Payment */}
      {step === 2 && (
        <Card className="space-y-4 p-4 sm:p-5">
          <div className="flex items-center gap-2">
            <CreditCard className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">طريقة الدفع</h2>
          </div>
          <div className="grid gap-2">
            {PAYMENT_OPTIONS.map((opt) => {
              const active = paymentMethod === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  className={`flex items-start gap-3 rounded-lg border p-3 text-right transition ${
                    active ? "border-primary bg-primary/5" : "border-border hover:bg-muted/50"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-bold">{opt.title}</p>
                    <p className="text-xs text-muted-foreground">{opt.desc}</p>
                  </div>
                  <div
                    className={`mt-1.5 h-4 w-4 shrink-0 rounded-full border-2 ${
                      active ? "border-primary bg-primary" : "border-muted-foreground"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {paymentMethod === "bank_transfer" && (
            <div className="space-y-3 pt-1">
              {vendor.payment_instructions && (
                <div className="rounded-lg border bg-muted/40 p-3">
                  <div className="mb-1 flex items-center justify-between">
                    <p className="text-xs font-bold">تعليمات التحويل</p>
                    <Button size="sm" variant="ghost" className="h-6 gap-1 text-xs" onClick={copyPaymentInstructions}>
                      <Copy className="h-3 w-3" />
                      نسخ
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                    {vendor.payment_instructions}
                  </p>
                </div>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="ref">رقم/مرجع التحويل (اختياري)</Label>
                <Input
                  id="ref"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="رقم العملية أو اسم المرسل"
                />
                <p className="text-[11px] text-muted-foreground">
                  أضف المرجع بعد إتمام التحويل لتسريع التأكيد.
                </p>
              </div>
            </div>
          )}

          <p className="text-[11px] text-muted-foreground leading-relaxed">
            الدفع يتم مباشرة بينك وبين البائع. المنصة لا تتدخل في عملية الدفع.
          </p>
        </Card>
      )}

      {/* Step 3 — Review */}
      {step === 3 && (
        <div className="space-y-4">
          <Card className="p-4 sm:p-5">
            <div className="flex items-center gap-2 mb-3">
              <Receipt className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold">المراجعة النهائية</h2>
            </div>

            {/* Items */}
            <div className="space-y-2.5">
              {cart.items.map((i) => (
                <div key={i.id} className="flex items-center gap-3">
                  <div className="h-11 w-11 shrink-0 overflow-hidden rounded-md bg-muted">
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

            {/* Summary */}
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">عدد القطع</dt>
                <dd className="font-medium">{cart.totalQty}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">طريقة الدفع</dt>
                <dd className="font-medium">
                  {PAYMENT_OPTIONS.find((p) => p.value === paymentMethod)?.title}
                </dd>
              </div>
              <Separator />
              <div className="flex justify-between text-base">
                <dt className="font-bold">الإجمالي</dt>
                <dd className="font-bold tabular-nums">{formatMAD(total)}</dd>
              </div>
            </dl>
          </Card>

          {/* Recap of contact for confidence */}
          <Card className="p-4 sm:p-5 text-sm">
            <div className="mb-2 flex items-center justify-between">
              <p className="font-bold">التوصيل إلى</p>
              <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setStep(1)}>
                تعديل
              </Button>
            </div>
            <p className="text-muted-foreground">{contactName} · {contactPhone}</p>
            <p className="text-muted-foreground whitespace-pre-line">{shippingAddress}</p>
            {notes && <p className="mt-1 text-xs text-muted-foreground">ملاحظات: {notes}</p>}
          </Card>
        </div>
      )}

      {/* Sticky action bar */}
      <div className="sticky bottom-0 -mx-4 border-t bg-card/95 px-4 py-3 backdrop-blur sm:static sm:mx-0 sm:border-0 sm:bg-transparent sm:p-0">
        <div className="flex items-center gap-2">
          {step > 1 && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={() => setStep((s) => (s - 1) as 1 | 2 | 3)}
              disabled={submitting}
            >
              السابق
            </Button>
          )}
          {step < 3 && (
            <Button size="lg" className="flex-[2]" onClick={goNext}>
              التالي
            </Button>
          )}
          {step === 3 && (
            <Button size="lg" className="flex-[2]" disabled={submitting} onClick={handlePlaceOrder}>
              {submitting ? (
                <>
                  <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                  جارٍ الإرسال...
                </>
              ) : (
                `تأكيد الطلب • ${formatMAD(total)}`
              )}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
