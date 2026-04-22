import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  CheckCircle2,
  Clock,
  Download,
  FileText,
  Loader2,
  Package,
  PackageCheck,
  Pencil,
  Receipt,
  Send,
  Truck,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  formatMAD,
  formatDateTimeAr,
  formatDateAr,
  STATUS_LABELS,
  STATUS_VARIANTS,
  STATUS_CLASSES,
} from "@/lib/format";
import {
  createInvoiceForOrder,
  downloadInvoicePdf,
  INVOICE_STATUS_CLASSES,
  INVOICE_STATUS_LABELS,
} from "@/lib/invoices";
import { toast } from "sonner";
import { WhatsappContactButton } from "@/components/WhatsappContactButton";
import {
  buildOrderWhatsappMessage,
  buildSupplierOrderMessage,
  buildSupplierConfirmationMessage,
} from "@/utils/whatsapp";
import { logActivity } from "@/lib/activityLog";
import { ActivityTimeline } from "@/components/activity/ActivityTimeline";
import { LastEditedLabel } from "@/components/activity/LastEditedLabel";

export const Route = createFileRoute("/_app/_admin/admin/orders_/$orderId")({
  component: OrderDetails,
  head: () => ({ meta: [{ title: "تفاصيل الطلب — هيرباليفي" }] }),
});

interface ItemRow {
  id: string;
  quantity: number;
  unit_price_mad: number;
  cost_snapshot: number | null;
  products: {
    id: string;
    name_ar: string;
    sku: string | null;
    image_url: string | null;
    rrp_price: number | null;
    price_mad: number;
    cost_price: number | null;
  } | null;
}

interface OrderDetail {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  notes: string | null;
  admin_notes: string | null;
  payment_method: string | null;
  distributor_id: string;
  company_id: string;
  supplier_partner_id: string | null;
  profiles: {
    full_name: string;
    phone: string | null;
    city: string | null;
    territories: { name: string } | null;
  } | null;
  supplier: {
    id: string;
    name: string;
    phone: string | null;
  } | null;
  order_items: ItemRow[];
}

interface PartnerOption {
  id: string;
  name: string;
  phone: string | null;
}

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: "نقداً",
  transfer: "تحويل بنكي",
  credit: "آجل",
  check: "شيك",
};

interface TierInfo {
  name: string;
  discount_percent: number;
  custom: boolean;
}

type StatusKey = "confirmed" | "preparing" | "shipped" | "delivered" | "cancelled";

const ACTIONS: {
  status: StatusKey;
  label: string;
  icon: typeof CheckCircle2;
  variant: "default" | "outline" | "destructive";
}[] = [
  { status: "confirmed", label: "الموافقة على الطلب", icon: CheckCircle2, variant: "default" },
  { status: "preparing", label: "قيد التحضير", icon: Package, variant: "outline" },
  { status: "shipped", label: "تم الشحن", icon: Truck, variant: "outline" },
  { status: "delivered", label: "تم التسليم", icon: PackageCheck, variant: "default" },
  { status: "cancelled", label: "إلغاء", icon: XCircle, variant: "destructive" },
];

