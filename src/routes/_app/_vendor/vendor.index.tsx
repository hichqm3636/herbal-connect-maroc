import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  Sparkles,
} from "lucide-react";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import type { Database } from "@/integrations/supabase/types";
import { PlanUsageCard } from "@/components/vendor/PlanUsageCard";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export const Route = createFileRoute("/_app/_vendor/vendor/")({
  component: VendorDashboard,
  head: () => ({ meta: [{ title: "لوحة التحكم — Nexora" }] }),
});

interface MonthlyPoint {
  key: string; // YYYY-MM
  label: string; // عرض عربي مختصر
  revenue: number;
  orders: number;
}

interface DailyPoint {
  key: string; // YYYY-MM-DD
  label: string; // DD/MM
  revenue: number;
}

interface DashboardStats {
  revenueToday: number;
  revenueMonth: number;
  ordersTotal: number;
  ordersMonth: number;
  loyaltyPoints: number;
  ordersByStatus: Record<OrderStatus, number>;
  monthly: MonthlyPoint[];
  daily14: DailyPoint[];
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

// لوحة ألوان مشتقة من نظام التصميم (HSL tokens)
const PIE_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--success))",
  "hsl(var(--warning))",
  "hsl(var(--destructive))",
  "hsl(var(--muted-foreground))",
  "hsl(var(--accent-foreground))",
  "hsl(var(--secondary-foreground))",
];

