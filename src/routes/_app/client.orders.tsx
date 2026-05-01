import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { z } from "zod";
import {
  Package,
  Store,
  Calendar,
  ChevronLeft,
  ShoppingBag,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { EmptyState } from "@/components/EmptyState";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import {
  formatMAD,
  formatDateTimeAr,
  STATUS_LABELS,
  STATUS_CLASSES,
} from "@/lib/format";
import { PAYMENT_METHOD_LABELS, PaymentBadge } from "@/components/PaymentBadge";
import { cn } from "@/lib/utils";

const searchSchema = z.object({
  focus: z.string().optional(),
  status: z.string().optional(),
});

export const Route = createFileRoute("/_app/client/orders")({
  component: ClientOrdersPage,
  validateSearch: searchSchema,
  head: () => ({
    meta: [
      { title: "طلباتي — Nexora" },
      {
        name: "description",
        content: "تابع جميع طلباتك وحالة الشحن والدفع من جميع البائعين.",
      },
    ],
  }),
});

interface OrderItemRow {
  id: string;
  quantity: number;
  unit_price_mad: number;
  products: { id: string; name_ar: string | null; image_url: string | null } | null;
}

interface ClientOrder {
  id: string;
  order_number: string;
  status: string;
  payment_status: string;
  payment_method: string | null;
  total_mad: number;
  created_at: string;
  notes: string | null;
  companies: {
    id: string;
    name: string;
    display_name: string | null;
    logo_url: string | null;
  } | null;
  order_items: OrderItemRow[];
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: "all", label: "الكل" },
  { key: "pending", label: "قيد الانتظار" },
  { key: "confirmed", label: "مؤكد" },
  { key: "shipped", label: "قيد الشحن" },
  { key: "delivered", label: "مكتمل" },
  { key: "cancelled", label: "ملغي" },
];

