import { createFileRoute, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { z } from "zod";
import {
  Loader2, Search, Eye, Package, Clock, CheckCircle2, Truck, XCircle,
  Calendar, RefreshCw, Save, BadgeCheck, MessageCircle, Phone,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { EmptyState } from "@/components/EmptyState";
import { TableRowsSkeleton } from "@/components/Skeletons";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];
type DateRange = "all" | "today" | "7d" | "30d";

const searchSchema = z.object({
  status: z.string().optional(),
  range: z.enum(["all", "today", "7d", "30d"]).optional(),
  focus: z.string().optional(),
});

export const Route = createFileRoute("/_app/_vendor/vendor/orders")({
  component: VendorOrdersPage,
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({ meta: [{ title: "الطلبات — Nexora" }] }),
});

type PaymentStatus = "pending" | "awaiting_confirmation" | "paid" | "failed" | "refunded";

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_mad: number;
  created_at: string;
  updated_at: string | null;
  buyer_id: string;
  notes: string | null;
  admin_notes: string | null;
  payment_method: string | null;
  payment_status: PaymentStatus;
  payment_reference: string | null;
  payment_paid_at: string | null;
  buyer_name: string;
  buyer_phone: string | null;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_mad: number;
  product_name: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  processing: "قيد المعالجة",
  preparing: "قيد التحضير",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-primary/15 text-primary",
  processing: "bg-primary/15 text-primary",
  preparing: "bg-primary/15 text-primary",
  shipped: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

// Allowed forward transitions per current status.
const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "بانتظار الدفع",
  awaiting_confirmation: "بانتظار التأكيد",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "مُسترد",
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  pending: "bg-muted text-muted-foreground",
  awaiting_confirmation: "bg-warning/15 text-warning-foreground",
  paid: "bg-success/15 text-success",
  failed: "bg-destructive/15 text-destructive",
  refunded: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "الدفع عند الاستلام",
  bank_transfer: "تحويل بنكي",
  manual: "تواصل مع البائع",
  card: "بطاقة",
  stripe: "Stripe",
  cash: "نقداً",
};

// Quick-filter chips shown above the table. Order matters (workflow order).
const CHIP_STATUSES: OrderStatus[] = [
  "pending", "confirmed", "preparing", "shipped", "delivered", "cancelled",
];

const RANGE_LABELS: Record<DateRange, string> = {
  all: "كل الفترات",
  today: "اليوم",
  "7d": "آخر 7 أيام",
  "30d": "آخر 30 يوم",
};

function rangeStart(range: DateRange): Date | null {
  if (range === "all") return null;
  const now = new Date();
  if (range === "today") return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const days = range === "7d" ? 7 : 30;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function formatRelativeAr(d: Date): string {
  const sec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
  if (sec < 5) return "الآن";
  if (sec < 60) return `منذ ${sec} ثانية`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `منذ ${min} دقيقة`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `منذ ${hr} ساعة`;
  const day = Math.floor(hr / 24);
  return `منذ ${day} يوم`;
}

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "؟";
  if (parts.length === 1) return parts[0].slice(0, 2);
  return (parts[0][0] ?? "") + (parts[1][0] ?? "");
}

function CustomerAvatar({ name, size = "md" }: { name: string; size?: "sm" | "md" }) {
  const dim = size === "sm" ? "h-8 w-8 text-[11px]" : "h-9 w-9 text-xs";
  return (
    <div
      className={cn(
        "shrink-0 rounded-full bg-gradient-primary text-primary-foreground font-semibold flex items-center justify-center shadow-sm",
        dim,
      )}
      aria-hidden
    >
      {getInitials(name).toUpperCase()}
    </div>
  );
}

const TIMELINE_FLOW: OrderStatus[] = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
];