const AR_MONTHS_SHORT = [
  "يناير", "فبراير", "مارس", "أبريل", "ماي", "يونيو",
  "يوليو", "غشت", "شتنبر", "أكتوبر", "نونبر", "دجنبر",
];

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
      // نافذة آخر 6 أشهر (شامل الشهر الحالي)
      const startOfWindow = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString();

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
        { data: monthlyOrders },
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
          .select("total_mad, status, created_at")
          .eq("company_id", companyId)
          .gte("created_at", startOfWindow)
          .order("created_at", { ascending: true }),
        supabase
          .from("orders")
          .select("id, order_number, total_mad, status, created_at, buyer_id")
          .eq("company_id", companyId)
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("products")
          .select("id, name_ar, stock, low_stock_threshold, points_per_unit")
          .eq("company_id", companyId)
          .eq("active", true)
          .order("stock", { ascending: true }),
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
      const ordersTotal = (allOrders ?? []).length;

      // بناء سلسلة شهرية لآخر 6 أشهر
      const buckets = new Map<string, MonthlyPoint>();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        buckets.set(key, {
          key,
          label: AR_MONTHS_SHORT[d.getMonth()],
          revenue: 0,
          orders: 0,
        });
      }
      let ordersMonth = 0;
      (monthlyOrders ?? []).forEach((o) => {
        const d = new Date(o.created_at as string);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
        const b = buckets.get(key);
        if (!b) return;
        b.orders += 1;
        if (REVENUE_STATUSES.includes(o.status as OrderStatus)) {
          b.revenue += Number(o.total_mad ?? 0);
        }
        if (key === `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`) {
          ordersMonth += 1;
        }
      });
      const monthly = Array.from(buckets.values());

      // Last 14 days delivered revenue (daily series).
      const dailyMap = new Map<string, DailyPoint>();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      for (let i = 13; i >= 0; i--) {
        const d = new Date(today.getTime() - i * 86_400_000);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        dailyMap.set(k, {
          key: k,
          label: `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`,
          revenue: 0,
        });
      }
      (monthlyOrders ?? []).forEach((o) => {
        if (o.status !== "delivered") return;
        const d = new Date(o.created_at as string);
        const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
        const b = dailyMap.get(k);
        if (b) b.revenue += Number(o.total_mad ?? 0);
      });
      const daily14 = Array.from(dailyMap.values());

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
        .filter((p) => p.stock != null && Number(p.stock) <= Number(p.low_stock_threshold ?? 0))
        .slice(0, 5)
        .map((p) => ({
          id: p.id,
          name_ar: p.name_ar,
          stock: Number(p.stock ?? 0),
          low_stock_threshold: Number(p.low_stock_threshold ?? 0),
        }));

      // مجموع نقاط الولاء = Σ (points_per_unit × stock_remaining_potential)
      // كقياس تقريبي للنقاط القابلة للمنح من المخزون الحالي.
      const loyaltyPoints = (products ?? []).reduce((s, p) => {
        const pts = Number(p.points_per_unit ?? 0);
        const stk = Number(p.stock ?? 0);
        return s + pts * stk;
      }, 0);

      setStats({
        revenueToday,
        revenueMonth,
        ordersTotal,
        ordersMonth,
        loyaltyPoints,
        ordersByStatus,
        monthly,
        daily14,
        recentOrders,
        lowStock,
      });
      setLoading(false);
    })();

    return () => {
      alive = false;
    };
  }, [companyId]);

  const statusPie = useMemo(() => {
    if (!stats) return [];
    return (Object.keys(stats.ordersByStatus) as OrderStatus[])
      .map((k) => ({ name: STATUS_LABELS[k], value: stats.ordersByStatus[k] }))
      .filter((d) => d.value > 0);
  }, [stats]);

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
        <p className="text-sm text-muted-foreground mt-1">
          ملخّص أداء متجرك: المبيعات، الطلبات، ونقاط الولاء
        </p>
      </header>

      {/* KPI cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          icon={<TrendingUp className="h-5 w-5" />}
          label="إيرادات الشهر"
          value={formatMAD(stats.revenueMonth)}
          hint={`اليوم: ${formatMAD(stats.revenueToday)}`}
          variant="green"
        />
        <KpiCard
          icon={<ShoppingBag className="h-5 w-5" />}
          label="إجمالي الطلبات"
          value={stats.ordersTotal.toString()}
          hint={`هذا الشهر: ${stats.ordersMonth}`}
          variant="blue"
        />
        <KpiCard
          icon={<Calendar className="h-5 w-5" />}
          label="طلبات نشطة"
          value={
            totalActiveOrders === 0
              ? "✅ كل شيء منجز!"
              : totalActiveOrders.toString()
          }
          hint={
            totalActiveOrders === 0
              ? "لا طلبات معلقة"
              : "قيد المعالجة والشحن"
          }
          variant={totalActiveOrders === 0 ? "green" : "orange"}
          smallValue={totalActiveOrders === 0}
        />
        <KpiCard
          icon={<Sparkles className="h-5 w-5" />}
          label="نقاط الولاء"
          value={stats.loyaltyPoints.toLocaleString("ar")}
          hint="قابلة للمنح من المخزون الحالي"
          variant="amber"
        />
      </div>

      {/* Last 14 days revenue (delivered orders) */}
      <Card className="p-5">
        <div className="mb-3">
          <h2 className="text-base font-bold">إيرادات آخر 14 يومًا</h2>
          <p className="text-xs text-muted-foreground mt-1">
            من الطلبات المُسلَّمة فقط
          </p>
        </div>
        <div className="h-56 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={stats.daily14} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis
                dataKey="label"
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
              />
              <YAxis
                stroke="hsl(var(--muted-foreground))"
                tick={{ fontSize: 11 }}
                width={50}
                tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                orientation="right"
              />
              <Tooltip
                contentStyle={{
                  background: "hsl(var(--card))",
                  border: "1px solid hsl(var(--border))",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => [formatMAD(Number(v)), "إيراد اليوم"]}
              />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <PlanUsageCard companyId={companyId} />

      {/* Charts */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Monthly revenue */}
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-bold">المبيعات الشهرية</h2>
              <p className="text-xs text-muted-foreground mt-1">آخر 6 أشهر (بالدرهم)</p>
            </div>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.monthly} margin={{ top: 10, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="revFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.45} />
                    <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  reversed
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  tick={{ fontSize: 12 }}
                  width={60}
                  tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : `${v}`)}
                  orientation="right"
                />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: 8,
                    fontSize: 12,
                  }}
                  formatter={(v: number) => [formatMAD(Number(v)), "الإيرادات"]}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#revFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Orders by status pie */}
        <Card className="p-5">
          <h2 className="text-base font-bold mb-1">توزيع الطلبات</h2>
          <p className="text-xs text-muted-foreground mb-4">حسب الحالة</p>
          <div className="h-72 w-full">
            {statusPie.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                لا توجد طلبات بعد
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={statusPie}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={80}
                    paddingAngle={2}
                  >
                    {statusPie.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: 8,
                      fontSize: 12,
                    }}
                  />
                  <Legend
                    wrapperStyle={{ fontSize: 11 }}
                    iconType="circle"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Orders by status tiles (quick filters) */}
      <Card className="p-5">
        <h2 className="text-base font-bold mb-4">الطلبات حسب الحالة</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
          <StatusTile status="pending" icon={<Clock className="h-4 w-4" />} label="قيد الانتظار" count={stats.ordersByStatus.pending} />
          <StatusTile status="confirmed" icon={<CheckCircle2 className="h-4 w-4" />} label="مؤكد" count={stats.ordersByStatus.confirmed} />
          <StatusTile status="processing" icon={<Package className="h-4 w-4" />} label="قيد المعالجة" count={stats.ordersByStatus.processing} />
          <StatusTile status="preparing" icon={<Package className="h-4 w-4" />} label="قيد التحضير" count={stats.ordersByStatus.preparing} />
          <StatusTile status="shipped" icon={<Truck className="h-4 w-4" />} label="تم الشحن" count={stats.ordersByStatus.shipped} />
          <StatusTile status="delivered" icon={<CheckCircle2 className="h-4 w-4" />} label="تم التسليم" count={stats.ordersByStatus.delivered} />
          <StatusTile status="cancelled" icon={<XCircle className="h-4 w-4" />} label="ملغي" count={stats.ordersByStatus.cancelled} />
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
                <li key={o.id}>
                  <Link
                    to="/vendor/orders"
                    search={{ focus: o.id }}
                    className="py-3 flex items-center justify-between gap-3 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                  >
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
                  </Link>
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
  icon, label, value, tone, hint,
}: { icon: React.ReactNode; label: string; value: string; tone: string; hint?: string }) {
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <span className="text-sm text-muted-foreground">{label}</span>
        <span className={tone}>{icon}</span>
      </div>
      <div className={`mt-2 text-2xl font-extrabold ${tone}`}>{value}</div>
      {hint && <div className="mt-1 text-xs text-muted-foreground">{hint}</div>}
    </Card>
  );
}

function StatusTile({
  status, icon, label, count,
}: { status: OrderStatus; icon: React.ReactNode; label: string; count: number }) {
  return (
    <Link
      to="/vendor/orders"
      search={{ status }}
      className="rounded-lg border bg-card p-3 text-center hover:bg-muted/50 hover:border-primary/40 transition-colors"
    >
      <div className="flex items-center justify-center gap-1.5 text-muted-foreground mb-1">
        {icon}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-xl font-bold">{count}</div>
    </Link>
  );
}
