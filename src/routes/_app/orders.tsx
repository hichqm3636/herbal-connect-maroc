import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Package, ShoppingBag, Store, Search, Filter, X } from "lucide-react";
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

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [paymentFilter, setPaymentFilter] = useState<string>("all");
  const [vendorFilter, setVendorFilter] = useState<string>("all");
  const [query, setQuery] = useState("");

  useEffect(() => {
    if (authLoading || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      const { data, error } = await supabase
        .from("orders")
        .select(
          `id, order_number, status, total_mad, created_at, notes, payment_method, payment_status, company_id,
           companies:company_id ( id, name, display_name, logo_url ),
           order_items ( id, quantity, unit_price_mad, product_id,
             products:product_id ( name_ar, image_url ) )`,
        )
        .eq("buyer_id", user.id)
        .order("created_at", { ascending: false });

      if (cancelled) return;
      if (error) {
        setError(error.message);
        setOrders([]);
      } else {
        setOrders((data ?? []) as unknown as OrderRow[]);
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const totalSpent = useMemo(
    () => (orders ?? []).reduce((s, o) => s + Number(o.total_mad ?? 0), 0),
    [orders],
  );

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

      {!loading && !error && orders && orders.length > 0 && (
        <div className="space-y-4">
          {orders.map((order) => {
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
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