function OrderTimeline({ status, createdAt, updatedAt }: { status: OrderStatus; createdAt: string; updatedAt?: string | null }) {
  const cancelled = status === "cancelled";
  const currentIndex = cancelled
    ? -1
    : TIMELINE_FLOW.indexOf(status === "processing" ? "preparing" : status);

  return (
    <ol className="relative space-y-3 ps-6 border-s-2 border-border">
      {TIMELINE_FLOW.map((s, idx) => {
        const reached = !cancelled && idx <= currentIndex;
        const isCurrent = !cancelled && idx === currentIndex;
        return (
          <li key={s} className="relative">
            <span
              className={cn(
                "absolute -start-[31px] flex h-5 w-5 items-center justify-center rounded-full border-2",
                reached
                  ? "bg-primary border-primary text-primary-foreground"
                  : "bg-background border-border text-muted-foreground",
                isCurrent && "ring-4 ring-primary/20",
              )}
            >
              {reached ? <CheckCircle2 className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
            </span>
            <div className="flex items-center justify-between gap-2">
              <span className={cn("text-sm", reached ? "font-semibold" : "text-muted-foreground")}>
                {STATUS_LABELS[s]}
              </span>
              {isCurrent && updatedAt && (
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeAr(new Date(updatedAt))}
                </span>
              )}
              {idx === 0 && (
                <span className="text-[10px] text-muted-foreground">
                  {formatRelativeAr(new Date(createdAt))}
                </span>
              )}
            </div>
          </li>
        );
      })}
      {cancelled && (
        <li className="relative">
          <span className="absolute -start-[31px] flex h-5 w-5 items-center justify-center rounded-full border-2 bg-destructive border-destructive text-destructive-foreground">
            <XCircle className="h-3 w-3" />
          </span>
          <span className="text-sm font-semibold text-destructive">
            {STATUS_LABELS.cancelled}
          </span>
        </li>
      )}
    </ol>
  );
}

