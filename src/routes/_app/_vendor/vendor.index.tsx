import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ShoppingBag,
  TrendingUp,
  Calendar,
  AlertTriangle,
  Loader2,
  ArrowLeft,
  Package,
  Clock,
  CheckCircle2,
  Truck,
  XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export const Route = createFileRoute("/_app/_vendor/vendor/")({
  component: VendorDashboard,
  head: () => ({ meta: [{ title: "لوحة التحكم — Nexora" }] }),
});

interface DashboardStats {
  revenueToday: number;
  revenueMonth: number;
  ordersByStatus: Record<OrderStatus, number>;
  recentOrders: {
    id: string;
    order_number: string;
    total_mad: number;
    status: OrderStatus;
    created_at: string;
    buyer_id: string;
    buyer_name: string;
  }[];
  lowStock: { id: string; name_ar: string; stock: number; low_stock_threshold: number }[];
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

function VendorDashboard() {
  const { companyId } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;

    (async () => {
      setLoading(true);
      const now = new Date();
      const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

      // Counted-revenue statuses: confirmed and beyond, excluding cancelled.
      const REVENUE_STATUSES: OrderStatus[] = [
        "confirmed",
        "processing",
        "preparing",
        "shipped",
        "delivered",
      ];

      const [
        { data: revToday },
        { data: revMonth },
        { data: allOrders },
        { data: recent },
        { data: products },
      ] = await Promise.all([
        supabase
          .from("orders")
          .select("total_mad")
          .eq("company_id", companyId)
          .in("status", REVENUE_STATUSES)
          .gte("created_at", startOfDay),
        supabase
          .from("orders")
          .select("total_mad")
          .eq("company_id", companyId)
          .in("status", REVENUE_STATUSES)
          .gte("created_at", startOfMonth),
        supabase
          .from("orders")
          .select("status")
          .eq("company_id", companyId),
        supabase
          .from("orders")
          .select("id, order_number, total_mad, status, created_at, buyer_id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("products")
          .select("id, name_ar, stock, low_stock_threshold")
          .eq("company_id", companyId)
          .eq("active", true)
          .not("stock", "is", null)
          .order("stock", { ascending: true })
          .limit(20),
      ]);

      if (!alive) return;

      const revenueToday = (revToday ?? []).reduce((s, r) => s + Number(r.total_mad ?? 0), 0);
      const revenueMonth = (revMonth ?? []).reduce((s, r) => s + Number(r.total_mad ?? 0), 0);

      const ordersByStatus: Record<OrderStatus, number> = {
        pending: 0, confirmed: 0, processing: 0, preparing: 0,
        shipped: 0, delivered: 0, cancelled: 0,
      };
      (allOrders ?? []).forEach((o) => {
        ordersByStatus[o.status as OrderStatus] += 1;
      });

      // Resolve buyer names
      const buyerIds = Array.from(new Set((recent ?? []).map((o) => o.buyer_id)));
      const { data: profiles } = buyerIds.length
        ? await supabase.from("profiles").select("id, full_name").in("id", buyerIds)
        : { data: [] as { id: string; full_name: string }[] };
      const nameMap = new Map((profiles ?? []).map((p) => [p.id, p.full_name || "عميل"]));

      const recentOrders = (recent ?? []).map((o) => ({
        ...o,
        buyer_name: nameMap.get(o.buyer_id) || "عميل",
      }));

      const lowStock = (products ?? [])
        .filter((p) => Number(p.stock ?? 0) <= Number(p.low_stock_threshold ?? 0))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          name_ar: p.name_ar,
          stock: Number(p.stock ?? 0),
          low_stock_threshold: Number(p.low_stock_threshold ?? 0),
        }));

      setStats({ revenueToday, revenueMonth, ordersByStatus, recentOrders, lowStock });
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [companyId]);

