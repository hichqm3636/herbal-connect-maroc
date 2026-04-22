import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Download,
  Eye,
  MoreVertical,
  Package,
  Search,
  Truck,
  X,
  XCircle,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { RecomputeDistributorPricesButton } from "@/components/admin/RecomputeDistributorPricesButton";
import {
  formatMAD,
  formatDateAr,
  STATUS_LABELS,
  STATUS_VARIANTS,
  STATUS_CLASSES,
  ORDER_STATUSES,
} from "@/lib/format";
import {
  allowedNextStates,
  transitionOrderStatus,
  OrderStateError,
  type OrderStatus,
  type Role,
} from "@/lib/orderStateMachine";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/orders")({
  component: AdminOrders,
  head: () => ({ meta: [{ title: "إدارة الطلبات — DistribHub" }] }),
});

interface OrderItem {
  quantity: number;
  unit_price_mad: number;
  cost_snapshot: number | null;
  products: { name_ar: string } | null;
}

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  distributor_id: string;
  company_id: string;
  notes: string | null;
  admin_notes: string | null;
  companies: { display_name: string | null; name: string } | null;
  profiles: {
    full_name: string;
    phone: string | null;
    city: string | null;
    territory_id: string | null;
    territories: { name: string } | null;
  } | null;
  order_items: OrderItem[];
}

function computeMargin(items: OrderItem[]): { profit: number; margin: number; partial: boolean } {
  const withCost = items.filter(
    (it) => it.cost_snapshot != null && Number(it.cost_snapshot) > 0,
  );
  if (withCost.length === 0) return { profit: 0, margin: 0, partial: items.length > 0 };
  const rev = withCost.reduce((s, it) => s + Number(it.unit_price_mad) * it.quantity, 0);
  const cost = withCost.reduce((s, it) => s + Number(it.cost_snapshot ?? 0) * it.quantity, 0);
  const profit = rev - cost;
  const margin = rev > 0 ? (profit / rev) * 100 : 0;
  return { profit, margin, partial: withCost.length < items.length };
}