function VendorOrdersPage() {
  const { companyId } = useAuth();
  const search = useSearch({ from: "/_app/_vendor/vendor/orders" });
  const navigate = Route.useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [, setTick] = useState(0);
  const [searchText, setSearchText] = useState("");
  const statusFilter: OrderStatus | "all" =
    (search.status as OrderStatus | "all" | undefined) ?? "all";
  const dateRange: DateRange = search.range ?? "all";
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [adminNotes, setAdminNotes] = useState("");
  const [savingNotes, setSavingNotes] = useState(false);
  const focusedRef = useRef<string | null>(null);

  const setStatusFilter = (s: OrderStatus | "all") => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, status: s === "all" ? undefined : s }),
      replace: true,
    });
  };
  const setDateRange = (r: DateRange) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({ ...prev, range: r === "all" ? undefined : r }),
      replace: true,
    });
  };

  const loadOrders = async (silent = false) => {
    if (!companyId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, total_mad, created_at, updated_at, buyer_id, notes, admin_notes, payment_method, payment_status, payment_reference, payment_paid_at")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("تعذر تحميل الطلبات");
      setLoading(false);
      setRefreshing(false);
      return;
    }

    const buyerIds = Array.from(new Set((data ?? []).map((o) => o.buyer_id)));
    const { data: profiles } = buyerIds.length
      ? await supabase.from("profiles").select("id, full_name, phone").in("id", buyerIds)
      : { data: [] as { id: string; full_name: string; phone: string | null }[] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));

    setOrders(
      (data ?? []).map((o) => ({
        ...o,
        total_mad: Number(o.total_mad),
        buyer_name: map.get(o.buyer_id)?.full_name || "عميل",
        buyer_phone: map.get(o.buyer_id)?.phone ?? null,
      })),
    );
    setLoading(false);
    setRefreshing(false);
    setLastUpdated(new Date());
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Auto-refresh every 30 seconds.
  useEffect(() => {
    if (!companyId) return;
    const id = window.setInterval(() => loadOrders(true), 30_000);
    return () => window.clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  // Re-render every 10 seconds so the "آخر تحديث: منذ X" string stays fresh.
  useEffect(() => {
    const id = window.setInterval(() => setTick((t) => t + 1), 10_000);
    return () => window.clearInterval(id);
  }, []);

  // Realtime: live-refresh on any change to the company's orders.
  useEffect(() => {
    if (!companyId) return;
    const channel = supabase
      .channel(`vendor-orders:${companyId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "orders", filter: `company_id=eq.${companyId}` },
        (payload) => {
          if (payload.eventType === "INSERT") {
            const o = payload.new as { order_number?: string };
            toast.success(`طلب جديد: ${o.order_number ?? ""}`);
          }
          loadOrders(true);
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const counts = useMemo(() => {
    const c: Record<OrderStatus | "all", number> = {
      all: orders.length,
      pending: 0, confirmed: 0, processing: 0, preparing: 0,
      shipped: 0, delivered: 0, cancelled: 0,
    };
    for (const o of orders) c[o.status] += 1;
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    const since = rangeStart(dateRange);
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (since && new Date(o.created_at) < since) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.buyer_name.toLowerCase().includes(q) ||
        (o.buyer_phone ?? "").toLowerCase().includes(q)
      );
    });
  }, [orders, searchText, statusFilter, dateRange]);

  const openDetail = async (order: OrderRow) => {
    setSelected(order);
    setAdminNotes(order.admin_notes ?? "");
    setItemsLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("id, product_id, quantity, unit_price_mad, products:product_id(name_ar)")
      .eq("order_id", order.id);
    type Row = {
      id: string; product_id: string; quantity: number; unit_price_mad: number;
      products: { name_ar: string } | { name_ar: string }[] | null;
    };
    setItems(
      ((data ?? []) as unknown as Row[]).map((it) => {
        const prod = Array.isArray(it.products) ? it.products[0] : it.products;
        return {
          id: it.id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price_mad: Number(it.unit_price_mad),
          product_name: prod?.name_ar ?? "—",
        };
      }),
    );
    setItemsLoading(false);
  };

  // Auto-open dialog from ?focus=<id> deep link (used by notifications).
  useEffect(() => {
    if (!search.focus || focusedRef.current === search.focus || orders.length === 0) return;
    const target = orders.find((o) => o.id === search.focus);
    if (!target) return;
    focusedRef.current = search.focus;
    openDetail(target);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orders, search.focus]);

  const updateStatus = async (next: OrderStatus) => {
    if (!selected) return;
    setSavingStatus(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", selected.id);
    setSavingStatus(false);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    toast.success(`تم تحديث الحالة إلى: ${STATUS_LABELS[next]}`);
    setSelected({ ...selected, status: next });
    setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, status: next } : o)));
  };

  const [savingPayment, setSavingPayment] = useState(false);
  const updatePaymentStatus = async (next: PaymentStatus) => {
    if (!selected) return;
    setSavingPayment(true);
    const patch: { payment_status: PaymentStatus; payment_paid_at?: string } = { payment_status: next };
    if (next === "paid") patch.payment_paid_at = new Date().toISOString();
    const { error } = await supabase.from("orders").update(patch).eq("id", selected.id);
    setSavingPayment(false);
    if (error) {
      toast.error("تعذر تحديث حالة الدفع");
      return;
    }
    toast.success(`حالة الدفع: ${PAYMENT_STATUS_LABELS[next]}`);
    const updated = {
      ...selected,
      payment_status: next,
      payment_paid_at:
        next === "paid" ? (selected.payment_paid_at ?? new Date().toISOString()) : selected.payment_paid_at,
    };
    setSelected(updated);
    setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, ...updated } : o)));
  };

  // Combined: confirm bank-transfer receipt -> mark paid AND confirm the order.
  const confirmTransfer = async (order: OrderRow) => {
    setSavingPayment(true);
    const nowIso = new Date().toISOString();
    const patch: {
      payment_status: PaymentStatus;
      payment_paid_at: string;
      status?: OrderStatus;
    } = { payment_status: "paid", payment_paid_at: nowIso };
    // Only auto-advance status if the order is still pending.
    if (order.status === "pending") patch.status = "confirmed";
    const { error } = await supabase.from("orders").update(patch).eq("id", order.id);
    setSavingPayment(false);
    if (error) {
      toast.error("تعذر تأكيد التحويل");
      return;
    }
    toast.success("تم تأكيد التحويل وتأكيد الطلب");
    const updated: OrderRow = {
      ...order,
      payment_status: "paid",
      payment_paid_at: nowIso,
      status: patch.status ?? order.status,
    };
    setOrders((prev) => prev.map((o) => (o.id === order.id ? updated : o)));
    if (selected?.id === order.id) setSelected(updated);
  };

  // Inline row action: advance to a specific allowed next status without opening the dialog.
  const quickAdvance = async (order: OrderRow, next: OrderStatus) => {
    if (!NEXT_STATUS[order.status].includes(next)) {
      toast.error("تحوّل غير مسموح به");
      return;
    }
    setSavingStatus(true);
    const { error } = await supabase.from("orders").update({ status: next }).eq("id", order.id);
    setSavingStatus(false);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    toast.success(`تم تحديث الحالة إلى: ${STATUS_LABELS[next]}`);
    setOrders((prev) => prev.map((o) => (o.id === order.id ? { ...o, status: next } : o)));
    if (selected?.id === order.id) setSelected({ ...order, status: next });
  };

  const saveAdminNotes = async () => {
    if (!selected) return;
    const value = adminNotes.trim() || null;
    if ((selected.admin_notes ?? null) === value) return;
    setSavingNotes(true);
    const { error } = await supabase
      .from("orders")
      .update({ admin_notes: value })
      .eq("id", selected.id);
    setSavingNotes(false);
    if (error) {
      toast.error("تعذر حفظ الملاحظات");
      return;
    }
    toast.success("تم حفظ الملاحظات");
    setSelected({ ...selected, admin_notes: value });
    setOrders((prev) =>
      prev.map((o) => (o.id === selected.id ? { ...o, admin_notes: value } : o)),
    );
  };

  const closeDialog = () => {
    setSelected(null);
    if (search.focus) {
      navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, focus: undefined }), replace: true });
      focusedRef.current = null;
    }
  };

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">الطلبات الواردة</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {counts.all} طلب · {filtered.length} معروض
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} />
          {lastUpdated
            ? `آخر تحديث: ${formatRelativeAr(lastUpdated)}`
            : "جاري التحميل…"}
        </div>
      </header>

      {/* Status quick-filter chips */}
      <div className="flex flex-wrap gap-2">
        <StatusChip
          active={statusFilter === "all"}
          label="الكل"
          count={counts.all}
          onClick={() => setStatusFilter("all")}
        />
        {CHIP_STATUSES.map((s) => (
          <StatusChip
            key={s}
            active={statusFilter === s}
            label={STATUS_LABELS[s]}
            count={counts[s]}
            tone={STATUS_TONE[s]}
            onClick={() => setStatusFilter(s)}
          />
        ))}
      </div>

      {/* Search + date range */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الطلب، اسم العميل، أو الهاتف..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={dateRange} onValueChange={(v) => setDateRange(v as DateRange)}>
          <SelectTrigger className="sm:w-48">
            <Calendar className="h-4 w-4 ms-2 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(RANGE_LABELS) as DateRange[]).map((r) => (
              <SelectItem key={r} value={r}>{RANGE_LABELS[r]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            لا توجد طلبات مطابقة
          </div>
        ) : (
          <>
            {/* Mobile: vertical card list */}
            <ul className="divide-y md:hidden">
              {filtered.map((o) => {
                const next = NEXT_STATUS[o.status].filter((s) => s !== "cancelled")[0];
                const shortId = o.order_number.slice(-4);
                return (
                  <li
                    key={o.id}
                    className="p-4 cursor-pointer transition-colors hover:bg-muted/40 active:bg-muted/60"
                    onClick={() => openDetail(o)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        openDetail(o);
                      }
                    }}
                  >
                    <div className="flex items-start gap-3">
                      <CustomerAvatar name={o.buyer_name} size="sm" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-mono text-xs font-bold px-1.5 py-0.5 rounded bg-muted">
                            #{shortId}
                          </span>
                          <Badge variant="secondary" className={STATUS_TONE[o.status]}>
                            {STATUS_LABELS[o.status]}
                          </Badge>
                        </div>
                        <p className="font-semibold text-sm mt-1.5 truncate">{o.buyer_name}</p>
                        {o.buyer_phone && (
                          <p className="text-[11px] text-muted-foreground mt-0.5" dir="ltr">
                            {o.buyer_phone}
                          </p>
                        )}
                      </div>
                      <div className="text-left shrink-0">
                        <div className="font-bold text-sm whitespace-nowrap">
                          {formatMAD(o.total_mad)}
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {formatRelativeAr(new Date(o.created_at))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-3">
                      <Badge
                        variant="secondary"
                        className={cn("text-[10px]", PAYMENT_STATUS_TONE[o.payment_status])}
                      >
                        {PAYMENT_STATUS_LABELS[o.payment_status]}
                      </Badge>
                      <div className="flex items-center gap-1.5">
                        {o.payment_status === "awaiting_confirmation" && (
                          <Button
                            size="sm"
                            variant="default"
                            disabled={savingPayment}
                            onClick={(e) => {
                              e.stopPropagation();
                              confirmTransfer(o);
                            }}
                          >
                            <BadgeCheck className="h-4 w-4" />
                            تأكيد
                          </Button>
                        )}
                        {next && (
                          <Button
                            size="sm"
                            variant="outline"
                            disabled={savingStatus}
                            onClick={(e) => {
                              e.stopPropagation();
                              quickAdvance(o, next);
                            }}
                          >
                            {next === "confirmed" && <CheckCircle2 className="h-4 w-4" />}
                            {next === "preparing" && <Package className="h-4 w-4" />}
                            {next === "shipped" && <Truck className="h-4 w-4" />}
                            {next === "delivered" && <CheckCircle2 className="h-4 w-4" />}
                            {STATUS_LABELS[next]}
                          </Button>
                        )}
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            {/* Desktop: table */}
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-muted-foreground text-xs">
                  <tr className="text-right">
                    <th className="px-4 py-3 font-medium">رقم الطلب</th>
                    <th className="px-4 py-3 font-medium">العميل</th>
                    <th className="px-4 py-3 font-medium">التاريخ</th>
                    <th className="px-4 py-3 font-medium">المجموع</th>
                    <th className="px-4 py-3 font-medium">الحالة</th>
                    <th className="px-4 py-3 font-medium">إجراء</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {filtered.map((o) => (
                    <tr
                      key={o.id}
                      className="hover:bg-muted/30 cursor-pointer"
                      onClick={() => openDetail(o)}
                    >
                      <td className="px-4 py-3 font-mono font-bold">{o.order_number}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <CustomerAvatar name={o.buyer_name} size="sm" />
                          <div className="min-w-0">
                            <div className="font-medium truncate">{o.buyer_name}</div>
                            {o.buyer_phone && (
                              <div className="text-xs text-muted-foreground" dir="ltr">{o.buyer_phone}</div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">
                        <div className="text-xs">{new Date(o.created_at).toLocaleDateString("ar")}</div>
                        <div className="text-[10px] opacity-70">{formatRelativeAr(new Date(o.created_at))}</div>
                      </td>
                      <td className="px-4 py-3 font-bold whitespace-nowrap">{formatMAD(o.total_mad)}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant="secondary" className={STATUS_TONE[o.status]}>
                            {STATUS_LABELS[o.status]}
                          </Badge>
                          <Badge variant="secondary" className={cn("w-fit text-[10px]", PAYMENT_STATUS_TONE[o.payment_status])}>
                            {PAYMENT_STATUS_LABELS[o.payment_status]}
                          </Badge>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {o.payment_status === "awaiting_confirmation" && (
                            <Button
                              size="sm"
                              variant="default"
                              disabled={savingPayment}
                              onClick={(e) => {
                                e.stopPropagation();
                                confirmTransfer(o);
                              }}
                            >
                              <BadgeCheck className="h-4 w-4" />
                              تأكيد التحويل
                            </Button>
                          )}
                          {NEXT_STATUS[o.status]
                            .filter((s) => s !== "cancelled")
                            .slice(0, 1)
                            .map((next) => (
                              <Button
                                key={next}
                                size="sm"
                                variant="outline"
                                disabled={savingStatus}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  quickAdvance(o, next);
                                }}
                              >
                                {next === "confirmed" && <CheckCircle2 className="h-4 w-4" />}
                                {next === "preparing" && <Package className="h-4 w-4" />}
                                {next === "shipped" && <Truck className="h-4 w-4" />}
                                {next === "delivered" && <CheckCircle2 className="h-4 w-4" />}
                                {STATUS_LABELS[next]}
                              </Button>
                            ))}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={(e) => {
                              e.stopPropagation();
                              openDetail(o);
                            }}
                          >
                            <Eye className="h-4 w-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{selected.order_number}</DialogTitle>
                <DialogDescription>
                  {new Date(selected.created_at).toLocaleString("ar")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Customer card */}
                <div className="flex items-center gap-3 rounded-lg border bg-muted/30 p-3">
                  <CustomerAvatar name={selected.buyer_name} />
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold truncate">{selected.buyer_name}</p>
                    {selected.buyer_phone && (
                      <p className="text-xs text-muted-foreground" dir="ltr">
                        {selected.buyer_phone}
                      </p>
                    )}
                  </div>
                  {selected.buyer_phone && (
                    <div className="flex gap-1.5">
                      <Button asChild size="sm" variant="outline">
                        <a href={`tel:${selected.buyer_phone}`}>
                          <Phone className="h-4 w-4" />
                        </a>
                      </Button>
                      <Button asChild size="sm" variant="outline" className="text-success">
                        <a
                          href={`https://wa.me/${selected.buyer_phone.replace(/[^\d]/g, "")}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MessageCircle className="h-4 w-4" />
                        </a>
                      </Button>
                    </div>
                  )}
                </div>

                {/* Timeline */}
                <div className="rounded-lg border p-4">
                  <h3 className="text-sm font-bold mb-3">المسار الزمني</h3>
                  <OrderTimeline
                    status={selected.status}
                    createdAt={selected.created_at}
                    updatedAt={selected.updated_at}
                  />
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">الحالة:</span>
                    <p>
                      <Badge variant="secondary" className={STATUS_TONE[selected.status]}>
                        {STATUS_LABELS[selected.status]}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المجموع:</span>
                    <p className="font-bold text-base">{formatMAD(selected.total_mad)}</p>
                  </div>
                  {selected.payment_method && (
                    <div>
                      <span className="text-muted-foreground">طريقة الدفع:</span>
                      <p className="font-medium">
                        {PAYMENT_METHOD_LABELS[selected.payment_method] ?? selected.payment_method}
                      </p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">حالة الدفع:</span>
                    <p>
                      <Badge variant="secondary" className={PAYMENT_STATUS_TONE[selected.payment_status]}>
                        {PAYMENT_STATUS_LABELS[selected.payment_status]}
                      </Badge>
                    </p>
                  </div>
                  {selected.payment_reference && (
                    <div className="col-span-2">
                      <span className="text-muted-foreground">مرجع التحويل:</span>
                      <p className="font-mono text-xs break-all">{selected.payment_reference}</p>
                    </div>
                  )}
                </div>

                {selected.notes && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">ملاحظات العميل:</p>
                    <p className="whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <h3 className="text-sm font-bold mb-3">المنتجات</h3>
                  {itemsLoading ? (
                    <div className="py-6 text-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                    </div>
                  ) : (
                    <ul className="divide-y border rounded-md">
                      {items.map((it) => (
                        <li key={it.id} className="px-3 py-2 flex items-center justify-between text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{it.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {it.quantity} × {formatMAD(it.unit_price_mad)}
                            </p>
                          </div>
                          <div className="font-semibold whitespace-nowrap">
                            {formatMAD(it.quantity * it.unit_price_mad)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Separator />

                {/* Admin notes */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-sm font-bold">ملاحظات داخلية</h3>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={savingNotes || (selected.admin_notes ?? "") === adminNotes.trim()}
                      onClick={saveAdminNotes}
                    >
                      {savingNotes ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
                      حفظ
                    </Button>
                  </div>
                  <Textarea
                    value={adminNotes}
                    onChange={(e) => setAdminNotes(e.target.value)}
                    placeholder="ملاحظات لفريقك (لن تُعرض على العميل)"
                    rows={3}
                  />
                </div>

                <Separator />

                {/* Payment status management */}
                <div>
                  <h3 className="text-sm font-bold mb-3">إدارة الدفع</h3>
                  <div className="flex flex-wrap gap-2">
                    {(["paid", "awaiting_confirmation", "failed", "refunded", "pending"] as PaymentStatus[])
                      .filter((s) => s !== selected.payment_status)
                      .map((s) => (
                        <Button
                          key={s}
                          size="sm"
                          variant={s === "paid" ? "default" : s === "failed" ? "destructive" : "outline"}
                          disabled={savingPayment}
                          onClick={() => updatePaymentStatus(s)}
                        >
                          {savingPayment && <Loader2 className="h-3 w-3 animate-spin" />}
                          ضع كـ: {PAYMENT_STATUS_LABELS[s]}
                        </Button>
                      ))}
                  </div>
                  {selected.payment_method === "cod" && (
                    <p className="text-xs text-muted-foreground mt-2">
                      ملاحظة: طلبات الدفع عند الاستلام تُسجَّل تلقائياً كمدفوعة عند تأكيد التسليم.
                    </p>
                  )}
                </div>

                <Separator />

                {/* Status transitions */}
                {NEXT_STATUS[selected.status].length > 0 ? (
                  <div>
                    <h3 className="text-sm font-bold mb-3">تحديث الحالة</h3>
                    <div className="flex flex-wrap gap-2">
                      {NEXT_STATUS[selected.status].map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === "cancelled" ? "destructive" : "default"}
                          disabled={savingStatus}
                          onClick={() => updateStatus(next)}
                        >
                          {savingStatus && <Loader2 className="h-3 w-3 animate-spin" />}
                          {next === "confirmed" && <CheckCircle2 className="h-4 w-4" />}
                          {next === "preparing" && <Package className="h-4 w-4" />}
                          {next === "shipped" && <Truck className="h-4 w-4" />}
                          {next === "delivered" && <CheckCircle2 className="h-4 w-4" />}
                          {next === "cancelled" && <XCircle className="h-4 w-4" />}
                          {STATUS_LABELS[next]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    <Clock className="h-3 w-3 inline ml-1" />
                    هذا الطلب وصل إلى نهاية دورة حياته
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusChip({
  active, label, count, tone, onClick,
}: {
  active: boolean;
  label: string;
  count: number;
  tone?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-card hover:bg-muted",
      )}
    >
      <span>{label}</span>
      <span
        className={cn(
          "rounded-full px-1.5 py-0.5 text-[10px] font-bold",
          active ? "bg-primary-foreground/20" : tone ?? "bg-muted",
        )}
      >
        {count}
      </span>
    </button>
  );
}
