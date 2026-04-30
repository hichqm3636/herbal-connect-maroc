import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
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
  Lock,
  ShieldCheck,
  Zap,
  Headphones,
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
import { buildWhatsappLink } from "@/utils/whatsapp";
import { track } from "@/lib/analytics";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/checkout")({
  component: CheckoutPage,
  head: () => ({
    meta: [
      { title: "إتمام الطلب — Nexora" },
      { name: "description", content: "أكمل طلبك من البائع المختار في خطوة واحدة." },
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

  // Friction tracking — first field interaction (fires once)
  const firstFocusRef = useRef(false);
  const trackFirstFocus = (field: string) => {
    if (firstFocusRef.current || !vendor) return;
    firstFocusRef.current = true;
    try {
      track("checkout_field_focus", {
        vendor_id: vendor.id,
        product_id: cart.items[0]?.id ?? null,
        field,
        user_id: user?.id ?? null,
      });
    } catch {
      /* noop */
    }
  };

  const [touched, setTouched] = useState<{
    name: boolean;
    phone: boolean;
    address: boolean;
  }>({ name: false, phone: false, address: false });

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

  const formValid = !errors.name && !errors.phone && !errors.address;

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

  // -------- Analytics --------
  const viewedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!vendor || cart.items.length === 0) return;
    const key = `${vendor.id}:${user?.id ?? "anon"}:${cart.items.length}`;
    if (viewedRef.current === key) return;
    viewedRef.current = key;
    track("checkout_view", {
      product_id: cart.items.map((i) => i.id).join(","),
      vendor_id: vendor.id,
      price: total,
      user_id: user?.id ?? null,
    });
  }, [vendor, cart.items, user?.id, total]);

  function focusFirstError() {
    const target =
      (errors.name && nameRef.current) ||
      (errors.phone && phoneRef.current) ||
      (errors.address && addressRef.current) ||
      null;
    if (!target) return;
    requestAnimationFrame(() => {
      target.scrollIntoView({ behavior: "smooth", block: "center" });
      setTimeout(() => target.focus({ preventScroll: true }), 250);
    });
  }

  async function handlePlaceOrder() {
    if (!user || !vendor || cart.items.length === 0) return;
    if (!formValid) {
      setTouched({ name: true, phone: true, address: true });
      focusFirstError();
      try {
        const failed = [
          errors.name && "name",
          errors.phone && "phone",
          errors.address && "address",
        ].filter(Boolean);
        track("checkout_validation_failed", {
          vendor_id: vendor.id,
          product_id: cart.items[0]?.id ?? null,
          fields: failed,
          user_id: user?.id ?? null,
        });
      } catch {
        /* noop */
      }
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

      try {
        // Emit one event per product so product_id is always a real product reference.
        for (const i of cart.items) {
          track("checkout_completed", {
            vendor_id: vendor.id,
            product_id: i.id,
            price: Number(i.price_mad) * i.qty,
            user_id: user.id,
            order_id: orderRow.id,
            order_number: orderRow.order_number,
            quantity: i.qty,
          });
        }
      } catch {
        /* never break checkout on analytics */
      }
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

  async function markTransferDone() {
    if (!placedOrder || markingTransfer || transferMarked) return;
    setMarkingTransfer(true);
    try {
      const { error } = await supabase
        .from("orders")
        .update({ payment_status: "awaiting_confirmation" })
        .eq("id", placedOrder.id);
      if (error) throw error;
      setTransferMarked(true);
      toast.success("تم إعلام البائع بأنك أتممت التحويل");
    } catch (err) {
      console.error("[checkout] mark transfer failed", err);
      toast.error("تعذر تحديث حالة الدفع");
    } finally {
      setMarkingTransfer(false);
    }
  }

  // -------- Abandonment WhatsApp fallback --------
  // Build a prefilled WhatsApp message that summarises the cart so the buyer
  // can complete the order via chat if they hit a blocker.
  const whatsappFallbackHref = useMemo(() => {
    if (!vendor?.contact_phone || cart.items.length === 0) return "";
    const itemsLines = cart.items
      .map((i) => `- ${i.name_ar} ×${i.qty}`)
      .join("\n");
    const message = `السلام عليكم،
أرغب في إتمام طلب ولكنني أحتاج مساعدة:

🏬 المتجر: ${vendor.display_name || vendor.name}
🛒 المنتجات:
${itemsLines}

💰 الإجمالي: ${formatMAD(total)}
${contactName.trim() ? `👤 الاسم: ${contactName.trim()}` : ""}
${contactPhone.trim() ? `📞 الهاتف: ${contactPhone.trim()}` : ""}
${shippingAddress.trim() ? `📍 العنوان: ${shippingAddress.trim()}` : ""}

شكراً لكم.`;
    return buildWhatsappLink(vendor.contact_phone, message);
  }, [vendor, cart.items, total, contactName, contactPhone, shippingAddress]);

  function handleWhatsappFallback() {
    if (!vendor) return;
    try {
      track("checkout_whatsapp_fallback", {
        product_id: cart.items.map((i) => i.id).join(","),
        vendor_id: vendor.id,
        price: total,
        user_id: user?.id ?? null,
      });
    } catch {
      /* noop */
    }
  }

  // -------- Early returns --------
  if (vendorLoading) {
    return (
      <div className="flex items-center justify-center py-20" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Success state — celebration + next-steps timeline
  if (placedOrder) {
    const timeline: {
      icon: typeof Send;
      title: string;
      desc: string;
      eta: string;
      state: "done" | "current" | "pending";
    }[] = [
      {
        icon: Send,
        title: "تم استلام طلبك",
        desc: `رقم الطلب: ${placedOrder.orderNumber}`,
        eta: "الآن",
        state: "done",
      },
      paymentMethod === "bank_transfer"
        ? {
            icon: CreditCard,
            title: transferMarked
              ? "بانتظار تأكيد البائع للتحويل"
              : paymentReference.trim()
                ? "في انتظار تأكيد الدفع"
                : "بانتظار التحويل البنكي",
            desc: transferMarked
              ? "تم إعلام البائع — سيتحقق من التحويل ويؤكد الطلب"
              : paymentReference.trim()
                ? "سيتحقق البائع من التحويل ويؤكد الطلب"
                : "أكمل التحويل وأضف رقم العملية لتسريع التأكيد",
            eta: "خلال ساعات",
            state: "current",
          }
        : paymentMethod === "cod"
          ? {
              icon: Banknote,
              title: "بانتظار تأكيد البائع",
              desc: "سيراجع البائع طلبك ويؤكده قريباً",
              eta: "خلال ساعات",
              state: "current",
            }
          : {
              icon: MessageCircle,
              title: "بانتظار تواصل البائع",
              desc: "سيتواصل معك البائع لتحديد طريقة الدفع",
              eta: "خلال 24 ساعة",
              state: "current",
            },
      {
        icon: PackageCheck,
        title: "التحضير والشحن",
        desc: "سيبدأ البائع بتحضير طلبك بعد التأكيد",
        eta: "1–2 يوم",
        state: "pending",
      },
      {
        icon: Truck,
        title: "التوصيل",
        desc: paymentMethod === "cod" ? "ادفع نقداً للمندوب عند الاستلام" : "سيتم توصيل طلبك للعنوان المحدد",
        eta: "2–5 أيام",
        state: "pending",
      },
    ];

    return (
      <div className="mx-auto max-w-2xl space-y-4" dir="rtl">
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

        <Card className="rounded-2xl p-4 sm:p-6">
          <div className="mb-3.5 flex items-center gap-2 sm:mb-4">
            <Clock className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-bold">الخطوات القادمة</h2>
          </div>
          <ol className="relative space-y-4 sm:space-y-5">
            {timeline.map((item, idx) => {
              const isDone = item.state === "done";
              const isCurrent = item.state === "current";
              const Icon = item.icon;
              const isLast = idx === timeline.length - 1;
              return (
                <li key={idx} className="relative flex gap-3">
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
                    <div className="flex flex-wrap items-center gap-1.5">
                      <p className={`text-sm font-bold ${isCurrent ? "text-foreground" : isDone ? "text-foreground/80" : "text-muted-foreground"}`}>
                        {item.title}
                      </p>
                      {isCurrent ? (
                        <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-semibold text-primary">
                          الآن
                        </span>
                      ) : (
                        <span
                          className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                            isDone ? "bg-success/10 text-success" : "bg-muted text-muted-foreground"
                          }`}
                        >
                          <Clock className="h-2.5 w-2.5" />
                          {item.eta}
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

        {paymentMethod === "bank_transfer" && (
          transferMarked ? (
            <Card className="rounded-2xl border-success/40 bg-success/[0.06] p-4 sm:p-6">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success text-success-foreground">
                  <Check className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="text-sm font-bold">بانتظار التأكيد</h2>
                    <span className="inline-flex items-center gap-1 rounded-full bg-warning/15 px-2 py-0.5 text-[10px] font-semibold text-warning-foreground">
                      <Clock className="h-2.5 w-2.5" />
                      خلال ساعات
                    </span>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                    أبلغتنا بإتمام التحويل وأُخطر البائع. سيتحقق من العملية ويؤكد طلبك قريباً.
                  </p>
                </div>
              </div>
              <Button disabled className="mt-3 w-full gap-1.5" variant="outline">
                <Check className="h-4 w-4" />
                تم الإعلام بالتحويل
              </Button>
            </Card>
          ) : (
            <Card className="rounded-2xl border-primary/30 bg-primary/[0.03] p-4 sm:p-6">
              <div className="mb-3 flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">تفاصيل التحويل</h2>
              </div>
              {vendor?.payment_instructions ? (
                <div className="rounded-xl border bg-card p-3.5">
                  <p className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
                    {vendor.payment_instructions}
                  </p>
                </div>
              ) : (
                <div className="rounded-xl border bg-card p-3.5 text-xs text-muted-foreground">
                  لم يضف البائع تعليمات تحويل بعد. سيتواصل معك مباشرة لإرسال التفاصيل.
                </div>
              )}
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {vendor?.payment_instructions && (
                  <Button variant="outline" onClick={copyPaymentInstructions} className="gap-1.5">
                    <Copy className="h-3.5 w-3.5" />
                    نسخ التعليمات
                  </Button>
                )}
                <Button
                  onClick={markTransferDone}
                  disabled={markingTransfer}
                  className={`gap-1.5 ${vendor?.payment_instructions ? "" : "sm:col-span-2"}`}
                >
                  {markingTransfer ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      جارٍ الإرسال...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" />
                      لقد قمت بالتحويل
                    </>
                  )}
                </Button>
              </div>
              <p className="mt-2 text-[10px] leading-relaxed text-muted-foreground">
                اضغط بعد إتمام التحويل من بنكك — سيُخطَر البائع للتحقق وتأكيد الطلب.
              </p>
            </Card>
          )
        )}

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

  // -------- Single-page checkout --------
  return (
    <div className="mx-auto max-w-5xl pb-28 sm:pb-0" dir="rtl">
      {/* Header */}
      <div className="mb-4 flex items-center justify-between gap-3">
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

      {/* Trust badges row */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <TrustBadge icon={<Lock className="h-4 w-4 text-success" />} label="بياناتك محمية" />
        <TrustBadge icon={<ShieldCheck className="h-4 w-4 text-success" />} label="بائع موثوق" />
        <TrustBadge icon={<Truck className="h-4 w-4 text-primary" />} label="توصيل سريع" />
        <TrustBadge icon={<Headphones className="h-4 w-4 text-primary" />} label="دعم مباشر" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr,360px]">
        {/* LEFT: Form (single page) */}
        <div className="space-y-4">
          {/* Contact + delivery */}
          <Card className="space-y-4 rounded-2xl p-4 sm:space-y-5 sm:p-6">
            <div className="flex items-center gap-2 border-b pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <Truck className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold leading-tight">بيانات التواصل والتوصيل</h2>
                <p className="text-[11px] text-muted-foreground">
                  معبأة من ملفك الشخصي — عدّلها إذا لزم الأمر
                </p>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <FieldWrap id="name" label="الاسم الكامل" required error={touched.name ? errors.name : null}>
                <Input
                  ref={nameRef}
                  id="name"
                  autoComplete="name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  onFocus={() => trackFirstFocus("name")}
                  onBlur={() => setTouched((t) => ({ ...t, name: true }))}
                  placeholder="اسم المسؤول عن الطلب"
                  aria-invalid={touched.name && !!errors.name}
                  className={touched.name && errors.name ? "border-destructive focus-visible:ring-destructive/30" : ""}
                />
              </FieldWrap>

              <FieldWrap id="phone" label="رقم الهاتف" required error={touched.phone ? errors.phone : null}>
                <Input
                  ref={phoneRef}
                  id="phone"
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  value={contactPhone}
                  onChange={(e) => setContactPhone(e.target.value)}
                  onFocus={() => trackFirstFocus("phone")}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))}
                  placeholder="+212 6XX XXX XXX"
                  dir="ltr"
                  aria-invalid={touched.phone && !!errors.phone}
                  className={touched.phone && errors.phone ? "border-destructive focus-visible:ring-destructive/30" : ""}
                />
              </FieldWrap>
            </div>

            <FieldWrap id="address" label="عنوان التوصيل" required error={touched.address ? errors.address : null}>
              <Textarea
                ref={addressRef}
                id="address"
                autoComplete="street-address"
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

          {/* Payment */}
          <Card className="space-y-4 rounded-2xl p-4 sm:space-y-5 sm:p-6">
            <div className="flex items-center gap-2 border-b pb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <CreditCard className="h-4 w-4" />
              </div>
              <div>
                <h2 className="text-sm font-bold leading-tight">طريقة الدفع</h2>
                <p className="text-[11px] text-muted-foreground">
                  الدفع يتم مباشرة مع البائع
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
                    onClick={() => {
                      setPaymentMethod(opt.value);
                      try {
                        if (vendor) {
                          track("checkout_payment_selected", {
                            vendor_id: vendor.id,
                            product_id: cart.items[0]?.id ?? null,
                            method: opt.value,
                            user_id: user?.id ?? null,
                          });
                        }
                      } catch {
                        /* noop */
                      }
                    }}
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

            {paymentMethod === "bank_transfer" && (
              <div className="space-y-3 rounded-2xl border-2 border-primary/30 bg-primary/[0.03] p-4">
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
          </Card>

          {/* WhatsApp abandonment fallback */}
          {whatsappFallbackHref && (
            <a
              href={whatsappFallbackHref}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleWhatsappFallback}
              className="flex items-center justify-center gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-200 dark:hover:bg-green-950/50"
            >
              <MessageCircle className="h-4 w-4" />
              تحتاج مساعدة؟ أتمم الطلب عبر واتساب
            </a>
          )}
        </div>

        {/* RIGHT: Sticky order summary (always visible on desktop) */}
        <aside className="hidden lg:block">
          <div className="sticky top-20 space-y-3">
            <Card className="rounded-2xl p-5">
              <div className="mb-3 flex items-center gap-2">
                <Receipt className="h-4 w-4 text-primary" />
                <h2 className="text-sm font-bold">ملخص الطلب</h2>
              </div>

              <ul className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
                {cart.items.map((i) => (
                  <li key={i.id} className="flex items-center gap-3">
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
                  </li>
                ))}
              </ul>

              <Separator className="my-4" />

              <dl className="space-y-2 text-sm">
                <div className="flex justify-between">
                  <dt className="text-muted-foreground">عدد القطع</dt>
                  <dd className="font-medium tabular-nums">{cart.totalQty}</dd>
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

              <Button
                size="lg"
                className="mt-4 w-full"
                disabled={submitting || !formValid}
                onClick={handlePlaceOrder}
                title={!formValid ? "أكمل البيانات المطلوبة أولاً" : undefined}
              >
                {submitting ? (
                  <>
                    <Loader2 className="ml-2 h-4 w-4 animate-spin" />
                    جارٍ الإرسال...
                  </>
                ) : (
                  <>
                    <Zap className="ml-2 h-4 w-4" />
                    تأكيد الطلب • {formatMAD(total)}
                  </>
                )}
              </Button>
              <p className="mt-2 text-center text-[10px] text-muted-foreground">
                <Lock className="inline h-3 w-3 align-text-bottom" /> اتصال آمن — لا يتم
                مشاركة بياناتك
              </p>
            </Card>
          </div>
        </aside>
      </div>

      {/* Mobile: collapsed summary + sticky CTA */}
      <div
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 backdrop-blur lg:hidden"
        style={{ paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-[11px] text-muted-foreground">
              {cart.totalQty} قطعة • {PAYMENT_OPTIONS.find((p) => p.value === paymentMethod)?.title}
            </p>
            <p className="text-base font-extrabold leading-tight tabular-nums">{formatMAD(total)}</p>
          </div>
          <Button
            size="lg"
            disabled={submitting || !formValid}
            onClick={handlePlaceOrder}
            title={!formValid ? "أكمل البيانات المطلوبة أولاً" : undefined}
            className="gap-1.5"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Zap className="h-4 w-4" />
            )}
            تأكيد الطلب
          </Button>
        </div>
      </div>
    </div>
  );
}

function TrustBadge({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border bg-card px-3 py-2.5">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <span className="truncate text-[11px] font-semibold sm:text-xs">{label}</span>
    </div>
  );
}