function AdminOrders() {
  const { companyId, isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [clientFilter, setClientFilter] = useState<string>("all");
  const [cityFilter, setCityFilter] = useState<string>("all");
  const [dateFrom, setDateFrom] = useState<string>("");
  const [dateTo, setDateTo] = useState<string>("");
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [cancelTarget, setCancelTarget] = useState<string | null>(null);

  const load = async () => {
    if (!user) return;
    let query = supabase
      .from("orders")
      .select(
        "id, order_number, status, total_mad, points_earned, created_at, distributor_id, company_id, notes, admin_notes, companies(display_name, name), profiles(full_name, phone, city, territory_id, territories(name)), order_items(quantity, unit_price_mad, cost_snapshot, products(name_ar))",
      )
      .order("created_at", { ascending: false });
    if (isSuperAdmin) {
      // super admin sees everything
    } else if (companyId) {
      query = query.eq("company_id", companyId);
    } else {
      setOrders([]);
      return;
    }
    const { data, error } = await query;
    if (error) {
      console.error("[admin.orders] load failed", error);
      toast.error(`تعذر تحميل الطلبات: ${error.message}`);
    }
    setOrders((data as unknown as OrderRow[]) ?? []);
  };

  useEffect(() => {
    load();
  }, [companyId, isSuperAdmin, user?.id]);

  const role: Role = isSuperAdmin ? "admin" : "admin"; // this is the admin orders board
  const updateStatus = async (orderId: string, status: OrderStatus) => {
    if (!user) return;
    const order = orders.find((o) => o.id === orderId);
    if (!order) return;
    setUpdatingId(orderId);
    try {
      await transitionOrderStatus({
        orderId,
        to: status,
        userId: user.id,
        role,
        companyId: order.company_id,
      });
      setOrders((prev) => prev.map((o) => (o.id === orderId ? { ...o, status } : o)));
      toast.success(`تم تحديث الحالة: ${STATUS_LABELS[status]}`);
    } catch (e) {
      const msg =
        e instanceof OrderStateError
          ? e.message
          : e instanceof Error
            ? e.message
            : "تعذر تحديث الحالة";
      toast.error(msg);
    } finally {
      setUpdatingId(null);
    }
  };

  const clients = useMemo(() => {
    const map = new Map<string, string>();
    orders.forEach((o) => {
      if (o.distributor_id && o.profiles?.full_name) {
        map.set(o.distributor_id, o.profiles.full_name);
      }
    });
    return Array.from(map.entries()).sort((a, b) => a[1].localeCompare(b[1], "ar"));
  }, [orders]);

  const cities = useMemo(() => {
    const set = new Set<string>();
    orders.forEach((o) => {
      const c = o.profiles?.city || o.profiles?.territories?.name;
      if (c) set.add(c);
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b, "ar"));
  }, [orders]);

  const q = search.trim().toLowerCase();
  const fromTs = dateFrom ? new Date(dateFrom + "T00:00:00").getTime() : null;
  const toTs = dateTo ? new Date(dateTo + "T23:59:59.999").getTime() : null;
  const filtered = orders.filter((o) => {
    if (statusFilter !== "all" && o.status !== statusFilter) return false;
    if (clientFilter !== "all" && o.distributor_id !== clientFilter) return false;
    if (cityFilter !== "all") {
      const c = o.profiles?.city || o.profiles?.territories?.name || "";
      if (c !== cityFilter) return false;
    }
    if (fromTs || toTs) {
      const ts = new Date(o.created_at).getTime();
      if (fromTs && ts < fromTs) return false;
      if (toTs && ts > toTs) return false;
    }
    if (!q) return true;
    const name = o.profiles?.full_name?.toLowerCase() ?? "";
    const num = o.order_number?.toLowerCase() ?? "";
    return name.includes(q) || num.includes(q);
  });

  const hasActiveFilters =
    !!q ||
    statusFilter !== "all" ||
    clientFilter !== "all" ||
    cityFilter !== "all" ||
    !!dateFrom ||
    !!dateTo;

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("all");
    setClientFilter("all");
    setCityFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  const totalValue = filtered.reduce((s, o) => s + Number(o.total_mad ?? 0), 0);

  const exportCsv = () => {
    if (filtered.length === 0) {
      toast.error("لا توجد طلبات للتصدير");
      return;
    }
    const headers = [
      "Order Number",
      "Client",
      "City/Territory",
      "Order Value",
      "Margin",
      "Status",
      "Date",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = filtered.map((o) => {
      const m = computeMargin(o.order_items ?? []);
      return [
        o.order_number,
        o.profiles?.full_name ?? "",
        o.profiles?.city || o.profiles?.territories?.name || "",
        o.total_mad,
        m.profit,
        STATUS_LABELS[o.status] ?? o.status,
        new Date(o.created_at).toISOString(),
      ];
    });
    const csv =
      "\uFEFF" + [headers, ...rows].map((r) => r.map(escape).join(",")).join("\r\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    a.href = url;
    a.download = `orders-${stamp}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`تم تصدير ${filtered.length} طلب`);
  };

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة الطلبات</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {filtered.length} من {orders.length} طلب
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {companyId && (
            <RecomputeDistributorPricesButton companyId={companyId} onComplete={load} />
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={exportCsv}
            disabled={filtered.length === 0}
          >
            <Download className="h-4 w-4 ml-1" />
            تصدير CSV
          </Button>
        </div>
      </div>

      <Card className="p-4 bg-primary/5 border-primary/20">
        <div className="flex items-center justify-between">
          <span className="text-sm text-muted-foreground">القيمة الإجمالية</span>
          <span className="text-2xl font-bold text-primary">{formatMAD(totalValue)}</span>
        </div>
      </Card>

      {/* Filters: status, client, city, date range */}
      <Card>
        <CardContent className="pt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <div className="relative sm:col-span-2 lg:col-span-1">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="بحث برقم الطلب أو الاسم…"
              className="pr-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger>
              <SelectValue placeholder="الحالة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل الحالات</SelectItem>
              {ORDER_STATUSES.map((s) => (
                <SelectItem key={s} value={s}>
                  {STATUS_LABELS[s]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger>
              <SelectValue placeholder="المدينة / المنطقة" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل المدن</SelectItem>
              {cities.map((c) => (
                <SelectItem key={c} value={c}>
                  {c}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={clientFilter} onValueChange={setClientFilter}>
            <SelectTrigger>
              <SelectValue placeholder="العميل" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">كل العملاء</SelectItem>
              {clients.map(([id, name]) => (
                <SelectItem key={id} value={id}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">من تاريخ</label>
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              max={dateTo || undefined}
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">إلى تاريخ</label>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              min={dateFrom || undefined}
            />
          </div>
          {hasActiveFilters && (
            <div className="sm:col-span-2 lg:col-span-2 flex justify-end">
              <Button variant="ghost" size="sm" onClick={clearFilters}>
                <X className="h-4 w-4 ml-1" />
                مسح الفلاتر
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Operational table */}
      {filtered.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          لا توجد طلبات مطابقة
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-muted/60 backdrop-blur z-10 text-xs">
                <tr className="border-b">
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">
                    رقم الطلب
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground">
                    العميل
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground hidden md:table-cell">
                    المدينة
                  </th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground">
                    القيمة
                  </th>
                  <th className="text-left py-2.5 px-3 font-medium text-muted-foreground hidden sm:table-cell">
                    الهامش
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">
                    الحالة
                  </th>
                  <th className="text-right py-2.5 px-3 font-medium text-muted-foreground hidden lg:table-cell">
                    التاريخ
                  </th>
                  <th className="text-center py-2.5 px-3 font-medium text-muted-foreground">
                    إجراءات
                  </th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((o) => {
                  const m = computeMargin(o.order_items ?? []);
                  const city =
                    o.profiles?.city || o.profiles?.territories?.name || "—";
                  return (
                    <tr key={o.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2.5 px-3 font-medium whitespace-nowrap">
                        <Link
                          to="/admin/orders/$orderId"
                          params={{ orderId: o.id }}
                          className="text-primary hover:underline"
                        >
                          {o.order_number}
                        </Link>
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="min-w-0">
                          <p className="truncate max-w-[160px]">
                            {o.profiles?.full_name || "—"}
                          </p>
                          {isSuperAdmin && o.companies && (
                            <p className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                              {o.companies.display_name || o.companies.name}
                            </p>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground hidden md:table-cell">
                        {city}
                      </td>
                      <td className="py-2.5 px-3 text-left font-semibold whitespace-nowrap">
                        {formatMAD(o.total_mad)}
                      </td>
                      <td className="py-2.5 px-3 text-left hidden sm:table-cell whitespace-nowrap">
                        {m.profit !== 0 || !m.partial ? (
                          <span
                            className={
                              m.profit >= 0
                                ? "text-emerald-700 dark:text-emerald-400 font-medium"
                                : "text-destructive font-medium"
                            }
                          >
                            {formatMAD(m.profit)}
                            {m.partial && (
                              <span className="text-muted-foreground"> *</span>
                            )}
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <Badge
                          variant={STATUS_VARIANTS[o.status]}
                          className={STATUS_CLASSES[o.status]}
                        >
                          {STATUS_LABELS[o.status]}
                        </Badge>
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground hidden lg:table-cell whitespace-nowrap">
                        {formatDateAr(o.created_at)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              disabled={updatingId === o.id}
                            >
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem
                              onClick={() =>
                                navigate({
                                  to: "/admin/orders/$orderId",
                                  params: { orderId: o.id },
                                })
                              }
                            >
                              <Eye className="h-4 w-4 ml-2" />
                              عرض الطلب
                            </DropdownMenuItem>
                            {(() => {
                              const currentStatus = (o.status === "preparing"
                                ? "processing"
                                : o.status) as OrderStatus;
                              const allowed = allowedNextStates(role, currentStatus);
                              if (allowed.length === 0) return null;
                              const META: Record<OrderStatus, { label: string; icon: typeof CheckCircle2; danger?: boolean }> = {
                                pending: { label: "قيد الانتظار", icon: CheckCircle2 },
                                confirmed: { label: "موافقة", icon: CheckCircle2 },
                                processing: { label: "قيد التحضير", icon: Package },
                                shipped: { label: "شحن", icon: Truck },
                                delivered: { label: "تم التسليم", icon: CheckCircle2 },
                                cancelled: { label: "إلغاء الطلب", icon: XCircle, danger: true },
                              };
                              return (
                                <>
                                  <DropdownMenuSeparator />
                                  {allowed.map((next) => {
                                    const m = META[next];
                                    const Icon = m.icon;
                                    return (
                                      <DropdownMenuItem
                                        key={next}
                                        className={m.danger ? "text-destructive focus:text-destructive" : ""}
                                        onClick={() => {
                                          if (next === "cancelled") setCancelTarget(o.id);
                                          else updateStatus(o.id, next);
                                        }}
                                      >
                                        <Icon className="h-4 w-4 ml-2" />
                                        {m.label}
                                      </DropdownMenuItem>
                                    );
                                  })}
                                </>
                              );
                            })()}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => !o && setCancelTarget(null)}>
        <AlertDialogContent dir="rtl">
          <AlertDialogHeader>
            <AlertDialogTitle>إلغاء الطلب</AlertDialogTitle>
            <AlertDialogDescription>
              هل أنت متأكد من إلغاء هذا الطلب؟ لا يمكن التراجع عن هذا الإجراء بسهولة.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>تراجع</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (cancelTarget) updateStatus(cancelTarget, "cancelled");
                setCancelTarget(null);
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
