import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Wallet,
  ShoppingCart,
  Users,
  TrendingUp,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Package,
  Truck,
  Plus,
  UserPlus,
  FileText,
  ListChecks,
} from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateAr, STATUS_LABELS, STATUS_VARIANTS, STATUS_CLASSES } from "@/lib/format";

export const Route = createFileRoute("/_app/_admin/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [{ title: "لوحة الإدارة — Nexora" }] }),
});

interface LowStockProduct {
  id: string;
  name_ar: string;
  stock: number | null;
  low_stock_threshold: number;
}

interface OrderStatusBreakdown {
  pending: number;
  confirmed: number;
  preparing: number;
  shipped: number;
  delivered: number;
  cancelled: number;
}

const EMPTY_BREAKDOWN: OrderStatusBreakdown = {
  pending: 0,
  confirmed: 0,
  preparing: 0,
  shipped: 0,
  delivered: 0,
  cancelled: 0,
};

function AdminDashboard() {
  const { companyId } = useAuth();
  const [stats, setStats] = useState({
    sales: 0,
    orders: 0,
    distributors: 0,
    todayOrders: 0,
  });
  const [breakdown, setBreakdown] = useState<OrderStatusBreakdown>(EMPTY_BREAKDOWN);
  const [recent, setRecent] = useState<{ id: string; order_number: string; status: string; total_mad: number; created_at: string }[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);

      const { data: allOrders } = await supabase
        .from("orders")
        .select("total_mad, status, created_at")
        .eq("company_id", companyId);

      const orders = allOrders ?? [];
      const totalSales = orders
        .filter((o) => o.status !== "cancelled")
        .reduce((s, o) => s + Number(o.total_mad), 0);

      const counts: OrderStatusBreakdown = { ...EMPTY_BREAKDOWN };
      for (const o of orders) {
        const k = o.status as keyof OrderStatusBreakdown;
        if (k in counts) counts[k] += 1;
      }
      const todayCount = orders.filter(
        (o) => new Date(o.created_at) >= startOfDay,
      ).length;

      const { count: distCount } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .in("role", ["distributor", "buyer"])
        .eq("company_id", companyId);

      const { data: r } = await supabase
        .from("orders")
        .select("id, order_number, status, total_mad, created_at")
        .eq("company_id", companyId)
        .order("created_at", { ascending: false })
        .limit(8);
      setRecent(r ?? []);

      const { data: prods } = await supabase
        .from("products")
        .select("id, name_ar, stock, low_stock_threshold")
        .eq("company_id", companyId)
        .eq("active", true);
      const low = (prods ?? [])
        // null stock = "available, qty unknown" → never considered low.
        .filter(
          (p): p is LowStockProduct =>
            typeof p.stock === "number" &&
            p.stock <= (p.low_stock_threshold ?? 5),
        )
        .sort((a, b) => (a.stock ?? 0) - (b.stock ?? 0));
      setLowStock(low);

      setBreakdown(counts);
      setStats({
        sales: totalSales,
        orders: orders.length,
        distributors: distCount ?? 0,
        todayOrders: todayCount,
      });
    })();
  }, [companyId]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">لوحة الإدارة</h1>
        <p className="text-sm text-muted-foreground mt-1">نظرة شاملة على أداء البوابة</p>
      </div>

      {/* KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={formatMAD(stats.sales)} icon={Wallet} accent="primary" />
        <StatCard label="طلبات اليوم" value={String(stats.todayOrders)} icon={TrendingUp} accent="success" />
        <StatCard label="إجمالي الطلبات" value={String(stats.orders)} icon={ShoppingCart} accent="success" />
        <StatCard label="عدد الشركاء" value={String(stats.distributors)} icon={Users} accent="warning" />
      </div>

      {/* Quick actions */}
      <Card className="p-5 shadow-soft">
        <h2 className="text-lg font-bold mb-4">إجراءات سريعة</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link to="/admin/products">
              <Plus className="h-4 w-4 me-2" />
              إضافة منتج
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link to="/admin/partners">
              <UserPlus className="h-4 w-4 me-2" />
              دعوة شريك
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link to="/admin/orders">
              <ListChecks className="h-4 w-4 me-2" />
              عرض الطلبات
            </Link>
          </Button>
          <Button asChild variant="outline" className="justify-start h-auto py-3">
            <Link to="/admin/invoices">
              <FileText className="h-4 w-4 me-2" />
              الفواتير
            </Link>
          </Button>
        </div>
      </Card>

      {/* Order status breakdown */}
      <Card className="p-5 shadow-soft">
        <h2 className="text-lg font-bold mb-4">حالة الطلبات</h2>
        <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
          <StatusTile label="قيد الانتظار" count={breakdown.pending} icon={Clock} tone="warning" />
          <StatusTile label="مؤكد" count={breakdown.confirmed} icon={CheckCircle2} tone="info" />
          <StatusTile label="قيد التحضير" count={breakdown.preparing} icon={Package} tone="info" />
          <StatusTile label="تم الشحن" count={breakdown.shipped} icon={Truck} tone="info" />
          <StatusTile label="تم التسليم" count={breakdown.delivered} icon={CheckCircle2} tone="success" />
          <StatusTile label="ملغى" count={breakdown.cancelled} icon={AlertTriangle} tone="muted" />
        </div>
      </Card>

      {lowStock.length > 0 && (
        <Card className="p-5 shadow-soft border-destructive/40">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-destructive" />
              <h2 className="text-lg font-bold">تنبيه: مخزون منخفض</h2>
              <Badge variant="outline" className="border-destructive text-destructive">
                {lowStock.length}
              </Badge>
            </div>
            <Link to="/admin/products" className="text-xs text-primary hover:underline">
              إدارة المنتجات
            </Link>
          </div>
          <div className="divide-y">
            {lowStock.slice(0, 6).map((p) => (
              <div key={p.id} className="flex items-center justify-between py-2.5">
                <p className="text-sm font-medium truncate flex-1 min-w-0">{p.name_ar}</p>
                <div className="flex items-center gap-2 shrink-0 ms-3">
                  <span className="text-xs text-muted-foreground">الحد: {p.low_stock_threshold}</span>
                  <Badge variant={p.stock === 0 ? "destructive" : "outline"} className={p.stock === 0 ? "" : "border-destructive text-destructive"}>
                    {p.stock === 0 ? "نفد" : `متبقي ${p.stock}`}
                  </Badge>
                </div>
              </div>
            ))}
            {lowStock.length > 6 && (
              <p className="pt-3 text-xs text-muted-foreground text-center">
                و {lowStock.length - 6} منتجات أخرى…
              </p>
            )}
          </div>
        </Card>
      )}

      <Card className="p-5 shadow-soft">
        <h2 className="text-lg font-bold mb-4">أحدث الطلبات</h2>
        {recent.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground py-8">لا توجد طلبات</p>
        ) : (
          <div className="divide-y">
            {recent.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateAr(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">{formatMAD(o.total_mad)}</span>
                  <Badge variant={STATUS_VARIANTS[o.status]} className={STATUS_CLASSES[o.status]}>
                    {STATUS_LABELS[o.status]}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}

function StatusTile({
  label,
  count,
  icon: Icon,
  tone,
}: {
  label: string;
  count: number;
  icon: typeof Clock;
  tone: "warning" | "info" | "success" | "muted";
}) {
  const toneClass = {
    warning: "text-amber-600 bg-amber-50 dark:bg-amber-950/30",
    info: "text-blue-600 bg-blue-50 dark:bg-blue-950/30",
    success: "text-emerald-600 bg-emerald-50 dark:bg-emerald-950/30",
    muted: "text-muted-foreground bg-muted",
  }[tone];

  return (
    <div className="rounded-lg border p-3">
      <div className={`inline-flex h-8 w-8 items-center justify-center rounded-md mb-2 ${toneClass}`}>
        <Icon className="h-4 w-4" />
      </div>
      <p className="text-2xl font-bold leading-none">{count}</p>
      <p className="text-xs text-muted-foreground mt-1">{label}</p>
    </div>
  );
}