  if (loading || !stats) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const totalActiveOrders =
    stats.ordersByStatus.pending +
    stats.ordersByStatus.confirmed +
    stats.ordersByStatus.processing +
    stats.ordersByStatus.preparing +
    stats.ordersByStatus.shipped;

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">لوحة التحكم</h1>
        <p className="text-sm text-muted-foreground mt-1">نظرة عامة على نشاط متجرك</p>
      </header>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<Calendar className="h-5 w-5" />}
          label="إيرادات اليوم"
          value={formatMAD(stats.revenueToday)}
          tone="text-primary"
        />
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="إيرادات الشهر"
          value={formatMAD(stats.revenueMonth)}
          tone="text-success"
        />
        <KpiCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="طلبات نشطة"
          value={totalActiveOrders.toString()}
          tone="text-foreground"
        />
        <KpiCard
          icon={<AlertTriangle className="h-5 w-5" />}
          label="مخزون منخفض"
          value={stats.lowStock.length.toString()}
          tone={stats.lowStock.length > 0 ? "text-destructive" : "text-foreground"}
        />
      </div>

      {/* Orders by status */}
      <Card className="p-5">
        <h2 className="text-base font-bold mb-4">الطلبات حسب الحالة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatusTile icon={<Clock className="h-4 w-4" />} label="قيد الانتظار" count={stats.ordersByStatus.pending} />
          <StatusTile icon={<CheckCircle2 className="h-4 w-4" />} label="مؤكد" count={stats.ordersByStatus.confirmed} />
          <StatusTile icon={<Package className="h-4 w-4" />} label="قيد المعالجة" count={stats.ordersByStatus.processing} />
          <StatusTile icon={<Package className="h-4 w-4" />} label="قيد التحضير" count={stats.ordersByStatus.preparing} />
          <StatusTile icon={<Truck className="h-4 w-4" />} label="تم الشحن" count={stats.ordersByStatus.shipped} />
          <StatusTile icon={<CheckCircle2 className="h-4 w-4" />} label="تم التسليم" count={stats.ordersByStatus.delivered} />
          <StatusTile icon={<XCircle className="h-4 w-4" />} label="ملغي" count={stats.ordersByStatus.cancelled} />
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Recent orders */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">أحدث الطلبات</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/vendor/orders">
                عرض الكل
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {stats.recentOrders.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد طلبات بعد</p>
          ) : (
            <ul className="divide-y">
              {stats.recentOrders.map((o) => (
                <li key={o.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-sm font-semibold">{o.order_number}</span>
                      <Badge variant="secondary" className={STATUS_TONE[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 truncate">
                      {o.buyer_name} · {new Date(o.created_at).toLocaleDateString("ar")}
                    </p>
                  </div>
                  <div className="text-sm font-bold whitespace-nowrap">{formatMAD(Number(o.total_mad))}</div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Low stock */}
        <Card className="p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-bold">تنبيهات المخزون المنخفض</h2>
            <Button asChild variant="ghost" size="sm">
              <Link to="/vendor/products">
                إدارة المنتجات
                <ArrowLeft className="h-4 w-4" />
              </Link>
            </Button>
          </div>
          {stats.lowStock.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">جميع المنتجات بمخزون كافٍ ✓</p>
          ) : (
            <ul className="divide-y">
              {stats.lowStock.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
                    <span className="text-sm font-medium truncate">{p.name_ar}</span>
                  </div>
                  <div className="text-xs whitespace-nowrap">
                    <span className="font-bold text-destructive">{p.stock}</span>
                    <span className="text-muted-foreground"> / {p.low_stock_threshold}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

function KpiCard({
  icon, label, value, tone,
}: { icon: React.ReactNode; label: string; value: string; tone: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</div>
    </Card>
  );
}

function StatusTile({
  icon, label, count,
}: { icon: React.ReactNode; label: string; count: number }) {
  return (
    <div className="rounded-lg border bg-card p-3 text-center">
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-xl font-bold">{count}</div>
    </div>
  );
}