function OrderDetails() {
  const { orderId } = Route.useParams();
  const navigate = useNavigate();
  const { companyId } = useAuth();
  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<StatusKey | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [draft, setDraft] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [history, setHistory] = useState<
    { id: string; created_at: string; old_status: string; new_status: string; admin_name: string | null }[]
  >([]);

  const [tier, setTier] = useState<TierInfo | null>(null);

  const [invoice, setInvoice] = useState<{
    id: string;
    invoice_number: string;
    status: string;
    issue_date: string;
    total_mad: number;
    pdf_path: string | null;
  } | null>(null);
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [downloadingInvoice, setDownloadingInvoice] = useState(false);

  const [supplierOptions, setSupplierOptions] = useState<PartnerOption[]>([]);
  const [savingSupplier, setSavingSupplier] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select(
        "id, order_number, status, total_mad, points_earned, created_at, notes, admin_notes, payment_method, distributor_id, company_id, supplier_partner_id, profiles(full_name, phone, city, territories(name)), supplier:partners!orders_supplier_partner_id_fkey(id, name, phone), order_items(id, quantity, unit_price_mad, cost_snapshot, products(id, name_ar, sku, image_url, rrp_price, price_mad, cost_price))",
      )
      .eq("id", orderId)
      .eq("company_id", companyId)
      .maybeSingle();
    if (error || !data) {
      toast.error("تعذر تحميل الطلب");
      setOrder(null);
      setHistory([]);
      setTier(null);
      setLoading(false);
      return;
    }
    setOrder(data as unknown as OrderDetail);

    // Resolve the distributor's effective pricing tier for this company.
    const { data: cdp } = await supabase
      .from("company_distributor_pricing")
      .select("custom_discount_percent, pricing_tiers(name, base_discount_percent)")
      .eq("company_id", (data as { company_id: string }).company_id)
      .eq("distributor_id", (data as { distributor_id: string }).distributor_id)
      .maybeSingle();
    if (cdp) {
      const row = cdp as unknown as {
        custom_discount_percent: number | null;
        pricing_tiers: { name: string; base_discount_percent: number } | null;
      };
      const base = row.pricing_tiers?.base_discount_percent ?? 0;
      const custom = row.custom_discount_percent;
      setTier({
        name: row.pricing_tiers?.name ?? "—",
        discount_percent: custom != null ? Number(custom) : Number(base),
        custom: custom != null,
      });
    } else {
      setTier(null);
    }

    const { data: logs } = await supabase
      .from("admin_activity_log")
      .select("id, admin_id, metadata, created_at")
      .eq("company_id", companyId)
      .eq("action", "order_status_change")
      .filter("metadata->>order_id", "eq", orderId)
      .order("created_at", { ascending: true });

    if (logs && logs.length > 0) {
      const adminIds = Array.from(new Set(logs.map((l) => l.admin_id).filter(Boolean)));
      const { data: admins } = adminIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", adminIds)
        : { data: [] as { id: string; full_name: string }[] };
      const nameMap = new Map((admins ?? []).map((a) => [a.id, a.full_name]));
      setHistory(
        logs.map((l) => {
          const meta = (l.metadata ?? {}) as Record<string, unknown>;
          return {
            id: l.id,
            created_at: l.created_at,
            old_status: String(meta.old_status ?? ""),
            new_status: String(meta.new_status ?? ""),
            admin_name: nameMap.get(l.admin_id) ?? null,
          };
        }),
      );
    } else {
      setHistory([]);
    }

    // Load existing invoice for this order (one-to-one).
    const { data: inv } = await supabase
      .from("invoices")
      .select("id, invoice_number, status, issue_date, total_mad, pdf_path")
      .eq("order_id", orderId)
      .maybeSingle();
    setInvoice(inv as typeof invoice);

    // Load partners that can be selected as the supplier for this order.
    const { data: partners } = await supabase
      .from("partners")
      .select("id, name, phone")
      .eq("company_id", companyId)
      .order("name", { ascending: true });
    setSupplierOptions((partners ?? []) as PartnerOption[]);

    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [orderId, companyId]);

  const updateSupplier = async (partnerId: string | null) => {
    if (!order) return;
    setSavingSupplier(true);
    const { error } = await supabase
      .from("orders")
      .update({ supplier_partner_id: partnerId })
      .eq("id", order.id);
    setSavingSupplier(false);
    if (error) {
      toast.error("تعذر تحديث المورد");
      return;
    }
    toast.success(partnerId ? "تم تعيين المورد" : "تم إزالة المورد");
    load();
  };

  const updateStatus = async (status: StatusKey) => {
    if (!order) return;
    setSaving(status);
    const { error } = await supabase
      .from("orders")
      .update({ status })
      .eq("id", order.id);
    setSaving(null);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    toast.success(`تم تحديث الحالة: ${STATUS_LABELS[status]}`);
    load();
  };

  const handleGenerateInvoice = async () => {
    if (!order) return;
    setGeneratingInvoice(true);
    try {
      await createInvoiceForOrder({ orderId: order.id });
      toast.success("تم إصدار الفاتورة");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "تعذر إصدار الفاتورة");
    } finally {
      setGeneratingInvoice(false);
    }
  };

  const handleDownloadInvoice = async () => {
    if (!invoice?.pdf_path) {
      toast.error("لا يوجد ملف PDF");
      return;
    }
    setDownloadingInvoice(true);
    try {
      await downloadInvoicePdf(invoice.pdf_path, `${invoice.invoice_number}.pdf`);
    } catch {
      toast.error("تعذر تنزيل الفاتورة");
    } finally {
      setDownloadingInvoice(false);
    }
  };

  const startEditNotes = () => {
    setDraft(order?.admin_notes ?? "");
    setEditingNotes(true);
  };

  const saveNotes = async () => {
    if (!order) return;
    setSavingNotes(true);
    const next = draft.trim() ? draft.trim() : null;
    const { error } = await supabase
      .from("orders")
      .update({ admin_notes: next })
      .eq("id", order.id);
    setSavingNotes(false);
    if (error) {
      toast.error("تعذر حفظ الملاحظة");
      return;
    }
    toast.success("تم حفظ الملاحظة");
    setEditingNotes(false);
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!order) {
    return (
      <Card className="p-8 text-center space-y-3">
        <p className="text-sm text-muted-foreground">الطلب غير موجود</p>
        <Button asChild variant="outline">
          <Link to="/admin/orders">العودة إلى قائمة الطلبات</Link>
        </Button>
      </Card>
    );
  }

  const tierDiscount = tier?.discount_percent ?? 0;

  // Subtotal at base (RRP) — falls back to price_mad when RRP is missing,
  // then to the actual unit price as a last resort.
  const baseFor = (it: ItemRow) =>
    Number(it.products?.rrp_price ?? it.products?.price_mad ?? it.unit_price_mad);

  const subtotalBeforeDiscount = order.order_items.reduce(
    (s, it) => s + baseFor(it) * it.quantity,
    0,
  );
  const itemsTotal = order.order_items.reduce(
    (s, it) => s + Number(it.unit_price_mad) * it.quantity,
    0,
  );
  const totalDiscount = subtotalBeforeDiscount - itemsTotal;

  // Profit calculations — based on cost snapshots captured at order time.
  // Items missing a snapshot are excluded from cost/profit and flagged in the UI.
  const itemsWithCost = order.order_items.filter(
    (it) => it.cost_snapshot != null && Number(it.cost_snapshot) > 0,
  );
  const itemsMissingCost = order.order_items.length - itemsWithCost.length;
  const orderRevenue = itemsWithCost.reduce(
    (s, it) => s + Number(it.unit_price_mad) * it.quantity,
    0,
  );
  const orderCost = itemsWithCost.reduce(
    (s, it) => s + Number(it.cost_snapshot ?? 0) * it.quantity,
    0,
  );
  const orderProfit = orderRevenue - orderCost;
  // Margin as % of revenue (profit / distributor_total × 100).
  const orderMargin = orderRevenue > 0 ? (orderProfit / orderRevenue) * 100 : 0;

  return (
    <div className="space-y-5 pb-24">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => navigate({ to: "/admin/orders" })}
        >
          <ArrowRight className="h-4 w-4 ml-1" />
          الطلبات
        </Button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{order.order_number}</h1>
          <p className="text-xs text-muted-foreground mt-1">
            {formatDateTimeAr(order.created_at)}
          </p>
        </div>
        <Badge
          variant={STATUS_VARIANTS[order.status]}
          className={`text-sm py-1.5 px-3 self-start ${STATUS_CLASSES[order.status] ?? ""}`}
        >
          {STATUS_LABELS[order.status]}
        </Badge>
      </div>

      <Card className="p-4 space-y-2">
        <h2 className="font-semibold text-sm text-muted-foreground">معلومات الطلب</h2>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <p className="text-xs text-muted-foreground">رقم الطلب</p>
            <p className="font-medium" dir="ltr">{order.order_number}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">العميل</p>
            <p className="font-medium">{order.profiles?.full_name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">الهاتف</p>
            <p className="font-medium" dir="ltr">{order.profiles?.phone || "—"}</p>
            <div className="mt-2">
              <WhatsappContactButton
                phone={order.profiles?.phone}
                message={buildOrderWhatsappMessage({
                  distributorName: order.profiles?.full_name || "—",
                  orderNumber: order.order_number,
                  orderTotalMad: order.total_mad,
                  orderId: order.id,
                  appBaseUrl:
                    typeof window !== "undefined" ? window.location.origin : undefined,
                })}
              />
            </div>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">المدينة</p>
            <p className="font-medium">{order.profiles?.city || order.profiles?.territories?.name || "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">تاريخ الطلب</p>
            <p className="font-medium">{formatDateTimeAr(order.created_at)}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">شريحة الأسعار</p>
            {tier ? (
              <div className="flex items-center gap-2 flex-wrap">
                <Badge className="bg-success/15 text-success border-success/30 hover:bg-success/20">
                  {tier.name} — {tier.discount_percent}%
                </Badge>
                {tier.custom && (
                  <Badge variant="outline" className="text-[10px]">خصم مخصص</Badge>
                )}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground italic">لا توجد شريحة</p>
            )}
          </div>
          <div className="col-span-2">
            <p className="text-xs text-muted-foreground mb-1">طريقة الدفع</p>
            <Select
              value={order.payment_method ?? "none"}
              onValueChange={async (v) => {
                const next = v === "none" ? null : v;
                const { error } = await supabase
                  .from("orders")
                  .update({ payment_method: next })
                  .eq("id", order.id);
                if (error) {
                  toast.error("تعذر تحديث طريقة الدفع");
                  return;
                }
                setOrder({ ...order, payment_method: next });
                toast.success("تم حفظ طريقة الدفع");
              }}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="اختر طريقة الدفع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— غير محددة —</SelectItem>
                {Object.entries(PAYMENT_METHOD_LABELS).map(([k, label]) => (
                  <SelectItem key={k} value={k}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
      </Card>

      {/* Supplier — upstream partner who fulfills this order. WhatsApp shortcut. */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-semibold text-sm text-muted-foreground">المورد</h2>
          {savingSupplier && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
        </div>

        <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
          <div>
            <p className="text-xs text-muted-foreground mb-1">اختر المورد (شريك)</p>
            <Select
              value={order.supplier_partner_id ?? "none"}
              onValueChange={(v) => updateSupplier(v === "none" ? null : v)}
              disabled={savingSupplier}
            >
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="— لا يوجد مورد —" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">— لا يوجد مورد —</SelectItem>
                {supplierOptions.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                    {p.phone ? ` — ${p.phone}` : " — (بدون هاتف)"}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {order.supplier?.phone && (
            <p className="text-xs text-muted-foreground" dir="ltr">
              {order.supplier.phone}
            </p>
          )}
        </div>

        {order.supplier?.phone ? (
          <div className="flex flex-col gap-3 pt-1">
            <WhatsappContactButton
              phone={order.supplier.phone}
              label="Send to Supplier"
              icon={Send}
              message={buildSupplierOrderMessage({
                distributorName: order.profiles?.full_name || "—",
                orderNumber: order.order_number,
                orderTotalMad: order.total_mad,
                orderId: order.id,
                itemsCount: order.order_items.reduce((s, it) => s + it.quantity, 0),
                items: order.order_items.map((it) => ({
                  name: it.products?.name_ar ?? "منتج محذوف",
                  quantity: it.quantity,
                })),
                appBaseUrl:
                  typeof window !== "undefined" ? window.location.origin : undefined,
              })}
            />
            <WhatsappContactButton
              phone={order.supplier.phone}
              label="Confirm Order"
              icon={Check}
              message={buildSupplierConfirmationMessage({
                distributorName: order.profiles?.full_name || "—",
                orderNumber: order.order_number,
                orderTotalMad: order.total_mad,
                orderId: order.id,
                appBaseUrl:
                  typeof window !== "undefined" ? window.location.origin : undefined,
              })}
            />
          </div>
        ) : order.supplier_partner_id ? (
          <p className="text-xs text-muted-foreground italic">
            هذا المورد لا يملك رقم هاتف — أضف رقمه من صفحة الشركاء لتفعيل أزرار واتساب.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground italic">
            عيّن موردًا من قائمة الشركاء لتفعيل إرسال الطلب عبر واتساب.
          </p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <h2 className="font-semibold text-sm text-muted-foreground">المنتجات</h2>
        {/* Mobile cards */}
        <div className="space-y-2 md:hidden">
          {order.order_items.map((it) => {
            const base = baseFor(it);
            const lineTotal = Number(it.unit_price_mad) * it.quantity;
            return (
              <div key={it.id} className="flex items-center gap-3 py-2 border-b last:border-0">
                {it.products?.image_url ? (
                  <img
                    src={it.products.image_url}
                    alt={it.products.name_ar}
                    className="h-12 w-12 rounded object-cover bg-muted"
                  />
                ) : (
                  <div className="h-12 w-12 rounded bg-muted" />
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {it.products?.name_ar ?? "منتج محذوف"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    <span className="line-through">{formatMAD(base)}</span>{" "}
                    → {formatMAD(it.unit_price_mad)} × {it.quantity}
                  </p>
                </div>
                <p className="text-sm font-semibold">{formatMAD(lineTotal)}</p>
              </div>
            );
          })}
        </div>

        {/* Desktop table */}
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b">
                <th className="text-right py-2 font-medium">المنتج</th>
                <th className="text-right py-2 font-medium">SKU</th>
                <th className="text-center py-2 font-medium">الكمية</th>
                <th className="text-left py-2 font-medium">السعر الأساسي</th>
                <th className="text-left py-2 font-medium">سعر الوحدة</th>
                <th className="text-left py-2 font-medium">إجمالي السطر</th>
              </tr>
            </thead>
            <tbody>
              {order.order_items.map((it) => {
                const base = baseFor(it);
                const lineTotal = Number(it.unit_price_mad) * it.quantity;
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-2">
                      <div className="flex items-center gap-2">
                        {it.products?.image_url ? (
                          <img
                            src={it.products.image_url}
                            alt={it.products.name_ar}
                            className="h-8 w-8 rounded object-cover bg-muted shrink-0"
                          />
                        ) : (
                          <div className="h-8 w-8 rounded bg-muted shrink-0" />
                        )}
                        <span className="font-medium truncate">
                          {it.products?.name_ar ?? "منتج محذوف"}
                        </span>
                      </div>
                    </td>
                    <td className="py-2 text-xs text-muted-foreground" dir="ltr">
                      {it.products?.sku ?? "—"}
                    </td>
                    <td className="text-center py-2">{it.quantity}</td>
                    <td className="text-left py-2 text-muted-foreground line-through">
                      {formatMAD(base)}
                    </td>
                    <td className="text-left py-2 font-medium">
                      {formatMAD(it.unit_price_mad)}
                    </td>
                    <td className="text-left py-2 font-semibold">{formatMAD(lineTotal)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        <Separator />
        <div className="space-y-1.5 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">المجموع قبل الخصم</span>
            <span>{formatMAD(subtotalBeforeDiscount)}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground">
              إجمالي الخصم {tierDiscount > 0 ? `(${tierDiscount}%)` : ""}
            </span>
            <span className="text-success">−{formatMAD(totalDiscount)}</span>
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="font-semibold">إجمالي طلب الموزع</span>
            <span className="text-xl font-bold text-primary">{formatMAD(order.total_mad)}</span>
          </div>
        </div>
        <p className="text-xs text-warning text-left">+{order.points_earned} نقطة ولاء</p>
      </Card>

      {/* Profit summary — admin-only insight based on cost snapshots */}
      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground">الربحية</h2>
          {itemsMissingCost > 0 && (
            <span className="text-[10px] text-amber-700 dark:text-amber-400 bg-amber-500/15 px-1.5 py-0.5 rounded">
              {itemsMissingCost} منتج بدون تكلفة مسجلة
            </span>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">الإيرادات</p>
            <p className="text-sm font-semibold">{formatMAD(orderRevenue)}</p>
          </div>
          <div className="rounded-md border bg-muted/30 p-3">
            <p className="text-[11px] text-muted-foreground">التكلفة</p>
            <p className="text-sm font-semibold">{formatMAD(orderCost)}</p>
          </div>
          <div
            className={`rounded-md border p-3 ${
              orderProfit >= 0
                ? "bg-emerald-500/10 border-emerald-500/30"
                : "bg-destructive/10 border-destructive/30"
            }`}
          >
            <p className="text-[11px] text-muted-foreground">الربح</p>
            <p
              className={`text-sm font-semibold ${
                orderProfit >= 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive"
              }`}
            >
              {formatMAD(orderProfit)}
            </p>
          </div>
          <div
            className={`rounded-md border p-3 ${
              orderMargin >= 50
                ? "bg-emerald-500/10 border-emerald-500/30"
                : orderMargin >= 20
                  ? "bg-sky-500/10 border-sky-500/30"
                  : orderMargin >= 0
                    ? "bg-amber-500/10 border-amber-500/30"
                    : "bg-destructive/10 border-destructive/30"
            }`}
          >
            <p className="text-[11px] text-muted-foreground">الهامش</p>
            <p className="text-sm font-semibold">
              {orderCost > 0 ? `${Math.round(orderMargin)}%` : "—"}
            </p>
          </div>
        </div>
        {orderCost === 0 && (
          <p className="text-[11px] text-muted-foreground">
            لم يتم تسجيل تكلفة لأي منتج في هذا الطلب — أضف تكلفة المنتجات في صفحة الإدارة لرؤية الربحية.
          </p>
        )}
      </Card>

      {/* Debug section — temporary, helps verify pricing/profit math per item. */}
      <Card className="p-4 space-y-3 border-dashed">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground">تشخيص الحساب (مؤقت)</h2>
          <Badge variant="outline" className="text-[10px]">debug</Badge>
        </div>
        <p className="text-[11px] text-muted-foreground">
          tier_discount = {tierDiscount}% — distributor_price = base_price × (1 − tier_discount)
        </p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-muted-foreground border-b">
                <th className="text-right py-1.5 font-medium">المنتج</th>
                <th className="text-left py-1.5 font-medium">base_price</th>
                <th className="text-left py-1.5 font-medium">distributor_price</th>
                <th className="text-left py-1.5 font-medium">unit_price (محفوظ)</th>
                <th className="text-left py-1.5 font-medium">cost_price</th>
                <th className="text-center py-1.5 font-medium">qty</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {order.order_items.map((it) => {
                const base = baseFor(it);
                const expected = base * (1 - tierDiscount / 100);
                const stored = Number(it.unit_price_mad);
                const drift = Math.abs(expected - stored) > 0.5;
                const cost =
                  it.cost_snapshot != null
                    ? Number(it.cost_snapshot)
                    : it.products?.cost_price != null
                      ? Number(it.products.cost_price)
                      : null;
                return (
                  <tr key={it.id} className="border-b last:border-0">
                    <td className="py-1.5 font-sans">{it.products?.name_ar ?? "—"}</td>
                    <td className="text-left py-1.5">{base.toFixed(2)}</td>
                    <td className="text-left py-1.5">{expected.toFixed(2)}</td>
                    <td className={`text-left py-1.5 ${drift ? "text-destructive font-bold" : ""}`}>
                      {stored.toFixed(2)}
                    </td>
                    <td className="text-left py-1.5">{cost != null ? cost.toFixed(2) : "—"}</td>
                    <td className="text-center py-1.5">{it.quantity}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="text-[10px] text-muted-foreground">
          إذا اختلف unit_price المحفوظ عن distributor_price المتوقع فهذا يعني أن السعر تم تطبيقه بشريحة مختلفة وقت إنشاء الطلب.
        </p>
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Receipt className="h-4 w-4 text-muted-foreground" />
            <h2 className="font-semibold text-sm text-muted-foreground">الفاتورة</h2>
          </div>
          {invoice ? (
            <Button size="sm" variant="outline" onClick={handleDownloadInvoice} disabled={!invoice.pdf_path || downloadingInvoice}>
              {downloadingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <Download className="h-3.5 w-3.5 ml-1" />}
              تنزيل PDF
            </Button>
          ) : (
            <Button size="sm" onClick={handleGenerateInvoice} disabled={generatingInvoice}>
              {generatingInvoice ? <Loader2 className="h-3.5 w-3.5 animate-spin ml-1" /> : <FileText className="h-3.5 w-3.5 ml-1" />}
              إصدار فاتورة
            </Button>
          )}
        </div>
        {invoice ? (
          <div className="flex items-center justify-between flex-wrap gap-2 text-sm">
            <Link to="/admin/invoices/$invoiceId" params={{ invoiceId: invoice.id }} className="font-medium hover:underline" dir="ltr">
              {invoice.invoice_number}
            </Link>
            <span className="text-xs text-muted-foreground">{formatDateAr(invoice.issue_date)}</span>
            <Badge variant="outline" className={INVOICE_STATUS_CLASSES[invoice.status]}>
              {INVOICE_STATUS_LABELS[invoice.status]}
            </Badge>
            <span className="font-semibold">{formatMAD(invoice.total_mad)}</span>
          </div>
        ) : (
          <p className="text-xs text-muted-foreground italic">لم يتم إصدار فاتورة لهذا الطلب بعد.</p>
        )}
      </Card>

      {order.notes && (
        <Card className="p-4 space-y-1">
          <h2 className="font-semibold text-sm text-muted-foreground">ملاحظات التوصيل</h2>
          <p className="text-sm whitespace-pre-wrap">{order.notes}</p>
        </Card>
      )}

      <Card className="p-4 space-y-2 bg-muted/30">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm text-muted-foreground">ملاحظات داخلية</h2>
          {!editingNotes && (
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={startEditNotes}>
              <Pencil className="h-3 w-3 ml-1" />
              تعديل
            </Button>
          )}
        </div>
        {editingNotes ? (
          <div className="space-y-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={3}
              maxLength={1000}
              placeholder="ملاحظات داخلية للإدارة فقط…"
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => setEditingNotes(false)}
                disabled={savingNotes}
              >
                إلغاء
              </Button>
              <Button size="sm" onClick={saveNotes} disabled={savingNotes}>
                {savingNotes && <Loader2 className="h-3 w-3 animate-spin ml-1" />}
                حفظ
              </Button>
            </div>
          </div>
        ) : order.admin_notes ? (
          <p className="text-sm whitespace-pre-wrap">{order.admin_notes}</p>
        ) : (
          <p className="text-xs text-muted-foreground italic">لا توجد ملاحظات داخلية</p>
        )}
      </Card>

      <Card className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="h-4 w-4 text-muted-foreground" />
          <h2 className="font-semibold text-sm text-muted-foreground">سجل تغييرات الحالة</h2>
        </div>
        {history.length === 0 ? (
          <p className="text-xs text-muted-foreground italic">لا توجد تغييرات مسجلة بعد</p>
        ) : (
          <ol className="relative border-r border-border pr-4 space-y-4">
            {history.map((h) => (
              <li key={h.id} className="relative">
                <span className="absolute -right-[21px] top-1.5 h-3 w-3 rounded-full bg-primary ring-4 ring-background" />
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant={STATUS_VARIANTS[h.old_status]}
                    className={`text-xs ${STATUS_CLASSES[h.old_status] ?? ""}`}
                  >
                    {STATUS_LABELS[h.old_status] ?? h.old_status}
                  </Badge>
                  <ArrowRight className="h-3 w-3 text-muted-foreground rotate-180" />
                  <Badge
                    variant={STATUS_VARIANTS[h.new_status]}
                    className={`text-xs ${STATUS_CLASSES[h.new_status] ?? ""}`}
                  >
                    {STATUS_LABELS[h.new_status] ?? h.new_status}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {formatDateTimeAr(h.created_at)}
                  {h.admin_name ? ` — ${h.admin_name}` : ""}
                </p>
              </li>
            ))}
          </ol>
        )}
      </Card>

      <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur p-3 shadow-lg md:static md:border-0 md:bg-transparent md:p-0 md:shadow-none">
        <div className="container mx-auto md:p-0">
          <p className="text-xs text-muted-foreground mb-2 hidden md:block">إجراءات الطلب</p>
          <div className="flex gap-2 overflow-x-auto md:flex-wrap">
            {ACTIONS.map((a) => {
              const Icon = a.icon;
              const disabled = order.status === a.status || saving !== null;
              return (
                <Button
                  key={a.status}
                  variant={a.variant}
                  size="sm"
                  className="shrink-0"
                  disabled={disabled}
                  onClick={() => {
                    if (a.status === "cancelled") {
                      setConfirmCancel(true);
                    } else {
                      updateStatus(a.status);
                    }
                  }}
                >
                  {saving === a.status ? (
                    <Loader2 className="h-4 w-4 animate-spin ml-1" />
                  ) : (
                    <Icon className="h-4 w-4 ml-1" />
                  )}
                  {a.label}
                </Button>
              );
            })}
          </div>
        </div>
      </div>

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الطلب</AlertDialogTitle>
            <AlertDialogDescription>هل أنت متأكد أنك تريد إلغاء هذا الطلب؟</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmCancel(false);
                updateStatus("cancelled");
              }}
            >
              نعم، ألغِ الطلب
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