function ClientOrdersPage() {
  const { user, loading: authLoading } = useAuth();
  const search = Route.useSearch();
  const navigate = Route.useNavigate();
  const focusId = search.focus;
  const activeStatus = search.status ?? "all";

  const [openOrder, setOpenOrder] = useState<ClientOrder | null>(null);

  const {
    data: orders,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["client-orders", user?.id],
    enabled: !!user && !authLoading,
    refetchOnWindowFocus: true,
    staleTime: 15_000,
    queryFn: async (): Promise<ClientOrder[]> => {
      const { data, error } = await supabase
        .from("orders")
        .select(
          `id, order_number, status, payment_status, payment_method, total_mad, created_at, notes,
           companies:company_id ( id, name, display_name, logo_url ),
           order_items ( id, quantity, unit_price_mad,
             products:product_id ( id, name_ar, image_url ) )`,
        )
        .eq("buyer_id", user!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as ClientOrder[];
    },
  });

  // Realtime: refresh when one of this buyer's orders changes.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`client-orders:${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "orders",
          filter: `buyer_id=eq.${user.id}`,
        },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, refetch]);

  // Surface errors via toast (keeps layout clean).
  useEffect(() => {
    if (isError && error) {
      toast.error("حدث خطأ أثناء تحميل الطلبات", {
        description: (error as Error).message,
      });
    }
  }, [isError, error]);

  // Auto-open the focused order (deep-link from checkout / notification).
  useEffect(() => {
    if (!focusId || !orders) return;
    const o = orders.find((x) => x.id === focusId);
    if (o) setOpenOrder(o);
  }, [focusId, orders]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    (orders ?? []).forEach((o) => {
      c.all += 1;
      c[o.status] = (c[o.status] ?? 0) + 1;
    });
    return c;
  }, [orders]);

  const filtered = useMemo(() => {
    if (!orders) return [];
    if (activeStatus === "all") return orders;
    return orders.filter((o) => o.status === activeStatus);
  }, [orders, activeStatus]);

  const totalSpent = useMemo(
    () => (orders ?? []).reduce((s, o) => s + Number(o.total_mad ?? 0), 0),
    [orders],
  );

  const setStatus = (key: string) => {
    navigate({
      search: (prev: Record<string, unknown>) => ({
        ...prev,
        status: key === "all" ? undefined : key,
      }),
      replace: true,
    });
  };

  // ========== Loading ==========
  if (authLoading || isLoading) {
    return (
      <div className="space-y-4" dir="rtl">
        <div className="space-y-2">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-4 w-64" />
        </div>
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="p-4">
            <div className="flex items-start gap-3">
              <Skeleton className="h-12 w-12 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-1/2" />
                <Skeleton className="h-3 w-2/3" />
              </div>
              <Skeleton className="h-6 w-16" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  // ========== Error (with retry CTA) ==========
  if (isError) {
    return (
      <div dir="rtl">
        <EmptyState
          icon={AlertCircle}
          title="حدث خطأ أثناء تحميل الطلبات"
          description="تحقق من اتصالك بالإنترنت ثم أعد المحاولة."
          action={
            <Button onClick={() => refetch()} variant="outline">
              <RefreshCw className="ml-2 h-4 w-4" /> إعادة المحاولة
            </Button>
          }
        />
      </div>
    );
  }

  // ========== Empty ==========
  if (!orders || orders.length === 0) {
    return (
      <div dir="rtl">
        <EmptyState
          icon={Package}
          title="لم تقم بأي طلب بعد"
          description="ابدأ بتصفح المنتجات من أفضل البائعين في المغرب."
          action={
            <Button asChild>
              <Link to="/vendors">
                <ShoppingBag className="ml-2 h-4 w-4" /> تصفح المنتجات
              </Link>
            </Button>
          }
        />
      </div>
    );
  }

  // ========== Main ==========
  return (
    <div className="space-y-4" dir="rtl">
      {/* Header */}
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">طلباتي</h1>
          <p className="text-sm text-muted-foreground">
            تابع حالة طلباتك ومشترياتك من جميع البائعين.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="rounded-lg border bg-card px-3 py-2 text-xs sm:text-sm">
            <span className="text-muted-foreground">الإنفاق: </span>
            <span className="font-semibold tabular-nums">{formatMAD(totalSpent)}</span>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">الطلبات: </span>
            <span className="font-semibold tabular-nums">{orders.length}</span>
          </div>
          <Button
            variant="outline"
            size="icon"
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="تحديث"
            title="تحديث"
          >
            <RefreshCw className={cn("h-4 w-4", isFetching && "animate-spin")} />
          </Button>
        </div>
      </header>

      {/* Status filter chips */}
      <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1">
        {STATUS_TABS.map((tab) => {
          const active = activeStatus === tab.key;
          const count = counts[tab.key] ?? 0;
          return (
            <button
              key={tab.key}
              type="button"
              onClick={() => setStatus(tab.key)}
              className={cn(
                "shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                active
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-card text-muted-foreground hover:bg-muted",
              )}
            >
              {tab.label}
              <span
                className={cn(
                  "mr-1.5 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] tabular-nums",
                  active ? "bg-primary-foreground/20" : "bg-muted",
                )}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Orders list */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={Package}
          title="لا توجد طلبات بهذه الحالة"
          description="جرّب اختيار حالة أخرى من الأعلى."
          action={
            <Button variant="outline" onClick={() => setStatus("all")}>
              عرض كل الطلبات
            </Button>
          }
          bare={false}
        />
      ) : (
        <div className="space-y-3">
          {filtered.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              focused={order.id === focusId}
              onOpen={() => setOpenOrder(order)}
            />
          ))}
        </div>
      )}

      {/* Details dialog */}
      <OrderDetailsDialog
        order={openOrder}
        onClose={() => setOpenOrder(null)}
      />
    </div>
  );
}

// ========== Order Card ==========
function OrderCard({
  order,
  focused,
  onOpen,
}: {
  order: ClientOrder;
  focused: boolean;
  onOpen: () => void;
}) {
  const vendorName =
    order.companies?.display_name || order.companies?.name || "بائع";
  const itemCount = order.order_items.reduce((s, it) => s + (it.quantity ?? 0), 0);
  const statusClass = STATUS_CLASSES[order.status] ?? "";
  const statusLabel = STATUS_LABELS[order.status] ?? order.status;

  return (
    <Card
      className={cn(
        "overflow-hidden transition-shadow",
        focused && "ring-2 ring-primary",
      )}
    >
      <button
        type="button"
        onClick={onOpen}
        className="block w-full p-4 text-right hover:bg-muted/40 active:bg-muted/60"
      >
        <div className="flex items-start gap-3">
          <Avatar className="h-12 w-12 shrink-0 border">
            {order.companies?.logo_url ? (
              <AvatarImage src={order.companies.logo_url} alt={vendorName} />
            ) : null}
            <AvatarFallback className="bg-muted">
              <Store className="h-5 w-5 text-muted-foreground" />
            </AvatarFallback>
          </Avatar>

          <div className="min-w-0 flex-1 space-y-1">
            <div className="flex items-start justify-between gap-2">
              <p className="truncate font-semibold">{vendorName}</p>
              <Badge
                variant="outline"
                className={cn("shrink-0 text-[10px]", statusClass)}
              >
                {statusLabel}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground">
              <span className="font-mono">#{order.order_number}</span>
            </p>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span className="inline-flex items-center gap-1">
                <Calendar className="h-3 w-3" />
                {formatDateTimeAr(order.created_at)}
              </span>
              <span>·</span>
              <span>{itemCount} قطعة</span>
            </div>
          </div>

          <ChevronLeft className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />
        </div>

        <div className="mt-3 flex items-center justify-between border-t pt-3">
          <PaymentBadge status={order.payment_status} />
          <div className="text-left">
            <p className="text-[10px] text-muted-foreground">المجموع</p>
            <p className="text-base font-extrabold tabular-nums">
              {formatMAD(order.total_mad)}
            </p>
          </div>
        </div>
      </button>
    </Card>
  );
}

// ========== Details Dialog ==========
function OrderDetailsDialog({
  order,
  onClose,
}: {
  order: ClientOrder | null;
  onClose: () => void;
}) {
  const open = !!order;
  const vendorName =
    order?.companies?.display_name || order?.companies?.name || "بائع";
  const subtotal =
    order?.order_items.reduce(
      (s, it) => s + Number(it.unit_price_mad) * (it.quantity ?? 0),
      0,
    ) ?? 0;

  return (
    <Dialog open={open} onOpenChange={(v) => (!v ? onClose() : null)}>
      <DialogContent
        className="max-h-[90vh] overflow-y-auto sm:max-w-lg"
        dir="rtl"
      >
        {order && (
          <>
            <DialogHeader className="text-right">
              <DialogTitle className="flex items-center justify-between gap-2">
                <span className="font-mono text-base">#{order.order_number}</span>
                <Badge
                  variant="outline"
                  className={cn(STATUS_CLASSES[order.status] ?? "")}
                >
                  {STATUS_LABELS[order.status] ?? order.status}
                </Badge>
              </DialogTitle>
              <DialogDescription className="text-right">
                {formatDateTimeAr(order.created_at)}
              </DialogDescription>
            </DialogHeader>

            {/* Vendor */}
            <div className="flex items-center gap-3 rounded-lg border bg-muted/40 p-3">
              <Avatar className="h-10 w-10 border">
                {order.companies?.logo_url ? (
                  <AvatarImage src={order.companies.logo_url} alt={vendorName} />
                ) : null}
                <AvatarFallback>
                  <Store className="h-4 w-4" />
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{vendorName}</p>
                <p className="text-[11px] text-muted-foreground">البائع</p>
              </div>
            </div>

            {/* Items */}
            <div className="space-y-2">
              <p className="text-xs font-semibold text-muted-foreground">
                المنتجات ({order.order_items.length})
              </p>
              <div className="space-y-2">
                {order.order_items.map((it) => {
                  const lineTotal =
                    Number(it.unit_price_mad) * (it.quantity ?? 0);
                  return (
                    <div
                      key={it.id}
                      className="flex items-start gap-3 rounded-lg border p-2.5"
                    >
                      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-md border bg-muted">
                        {it.products?.image_url ? (
                          <img
                            src={it.products.image_url}
                            alt={it.products?.name_ar ?? ""}
                            className="h-full w-full object-cover"
                            loading="lazy"
                          />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-5 w-5 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">
                          {it.products?.name_ar ?? "منتج"}
                        </p>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {it.quantity} × {formatMAD(it.unit_price_mad)}
                        </p>
                      </div>
                      <p className="shrink-0 text-sm font-semibold tabular-nums">
                        {formatMAD(lineTotal)}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Summary */}
            <div className="space-y-2 rounded-lg border p-3 text-sm">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">المجموع الفرعي</span>
                <span className="tabular-nums">{formatMAD(subtotal)}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">طريقة الدفع</span>
                <span>
                  {order.payment_method
                    ? PAYMENT_METHOD_LABELS[order.payment_method] ??
                      order.payment_method
                    : "—"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground">حالة الدفع</span>
                <PaymentBadge status={order.payment_status} />
              </div>
              <div className="flex items-center justify-between border-t pt-2">
                <span className="font-semibold">الإجمالي</span>
                <span className="text-lg font-extrabold tabular-nums">
                  {formatMAD(order.total_mad)}
                </span>
              </div>
            </div>

            {order.notes && (
              <div className="rounded-lg border bg-muted/40 p-3 text-xs">
                <p className="mb-1 font-semibold text-muted-foreground">ملاحظات</p>
                <p className="whitespace-pre-wrap">{order.notes}</p>
              </div>
            )}

            <div className="flex gap-2 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                إغلاق
              </Button>
              <Button asChild className="flex-1">
                <Link
                  to="/orders"
                  search={{ focus: order.id } as never}
                  onClick={onClose}
                >
                  العرض الكامل
                </Link>
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
