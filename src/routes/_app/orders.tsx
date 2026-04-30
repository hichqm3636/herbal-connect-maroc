import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Package, ShoppingBag, Store, Search, Filter, X, Star } from "lucide-react";
import { z } from "zod";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  formatMAD,
  formatDateTimeAr,
  STATUS_LABELS,
  STATUS_CLASSES,
} from "@/lib/format";
import { cn } from "@/lib/utils";
import { PaymentProofUploader } from "@/components/PaymentProofUploader";
import { ReviewDialog } from "@/components/ReviewDialog";

const ordersSearchSchema = z.object({
  focus: z.string().optional(),
});

export const Route = createFileRoute("/_app/orders")({
  component: OrdersPage,
  validateSearch: ordersSearchSchema,
  head: () => ({
    meta: [{ title: "طلباتي — Nexora" }],
  }),
});

type PaymentStatus = "pending" | "awaiting_confirmation" | "paid" | "failed" | "refunded";

const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "بانتظار الدفع",
  awaiting_confirmation: "بانتظار التأكيد",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "مُسترد",
};

const PAYMENT_STATUS_CLASSES: Record<PaymentStatus, string> = {
  pending: "bg-muted text-muted-foreground border-border",
  awaiting_confirmation: "bg-warning/15 text-warning-foreground border-warning/30",
  paid: "bg-success/15 text-success border-success/30",
  failed: "bg-destructive/15 text-destructive border-destructive/30",
  refunded: "bg-blue-500/15 text-blue-700 dark:text-blue-300 border-blue-500/30",
};

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "الدفع عند الاستلام",
  bank_transfer: "تحويل بنكي",
  manual: "تواصل مع البائع",
  card: "بطاقة",
  stripe: "Stripe",
  cash: "نقداً",
};

interface OrderItemRow {
  id: string;
  quantity: number;
  unit_price_mad: number;
  product_id: string;
  products: { name_ar: string | null; image_url: string | null } | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  created_at: string;
  notes: string | null;
  payment_method: string | null;
  payment_status: PaymentStatus;
  company_id: string;
  companies: {
    id: string;
    name: string;
    display_name: string | null;
    logo_url: string | null;
  } | null;
  order_items: OrderItemRow[];
}

function OrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const focusId = search.focus;
  const [orders, setOrders] = useState<OrderRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const focusRef = useRef<HTMLDivElement | null>(null);

  // Review dialog state
  const [reviewTarget, setReviewTarget] = useState<
    | null
    | { kind: "product"; productId: string; productName: string; companyId: string; companyName: string; orderId: string }
    | { kind: "vendor"; companyId: string; companyName: string; orderId: string }
  >(null);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  const fetchOrders = async (uid: string, opts: { silent?: boolean } = {}) => {
    if (!opts.silent) setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("orders")
      .select(
        `id, order_number, status, total_mad, created_at, notes, payment_method, payment_status, company_id,
         companies:company_id ( id, name, display_name, logo_url ),
         order_items ( id, quantity, unit_price_mad, product_id,
           products:product_id ( name_ar, image_url ) )`,
      )
      .eq("buyer_id", uid)
      .order("created_at", { ascending: false });

    if (error) {
      setError(error.message);
      setOrders([]);
    } else {
      setOrders((data ?? []) as unknown as OrderRow[]);
    }
    if (!opts.silent) setLoading(false);
  };

  useEffect(() => {
    if (authLoading || !user) return;
    fetchOrders(user.id);
  }, [user, authLoading]);

  // Realtime: refresh whenever any of this buyer's orders change.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`buyer-orders:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "orders",
          filter: `buyer_id=eq.${user.id}`,
        },
        () => {
          fetchOrders(user.id, { silent: true });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

  const totalSpent = useMemo(
    () => (orders ?? []).reduce((s, o) => s + Number(o.total_mad ?? 0), 0),
    [orders],
  );

  // Unique vendor list for filter
  const vendors = useMemo(() => {
    const map = new Map<string, string>();
    (orders ?? []).forEach((o) => {
      if (o.companies?.id) {
        map.set(
          o.companies.id,
          o.companies.display_name || o.companies.name || "بائع",
        );
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [orders]);

  // Counts per status (for tab pills)
  const statusCounts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    (orders ?? []).forEach((o) => {
      c.all += 1;
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [orders]);

  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    const q = query.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (paymentFilter !== "all" && o.payment_status !== paymentFilter) return false;
      if (vendorFilter !== "all" && o.company_id !== vendorFilter) return false;
      if (q) {
        const vendorName = (
          o.companies?.display_name ||
          o.companies?.name ||
          ""
        ).toLowerCase();
        const matchOrder = o.order_number.toLowerCase().includes(q);
        const matchVendor = vendorName.includes(q);
        const matchProduct = o.order_items.some((it) =>
          (it.products?.name_ar ?? "").toLowerCase().includes(q),
        );
        if (!matchOrder && !matchVendor && !matchProduct) return false;
      }
      return true;
    });
  }, [orders, statusFilter, paymentFilter, vendorFilter, query]);

  const filteredSpent = useMemo(
    () => filteredOrders.reduce((s, o) => s + Number(o.total_mad ?? 0), 0),
    [filteredOrders],
  );

  const hasActiveFilters =
    statusFilter !== "all" ||
    paymentFilter !== "all" ||
    vendorFilter !== "all" ||
    query.trim() !== "";

  const clearFilters = () => {
    setStatusFilter("all");
    setPaymentFilter("all");
    setVendorFilter("all");
    setQuery("");
  };

  // Quick status tabs (top-level chips)
  const statusTabs: { key: string; label: string }[] = [
    { key: "all", label: "الكل" },
    { key: "pending", label: STATUS_LABELS.pending ?? "قيد الانتظار" },
    { key: "confirmed", label: STATUS_LABELS.confirmed ?? "مؤكَّد" },
    { key: "shipped", label: STATUS_LABELS.shipped ?? "تم الشحن" },
    { key: "delivered", label: STATUS_LABELS.delivered ?? "تم التوصيل" },
    { key: "cancelled", label: STATUS_LABELS.cancelled ?? "ملغى" },
  ];

  // Scroll focused order into view (deep-link from notification).
  useEffect(() => {
    if (!focusId || !orders) return;
    const t = setTimeout(() => {
      focusRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 100);
    return () => clearTimeout(t);
  }, [focusId, orders]);

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">طلباتي</h1>
          <p className="text-sm text-muted-foreground">
            تابع حالة طلباتك ومشترياتك السابقة من جميع البائعين.
          </p>
        </div>
        {orders && orders.length > 0 && (
          <div className="rounded-lg border bg-card px-4 py-2 text-sm">
            <span className="text-muted-foreground">إجمالي الإنفاق: </span>
            <span className="font-semibold">{formatMAD(totalSpent)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">عدد الطلبات: </span>
            <span className="font-semibold">{orders.length}</span>
          </div>
        )}
      </header>

      {loading && (
        <Card className="flex items-center justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </Card>
      )}

      {!loading && error && (
        <Card className="border-destructive/40 bg-destructive/5 p-6 text-sm text-destructive">
          تعذّر تحميل الطلبات: {error}
        </Card>
      )}

      {/* Filters */}
      {!loading && !error && orders && orders.length > 0 && (
        <Card className="p-3 sm:p-4 space-y-3">
          {/* Status quick tabs */}
          <div className="flex flex-wrap gap-1.5">
            {statusTabs.map((tab) => {
              const count = statusCounts[tab.key] ?? 0;
              if (tab.key !== "all" && count === 0) return null;
              const active = statusFilter === tab.key;
              return (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setStatusFilter(tab.key)}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    active
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background hover:bg-muted",
                  )}
                >
                  <span>{tab.label}</span>
                  <span
                    className={cn(
                      "rounded-full px-1.5 text-[10px]",
                      active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* Search + dropdowns */}
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
            <div className="relative">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="ابحث برقم الطلب، البائع أو المنتج..."
                className="pr-9"
              />
            </div>
            <Select value={paymentFilter} onValueChange={setPaymentFilter}>
              <SelectTrigger className="w-full sm:w-[170px]">
                <SelectValue placeholder="حالة الدفع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل حالات الدفع</SelectItem>
                {(Object.keys(PAYMENT_STATUS_LABELS) as PaymentStatus[]).map((k) => (
                  <SelectItem key={k} value={k}>
                    {PAYMENT_STATUS_LABELS[k]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={vendorFilter} onValueChange={setVendorFilter}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="البائع" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">كل البائعين</SelectItem>
                {vendors.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFilters}
                className="gap-1.5"
              >
                <X className="h-4 w-4" />
                مسح الفلاتر
              </Button>
            )}
          </div>

          {hasActiveFilters && (
            <div className="flex items-center gap-2 border-t pt-2 text-xs text-muted-foreground">
              <Filter className="h-3.5 w-3.5" />
              <span>
                <span className="font-semibold text-foreground">{filteredOrders.length}</span>{" "}
                من {orders.length} طلب
                {filteredOrders.length > 0 && (
                  <>
                    {" · "}إجمالي:{" "}
                    <span className="font-semibold text-foreground">
                      {formatMAD(filteredSpent)}
                    </span>
                  </>
                )}
              </span>
            </div>
          )}
        </Card>
      )}

      {!loading && !error && orders && orders.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-4 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <ShoppingBag className="h-7 w-7 text-muted-foreground" />
          </div>
          <div className="space-y-1">
            <p className="font-semibold">لا توجد طلبات بعد</p>
            <p className="text-sm text-muted-foreground">
              تصفّح المتاجر وابدأ أول طلب لك.
            </p>
          </div>
          <Button asChild>
            <Link to="/vendors">
              <Store className="h-4 w-4" />
              تصفّح البائعين
            </Link>
          </Button>
        </Card>
      )}

      {!loading && !error && orders && orders.length > 0 && filteredOrders.length === 0 && (
        <Card className="flex flex-col items-center justify-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Filter className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">لا توجد طلبات مطابقة للفلاتر</p>
          <Button variant="outline" size="sm" onClick={clearFilters}>
            مسح الفلاتر
          </Button>
        </Card>
      )}

      {!loading && !error && filteredOrders.length > 0 && (
        <div className="space-y-4">
          {filteredOrders.map((order) => {
            const statusLabel = STATUS_LABELS[order.status] ?? order.status;
            const statusClass = STATUS_CLASSES[order.status] ?? "";
            const vendorName =
              order.companies?.display_name ||
              order.companies?.name ||
              "بائع";
            const itemCount = order.order_items.reduce(
              (s, i) => s + Number(i.quantity ?? 0),
              0,
            );
            const isFocused = focusId === order.id;
            const payLabel = PAYMENT_STATUS_LABELS[order.payment_status] ?? order.payment_status;
            const payClass = PAYMENT_STATUS_CLASSES[order.payment_status] ?? "";
            const methodLabel = order.payment_method
              ? (PAYMENT_METHOD_LABELS[order.payment_method] ?? order.payment_method)
              : null;
            return (
              <Card
                key={order.id}
                ref={isFocused ? focusRef : undefined}
                className={cn(
                  "overflow-hidden transition-all",
                  isFocused && "ring-2 ring-primary ring-offset-2",
                )}
              >
                <div className="flex flex-col gap-3 border-b bg-muted/30 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex items-center gap-3">
                    {order.companies?.logo_url ? (
                      <img
                        src={order.companies.logo_url}
                        alt={vendorName}
                        className="h-10 w-10 rounded-lg object-cover ring-1 ring-border"
                      />
                    ) : (
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <Store className="h-5 w-5" />
                      </div>
                    )}
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{vendorName}</p>
                      <p className="text-xs text-muted-foreground">
                        طلب{" "}
                        <span dir="ltr" className="font-mono">
                          #{order.order_number}
                        </span>
                        {" · "}
                        {formatDateTimeAr(order.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge
                      variant="outline"
                      className={cn("text-xs font-medium", statusClass)}
                    >
                      {statusLabel}
                    </Badge>
                    <Badge
                      variant="outline"
                      className={cn("text-xs font-medium", payClass)}
                    >
                      {payLabel}
                    </Badge>
                    <span className="text-sm font-bold">
                      {formatMAD(order.total_mad)}
                    </span>
                  </div>
                </div>

                <div className="divide-y">
                  {order.order_items.length === 0 && (
                    <div className="flex items-center gap-2 p-4 text-sm text-muted-foreground">
                      <Package className="h-4 w-4" />
                      لا توجد منتجات.
                    </div>
                  )}
                  {order.order_items.map((it) => (
                    <div
                      key={it.id}
                      className="flex items-center gap-3 p-3 sm:p-4"
                    >
                      {it.products?.image_url ? (
                        <img
                          src={it.products.image_url}
                          alt={it.products?.name_ar ?? ""}
                          className="h-12 w-12 flex-shrink-0 rounded-md object-cover ring-1 ring-border"
                        />
                      ) : (
                        <div className="flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-md bg-muted">
                          <Package className="h-5 w-5 text-muted-foreground" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {it.products?.name_ar ?? "منتج"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {it.quantity} × {formatMAD(it.unit_price_mad)}
                        </p>
                      </div>
                      <div className="text-sm font-semibold">
                        {formatMAD(Number(it.unit_price_mad) * Number(it.quantity))}
                      </div>
                    </div>
                  ))}
                </div>

                <OrderTimeline status={order.status} />

                <div className="flex flex-wrap items-center justify-between gap-2 border-t bg-muted/20 px-4 py-2.5 text-xs text-muted-foreground">
                  <span>
                    {itemCount} قطعة
                    {methodLabel ? ` · ${methodLabel}` : ""}
                  </span>
                  <div className="flex items-center gap-2">
                    {order.payment_method === "bank_transfer" &&
                      order.payment_status !== "paid" && (
                        <PaymentProofUploader
                          orderId={order.id}
                          companyId={order.company_id}
                        />
                      )}
                    {order.notes && (
                      <span className="max-w-md truncate" title={order.notes}>
                        📝 {order.notes}
                      </span>
                    )}
                  </div>
                </div>

                {order.status === "delivered" && (
                  <div className="flex flex-wrap items-center gap-2 border-t bg-primary/5 px-4 py-2.5">
                    <span className="text-xs font-medium text-primary">قيّم تجربتك:</span>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 gap-1 text-xs"
                      onClick={() =>
                        setReviewTarget({
                          kind: "vendor",
                          companyId: order.company_id,
                          companyName: vendorName,
                          orderId: order.id,
                        })
                      }
                    >
                      <Star className="h-3 w-3" />
                      المتجر
                    </Button>
                    {order.order_items.slice(0, 3).map((it) =>
                      it.products ? (
                        <Button
                          key={it.id}
                          size="sm"
                          variant="outline"
                          className="h-7 gap-1 text-xs"
                          onClick={() =>
                            setReviewTarget({
                              kind: "product",
                              productId: it.product_id,
                              productName: it.products?.name_ar ?? "منتج",
                              companyId: order.company_id,
                              companyName: vendorName,
                              orderId: order.id,
                            })
                          }
                        >
                          <Star className="h-3 w-3" />
                          {(it.products.name_ar ?? "منتج").slice(0, 20)}
                        </Button>
                      ) : null,
                    )}
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {reviewTarget && reviewTarget.kind === "product" && (
        <ReviewDialog
          open
          onOpenChange={(o) => !o && setReviewTarget(null)}
          kind="product"
          productId={reviewTarget.productId}
          productName={reviewTarget.productName}
          companyId={reviewTarget.companyId}
          companyName={reviewTarget.companyName}
          orderId={reviewTarget.orderId}
        />
      )}
      {reviewTarget && reviewTarget.kind === "vendor" && (
        <ReviewDialog
          open
          onOpenChange={(o) => !o && setReviewTarget(null)}
          kind="vendor"
          companyId={reviewTarget.companyId}
          companyName={reviewTarget.companyName}
          orderId={reviewTarget.orderId}
        />
      )}
    </div>
  );
}

// ---------------- Order Timeline ----------------
// Visualizes the canonical lifecycle stages and highlights where the order is.
// Cancelled orders show a single muted notice instead of the timeline.

const TIMELINE_STEPS: { key: string; label: string; matches: string[] }[] = [
  { key: "placed", label: "تم الطلب", matches: ["pending", "confirmed", "preparing", "processing", "shipped", "delivered"] },
  { key: "confirmed", label: "تم التأكيد", matches: ["confirmed", "preparing", "processing", "shipped", "delivered"] },
  { key: "preparing", label: "قيد التحضير", matches: ["preparing", "processing", "shipped", "delivered"] },
  { key: "shipped", label: "تم الشحن", matches: ["shipped", "delivered"] },
  { key: "delivered", label: "تم التوصيل", matches: ["delivered"] },
];

function currentStepIndex(status: string): number {
  let idx = -1;
  TIMELINE_STEPS.forEach((s, i) => {
    if (s.matches.includes(status)) idx = i;
  });
  return idx;
}

function OrderTimeline({ status }: { status: string }) {
  if (status === "cancelled") {
    return (
      <div className="border-t bg-destructive/5 px-4 py-3 text-xs text-destructive">
        تم إلغاء هذا الطلب.
      </div>
    );
  }
  const activeIdx = currentStepIndex(status);
  return (
    <div className="border-t bg-muted/10 px-3 py-3 sm:px-4">
      <ol className="flex items-start justify-between gap-1">
        {TIMELINE_STEPS.map((step, i) => {
          const done = i <= activeIdx;
          const isCurrent = i === activeIdx;
          return (
            <li key={step.key} className="flex flex-1 flex-col items-center text-center">
              <div className="flex w-full items-center">
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    i === 0 ? "opacity-0" : done ? "bg-primary" : "bg-border",
                  )}
                />
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 text-[10px] font-bold transition-colors",
                    done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-background text-muted-foreground",
                    isCurrent && "ring-2 ring-primary/30",
                  )}
                >
                  {done ? "✓" : i + 1}
                </span>
                <span
                  className={cn(
                    "h-0.5 flex-1",
                    i === TIMELINE_STEPS.length - 1
                      ? "opacity-0"
                      : i < activeIdx
                        ? "bg-primary"
                        : "bg-border",
                  )}
                />
              </div>
              <span
                className={cn(
                  "mt-1.5 text-[10px] leading-tight sm:text-xs",
                  done ? "font-semibold text-foreground" : "text-muted-foreground",
                )}
              >
                {step.label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
