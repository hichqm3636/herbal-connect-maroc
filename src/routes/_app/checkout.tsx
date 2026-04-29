import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
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

/** Form field wrapper with label, optional hint, and inline error message. */
function FieldWrap({
  id,
  label,
  required,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  required?: boolean;
  hint?: string;
  error?: string | null;
  children: React.ReactNode;
}) {
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <Label htmlFor={id} className="text-xs">
          {label} {required && <span className="text-destructive">*</span>}
        </Label>
        {hint && <span className="text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
      {error && (
        <p
          id={errorId}
          role="alert"
          className="flex items-center gap-1 text-[11px] font-medium text-destructive"
        >
          <AlertCircle className="h-3 w-3" />
          {error}
        </p>
      )}
    </div>
  );
}

function CheckoutPage() {
  const { user } = useAuth();
  const cart = useCart();

  const vendorId = useMemo(() => {
    if (cart.items.length === 0) return null;
    return (cart.items[0] as unknown as { vendor_id?: string }).vendor_id ?? null;
  }, [cart.items]);

  const [vendor, setVendor] = useState<VendorInfo | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [placedOrder, setPlacedOrder] = useState<{ id: string; orderNumber: string } | null>(null);
  const [transferMarked, setTransferMarked] = useState(false);
  const [markingTransfer, setMarkingTransfer] = useState(false);

  // Stepper
  const [step, setStep] = useState<1 | 2 | 3>(1);

  // Form
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [shippingAddress, setShippingAddress] = useState("");
  const [notes, setNotes] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("cod");
  const [paymentReference, setPaymentReference] = useState("");

  // Field refs for scroll-to-first-error
  const nameRef = useRef<HTMLInputElement>(null);
  const phoneRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLTextAreaElement>(null);

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
      setTouched({ name: true, phone: true, address: true });
      setStep(1);
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

  // Success state — celebration + next-steps timeline
  if (placedOrder) {
    // Build payment-method-aware timeline.
    const timeline: { icon: typeof Send; title: string; desc: string; state: "done" | "current" | "pending" }[] = [
      {
        icon: Send,
        title: "تم استلام طلبك",
        desc: `رقم الطلب: ${placedOrder.orderNumber}`,
        state: "done",
      },
      paymentMethod === "bank_transfer"
        ? {
            icon: CreditCard,
            title: paymentReference.trim() ? "في انتظار تأكيد الدفع" : "بانتظار التحويل البنكي",
            desc: paymentReference.trim()
              ? "سيتحقق البائع من التحويل ويؤكد الطلب"
              : "أكمل التحويل وأضف رقم العملية لتسريع التأكيد",
            state: "current",
          }
        : paymentMethod === "cod"
          ? {
              icon: Banknote,
              title: "بانتظار تأكيد البائع",
              desc: "سيراجع البائع طلبك ويؤكده قريباً",
              state: "current",
            }
          : {
              icon: MessageCircle,
              title: "بانتظار تواصل البائع",
              desc: "سيتواصل معك البائع لتحديد طريقة الدفع",
              state: "current",
            },
      {
        icon: PackageCheck,
        title: "التحضير والشحن",
        desc: "سيبدأ البائع بتحضير طلبك بعد التأكيد",
        state: "pending",
      },
      {
        icon: Truck,
        title: "التوصيل",
        desc: paymentMethod === "cod" ? "ادفع نقداً للمندوب عند الاستلام" : "سيتم توصيل طلبك للعنوان المحدد",
        state: "pending",
      },
    ];

    return (
      <div className="mx-auto max-w-2xl space-y-4" dir="rtl">
        {/* Hero */}
        <Card className="overflow-hidden rounded-2xl p-0">
          <div className="relative bg-gradient-to-b from-success/10 to-transparent px-6 pt-8 pb-6 text-center">
            <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-success text-success-foreground shadow-glow">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <h1 className="text-xl font-bold sm:text-2xl">تم إرسال طلبك بنجاح</h1>
            <p className="mt-1.5 text-sm text-muted-foreground">
              رقم الطلب{" "}
              <span className="rounded-md bg-muted px-1.5 py-0.5 font-mono text-xs font-semibold text-foreground">
                {placedOrder.orderNumber}
              </span>
            </p>
          </div>

          {/* Vendor strip */}
          {vendor && (
            <div className="flex items-center gap-3 border-t bg-muted/30 px-5 py-3">
              <div
                className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-lg text-white"
                style={{ backgroundColor: vendor.brand_color }}
              >
                {vendor.logo_url ? (
                  <img src={vendor.logo_url} alt={vendor.display_name} className="h-full w-full object-cover" />
                ) : (
                  <Building2 className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[11px] text-muted-foreground">البائع</p>
                <p className="truncate text-sm font-bold">{vendor.display_name || vendor.name}</p>
              </div>
              {vendor.contact_phone && (
                <Button asChild size="sm" variant="outline" className="gap-1.5">
                  <a href={`tel:${vendor.contact_phone}`}>
                    <Phone className="h-3.5 w-3.5" />
                    اتصال
                  </a>
                </Button>
              )}
            </div>
          )}
        </Card>

        {/* Timeline */}
        <Card className="rounded-2xl p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">الخطوات القادمة</h2>
          </div>
          <ol className="relative space-y-5">
            {timeline.map((item, idx) => {
              const isDone = item.state === "done";
              const isCurrent = item.state === "current";
              const Icon = item.icon;
              const isLast = idx === timeline.length - 1;
              return (
                <li key={idx} className="relative flex gap-3">
                  {/* Connector */}
                  {!isLast && (
                    <span
                      aria-hidden="true"
                      className={`absolute right-4 top-9 h-[calc(100%-0.5rem)] w-px ${
                        isDone ? "bg-success" : "bg-border"
                      }`}
                    />
                  )}
                  <div
                    className={`relative z-10 flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors ${
                      isDone
                        ? "bg-success text-success-foreground"
                        : isCurrent
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                          : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1 pt-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className={`text-sm font-bold ${isCurrent ? "text-foreground" : isDone ? "text-foreground/80" : "text-muted-foreground"}`}>
                        {item.title}
                      </p>
                      {isCurrent && (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          الآن
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{item.desc}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </Card>

        {/* Bank-transfer reminder card */}
        {paymentMethod === "bank_transfer" && vendor?.payment_instructions && (
          <Card className="rounded-2xl border-primary/30 bg-primary/[0.03] p-5 sm:p-6">
            <div className="mb-3 flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-bold">تفاصيل التحويل</h2>
            </div>
            <div className="rounded-xl border bg-card p-3.5">
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                {vendor.payment_instructions}
              </p>
            </div>
            <Button onClick={copyPaymentInstructions} className="mt-3 w-full gap-1.5">
              <Copy className="h-3.5 w-3.5" />
              نسخ تعليمات التحويل
            </Button>
          </Card>
        )}

        {/* Action buttons */}
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button asChild size="lg" className="flex-1">
            <Link to="/orders" search={{ focus: placedOrder.id } as never}>
              عرض الطلب
            </Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="flex-1">
            <Link to="/vendors">متابعة التسوق</Link>
          </Button>
        </div>
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
      <div className="sticky top-16 z-20 -mx-4 border-b bg-background/95 px-4 py-3.5 backdrop-blur sm:mx-0 sm:rounded-2xl sm:border sm:px-5 sm:shadow-sm">
        <ol className="flex items-center gap-1.5 sm:gap-2">
          {STEPS.map((s, idx) => {
            const isDone = step > s.id;
            const isCurrent = step === s.id;
            return (
              <li key={s.id} className="flex flex-1 items-center gap-2 last:flex-none">
                <div className="flex items-center gap-2 min-w-0">
                  <div
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                      isDone
                        ? "bg-success text-success-foreground"
                        : isCurrent
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/15"
                          : "bg-muted text-muted-foreground"
                    }`}
                    aria-current={isCurrent ? "step" : undefined}
                  >
                    {isDone ? <CheckCircle2 className="h-4 w-4" /> : s.id}
                  </div>
                  <span
                    className={`hidden truncate text-xs font-semibold sm:inline ${
                      isCurrent ? "text-foreground" : isDone ? "text-foreground/70" : "text-muted-foreground"
                    }`}
                  >
                    {s.label}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`h-0.5 flex-1 rounded-full transition-colors ${isDone ? "bg-success" : "bg-border"}`} />
                )}
              </li>
            );
          })}
        </ol>
      </div>

      {/* Step 1 — Contact + delivery */}
      {step === 1 && (
        <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 border-b pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Truck className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">بيانات التواصل والتوصيل</h2>
              <p className="text-[11px] text-muted-foreground">
                نحتاج هذه المعلومات للتوصيل والتنسيق مع البائع
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FieldWrap
              id="name"
              label="الاسم الكامل"
              required
              error={touched.name ? errors.name : null}
            >
              <Input
                id="name"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                placeholder="اسم المسؤول عن الطلب"
                aria-invalid={touched.name && !!errors.name}
                className={touched.name && errors.name ? "border-destructive focus-visible:ring-destructive/30" : ""}
              />
            </FieldWrap>

            <FieldWrap
              id="phone"
              label="رقم الهاتف"
              required
              error={touched.phone ? errors.phone : null}
            >
              <Input
                id="phone"
                type="tel"
                value={contactPhone}
                onChange={(e) => setContactPhone(e.target.value)}
                onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                placeholder="+212 6XX XXX XXX"
                dir="ltr"
                aria-invalid={touched.phone && !!errors.phone}
                className={touched.phone && errors.phone ? "border-destructive focus-visible:ring-destructive/30" : ""}
              />
            </FieldWrap>
          </div>

          <FieldWrap
            id="address"
            label="عنوان التوصيل"
            required
            error={touched.address ? errors.address : null}
          >
            <Textarea
              id="address"
              value={shippingAddress}
              onChange={(e) => setShippingAddress(e.target.value)}
              onBlur={() => setTouched((t) => ({ ...t, address: true }))}
              placeholder="العنوان الكامل، المدينة، المنطقة"
              rows={2}
              aria-invalid={touched.address && !!errors.address}
              className={touched.address && errors.address ? "border-destructive focus-visible:ring-destructive/30" : ""}
            />
          </FieldWrap>

          <FieldWrap id="notes" label="ملاحظات إضافية" hint="اختياري">
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="وقت التوصيل المفضل، تعليمات خاصة..."
              rows={2}
              maxLength={500}
            />
          </FieldWrap>

          <div className="flex items-start gap-2 rounded-xl bg-muted/50 p-3 text-[11px] text-muted-foreground">
            <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
            <p>ستُحفظ هذه البيانات في حسابك تلقائياً للطلبات القادمة.</p>
          </div>
        </Card>
      )}

      {/* Step 2 — Payment */}
      {step === 2 && (
        <Card className="space-y-5 rounded-2xl p-5 sm:p-6">
          <div className="flex items-center gap-2 border-b pb-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <CreditCard className="h-4 w-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold leading-tight">طريقة الدفع</h2>
              <p className="text-[11px] text-muted-foreground">
                اختر الطريقة الأنسب لك — الدفع يتم مباشرة مع البائع
              </p>
            </div>
          </div>

          <div className="grid gap-2.5">
            {PAYMENT_OPTIONS.map((opt) => {
              const active = paymentMethod === opt.value;
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPaymentMethod(opt.value)}
                  aria-pressed={active}
                  className={`group flex items-start gap-3 rounded-xl border p-3.5 text-right transition-all ${
                    active
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-border hover:border-primary/40 hover:bg-muted/40"
                  }`}
                >
                  <div
                    className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-lg transition-colors ${
                      active ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold">{opt.title}</p>
                    <p className="text-xs text-muted-foreground leading-relaxed">{opt.desc}</p>
                  </div>
                  <div
                    className={`mt-1.5 h-4 w-4 shrink-0 rounded-full border-2 transition-colors ${
                      active ? "border-primary bg-primary" : "border-muted-foreground/40 group-hover:border-primary/40"
                    }`}
                  />
                </button>
              );
            })}
          </div>

          {/* Bank-transfer block: prominent CTA + steps */}
          {paymentMethod === "bank_transfer" && (
            <div className="space-y-4 rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-4">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-primary text-primary-foreground">
                  <CreditCard className="h-3.5 w-3.5" />
                </div>
                <h3 className="text-sm font-bold">تعليمات التحويل البنكي</h3>
              </div>

              {vendor.payment_instructions ? (
                <div className="rounded-xl border bg-card p-3.5">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {vendor.payment_instructions}
                  </p>
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    className="mt-3 w-full gap-1.5"
                    onClick={copyPaymentInstructions}
                  >
                    <Copy className="h-3.5 w-3.5" />
                    نسخ تعليمات التحويل
                  </Button>
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-3.5 text-xs text-muted-foreground">
                  لم يضف البائع تعليمات تحويل بعد. سيتواصل معك مباشرة لإرسال التفاصيل.
                </div>
              )}

              {/* Step list — what to do */}
              <ol className="space-y-2 text-xs">
                {[
                  "انسخ تعليمات التحويل أعلاه",
                  "نفّذ التحويل من تطبيق بنكك",
                  "أضف رقم العملية أدناه (اختياري لكن يُسرّع التأكيد)",
                  "اضغط «تأكيد الطلب» — سيتم إخطار البائع فوراً",
                ].map((line, i) => (
                  <li key={i} className="flex items-start gap-2">
                    <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[10px] font-bold text-primary">
                      {i + 1}
                    </span>
                    <span className="text-muted-foreground leading-relaxed">{line}</span>
                  </li>
                ))}
              </ol>

              <FieldWrap id="ref" label="رقم / مرجع التحويل" hint="اختياري">
                <Input
                  id="ref"
                  value={paymentReference}
                  onChange={(e) => setPaymentReference(e.target.value)}
                  placeholder="رقم العملية أو اسم المرسل"
                />
              </FieldWrap>
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
