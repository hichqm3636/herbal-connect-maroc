import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  ClipboardList,
  Wallet,
  Activity,
  TrendingUp,
  TrendingDown,
  Plus,
  Settings,
  ArrowLeft,
  CheckCircle2,
  Clock,
  Package,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMAD } from "@/lib/format";

export const Route = createFileRoute("/_app/super-admin/")({
  component: SuperAdminDashboard,
});

interface Overview {
  companies: number;
  distributors: number;
  products: number;
  orders: number;
  gmv: number;
  ordersThisWeek: number;
  ordersLastWeek: number;
  pendingOrders: number;
  // Growth (last 30 days)
  newCompanies30d: number;
  newDistributors30d: number;
  newProducts30d: number;
  newOrders30d: number;
  // Health
  companiesWithoutOrders: number;
  productsWithoutSales: number;
}

interface TopCompany {
  id: string;
  name: string;
  total: number;
  orders: number;
  delta: number | null; // % change vs previous window; null when not applicable
}

interface TopProduct {
  id: string;
  name: string;
  company: string;
  units: number;
  revenue: number;
  delta: number | null;
}

interface ActivityRow {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown>;
  company_name?: string;
}

const ACTION_LABELS: Record<string, string> = {
  order_status_change: "تحديث حالة طلب",
  create_territory: "إنشاء منطقة",
  update_territory: "تعديل منطقة",
  delete_territory: "حذف منطقة",
  create_distributor: "إضافة موزع",
  create_company: "إنشاء شركة",
};

function describeActivity(row: ActivityRow): string {
  const company = row.company_name ? row.company_name : "المنصة";
  const meta = row.metadata || {};
  if (row.action === "order_status_change") {
    const num = (meta as { order_number?: string }).order_number ?? "";
    const status = (meta as { new_status?: string }).new_status ?? "";
    return `${company} — طلب ${num} → ${status}`;
  }
  const label = ACTION_LABELS[row.action] ?? row.action;
  return `${company} — ${label}`;
}

type TopWindow = "all" | "30d" | "7d";

const WINDOW_OPTIONS: Array<{ value: TopWindow; label: string }> = [
  { value: "all", label: "كل الأوقات" },
  { value: "30d", label: "آخر 30 يوماً" },
  { value: "7d", label: "هذا الأسبوع" },
];

function WindowToggle({
  value,
  onChange,
}: {
  value: TopWindow;
  onChange: (v: TopWindow) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border bg-muted/40 p-0.5 text-[11px]">
      {WINDOW_OPTIONS.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={`px-2 py-1 rounded-md transition-colors ${
            value === o.value
              ? "bg-background shadow-sm font-medium text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function DeltaBadge({ delta }: { delta: number | null }) {
  if (delta === null) return null;
  const up = delta >= 0;
  const Icon = up ? TrendingUp : TrendingDown;
  return (
    <span
      className={`inline-flex items-center gap-0.5 text-[10px] font-medium ${
        up ? "text-success" : "text-destructive"
      }`}
    >
      <Icon className="h-3 w-3" />
      {up ? "+" : ""}
      {delta}%
    </span>
  );
}

function SuperAdminDashboard() {
  const [stats, setStats] = useState<Overview>({
    companies: 0,
    distributors: 0,
    products: 0,
    orders: 0,
    gmv: 0,
    ordersThisWeek: 0,
    ordersLastWeek: 0,
    pendingOrders: 0,
    newCompanies30d: 0,
    newDistributors30d: 0,
    newProducts30d: 0,
    newOrders30d: 0,
    companiesWithoutOrders: 0,
    productsWithoutSales: 0,
  });
  const [topWindow, setTopWindow] = useState<"all" | "30d" | "7d">("all");
  const [companyMap, setCompanyMap] = useState<Map<string, string>>(new Map());
  const [productMap, setProductMap] = useState<Map<string, { name: string; company_id: string }>>(
    new Map(),
  );
  const [allOrders, setAllOrders] = useState<
    Array<{ company_id: string; total_mad: number; created_at: string; id: string }>
  >([]);
  const [allItems, setAllItems] = useState<
    Array<{ product_id: string; quantity: number; unit_price_mad: number; order_id: string }>
  >([]);
  const [orderDateById, setOrderDateById] = useState<Map<string, number>>(new Map());
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const startWeek = new Date(now);
      startWeek.setDate(startWeek.getDate() - 7);
      const startLastWeek = new Date(now);
      startLastWeek.setDate(startLastWeek.getDate() - 14);
      const start30d = new Date(now);
      start30d.setDate(start30d.getDate() - 30);

      const [
        companiesRes,
        distributorsRes,
        productsCountRes,
        ordersCountRes,
        ordersAllRes,
        thisWeekRes,
        lastWeekRes,
        pendingRes,
        newCompanies30dRes,
        newDistributors30dRes,
        newProducts30dRes,
        newOrders30dRes,
        activityRes,
        companiesListRes,
        orderItemsRes,
        productsRes,
      ] = await Promise.all([
        supabase.from("companies").select("id, name", { count: "exact" }),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("account_type", "distributor"),
        supabase.from("products").select("*", { count: "exact", head: true }),
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase.from("orders").select("id, company_id, total_mad, created_at"),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startWeek.toISOString()),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .gte("created_at", startLastWeek.toISOString())
          .lt("created_at", startWeek.toISOString()),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "pending"),
        supabase
          .from("companies")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start30d.toISOString()),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("account_type", "distributor")
          .gte("created_at", start30d.toISOString()),
        supabase
          .from("products")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start30d.toISOString()),
        supabase
          .from("orders")
          .select("*", { count: "exact", head: true })
          .gte("created_at", start30d.toISOString()),
        supabase
          .from("admin_activity_log")
          .select("id, action, created_at, metadata, company_id")
          .order("created_at", { ascending: false })
          .limit(10),
        supabase.from("companies").select("id, display_name, name"),
        supabase.from("order_items").select("product_id, quantity, unit_price_mad, order_id"),
        supabase.from("products").select("id, name_ar, company_id"),
      ]);

      const cMap = new Map<string, string>();
      (companiesListRes.data ?? []).forEach((c: { id: string; display_name: string; name: string }) =>
        cMap.set(c.id, c.display_name || c.name),
      );

      const ordersData = (ordersAllRes.data ?? []) as Array<{
        id: string;
        company_id: string;
        total_mad: number;
        created_at: string;
      }>;

      let gmv = 0;
      const dateById = new Map<string, number>();
      ordersData.forEach((o) => {
        gmv += Number(o.total_mad) || 0;
        dateById.set(o.id, new Date(o.created_at).getTime());
      });

      const companiesWithOrders = new Set(ordersData.map((o) => o.company_id));
      const companiesWithoutOrders = Math.max(
        0,
        (companiesRes.count ?? 0) - companiesWithOrders.size,
      );

      const itemsData = (orderItemsRes.data ?? []) as Array<{
        product_id: string;
        quantity: number;
        unit_price_mad: number;
        order_id: string;
      }>;
      const productsWithSales = new Set(itemsData.map((it) => it.product_id));
      const productsWithoutSales = Math.max(
        0,
        (productsCountRes.count ?? 0) - productsWithSales.size,
      );

      const enrichedActivity: ActivityRow[] = (activityRes.data ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        created_at: r.created_at,
        metadata:
          r.metadata && typeof r.metadata === "object" && !Array.isArray(r.metadata)
            ? (r.metadata as Record<string, unknown>)
            : {},
        company_name: r.company_id ? cMap.get(r.company_id) : undefined,
      }));

      const pMap = new Map<string, { name: string; company_id: string }>();
      (productsRes.data ?? []).forEach((p: { id: string; name_ar: string; company_id: string }) =>
        pMap.set(p.id, { name: p.name_ar, company_id: p.company_id }),
      );

      setCompanyMap(cMap);
      setProductMap(pMap);
      setAllOrders(ordersData);
      setAllItems(itemsData);
      setOrderDateById(dateById);
      setStats({
        companies: companiesRes.count ?? 0,
        distributors: distributorsRes.count ?? 0,
        products: productsCountRes.count ?? 0,
        orders: ordersCountRes.count ?? 0,
        gmv,
        ordersThisWeek: thisWeekRes.count ?? 0,
        ordersLastWeek: lastWeekRes.count ?? 0,
        pendingOrders: pendingRes.count ?? 0,
        newCompanies30d: newCompanies30dRes.count ?? 0,
        newDistributors30d: newDistributors30dRes.count ?? 0,
        newProducts30d: newProducts30dRes.count ?? 0,
        newOrders30d: newOrders30dRes.count ?? 0,
        companiesWithoutOrders,
        productsWithoutSales,
      });
      setActivity(enrichedActivity);
      setLoading(false);
    })();
  }, []);

  const windowDays = topWindow === "all" ? 0 : topWindow === "7d" ? 7 : 30;
  const windowStart = useMemo(
    () => (windowDays === 0 ? 0 : Date.now() - windowDays * 24 * 60 * 60 * 1000),
    [windowDays],
  );
  const prevStart = useMemo(
    () => (windowDays === 0 ? 0 : Date.now() - windowDays * 2 * 24 * 60 * 60 * 1000),
    [windowDays],
  );

  function pctDelta(curr: number, prev: number): number | null {
    if (prev === 0) return curr > 0 ? 100 : null;
    return Math.round(((curr - prev) / prev) * 100);
  }

  const topCompanies: TopCompany[] = useMemo(() => {
    const curr = new Map<string, { total: number; orders: number }>();
    const prev = new Map<string, number>();
    allOrders.forEach((o) => {
      const ts = new Date(o.created_at).getTime();
      const t = Number(o.total_mad) || 0;
      if (windowStart === 0 || ts >= windowStart) {
        const c = curr.get(o.company_id) ?? { total: 0, orders: 0 };
        c.total += t;
        c.orders += 1;
        curr.set(o.company_id, c);
      } else if (windowDays > 0 && ts >= prevStart && ts < windowStart) {
        prev.set(o.company_id, (prev.get(o.company_id) ?? 0) + t);
      }
    });
    return Array.from(curr.entries())
      .map(([id, v]) => ({
        id,
        name: companyMap.get(id) ?? "—",
        ...v,
        delta: windowDays === 0 ? null : pctDelta(v.total, prev.get(id) ?? 0),
      }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [allOrders, companyMap, windowStart, prevStart, windowDays]);

  const topProducts: TopProduct[] = useMemo(() => {
    const curr = new Map<string, { units: number; revenue: number }>();
    const prev = new Map<string, number>();
    allItems.forEach((it) => {
      const ts = orderDateById.get(it.order_id) ?? 0;
      const rev = (Number(it.quantity) || 0) * (Number(it.unit_price_mad) || 0);
      if (windowStart === 0 || ts >= windowStart) {
        const c = curr.get(it.product_id) ?? { units: 0, revenue: 0 };
        c.units += Number(it.quantity) || 0;
        c.revenue += rev;
        curr.set(it.product_id, c);
      } else if (windowDays > 0 && ts >= prevStart && ts < windowStart) {
        prev.set(it.product_id, (prev.get(it.product_id) ?? 0) + rev);
      }
    });
    return Array.from(curr.entries())
      .map(([id, v]) => {
        const p = productMap.get(id);
        return {
          id,
          name: p?.name ?? "—",
          company: p ? (companyMap.get(p.company_id) ?? "—") : "—",
          units: v.units,
          revenue: v.revenue,
          delta: windowDays === 0 ? null : pctDelta(v.revenue, prev.get(id) ?? 0),
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [allItems, orderDateById, productMap, companyMap, windowStart, prevStart, windowDays]);

  const growth =
    stats.ordersLastWeek === 0
      ? stats.ordersThisWeek > 0
        ? 100
        : 0
      : Math.round(((stats.ordersThisWeek - stats.ordersLastWeek) / stats.ordersLastWeek) * 100);
  const growthUp = growth >= 0;

  const overviewCards = [
    {
      label: "الشركات",
      value: stats.companies.toLocaleString("ar-MA"),
      icon: Building2,
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "الموزعون",
      value: stats.distributors.toLocaleString("ar-MA"),
      icon: Users,
      accent: "bg-success/10 text-success",
    },
    {
      label: "المنتجات",
      value: stats.products.toLocaleString("ar-MA"),
      icon: Package,
      accent: "bg-accent/40 text-accent-foreground",
    },
    {
      label: "الطلبات",
      value: stats.orders.toLocaleString("ar-MA"),
      icon: ClipboardList,
      accent: "bg-warning/15 text-warning-foreground",
      trend: growth,
    },
    {
      label: "إجمالي المبيعات",
      value: formatMAD(stats.gmv),
      icon: Wallet,
      accent: "bg-primary/10 text-primary",
    },
  ];

  const growthCards = [
    { label: "شركات جديدة (30 يوماً)", value: stats.newCompanies30d, icon: Building2 },
    { label: "موزعون جدد (30 يوماً)", value: stats.newDistributors30d, icon: Users },
    { label: "منتجات جديدة (30 يوماً)", value: stats.newProducts30d, icon: Package },
    { label: "طلبات جديدة (30 يوماً)", value: stats.newOrders30d, icon: ClipboardList },
  ];

  const healthCards = [
    { label: "طلبات قيد الانتظار", value: stats.pendingOrders, icon: Clock },
    { label: "شركات بدون طلبات", value: stats.companiesWithoutOrders, icon: Building2 },
    { label: "منتجات بدون مبيعات", value: stats.productsWithoutSales, icon: Package },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة المنصة</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على نشاط المنصة بالكامل</p>
        </div>
        <Badge variant={growthUp ? "default" : "destructive"} className="gap-1 text-xs">
          {growthUp ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          نمو الطلبات هذا الأسبوع: {growthUp ? "+" : ""}
          {growth}%
        </Badge>
      </div>

      {/* Overview metrics */}
      <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-5">
        {overviewCards.map((c) => (
          <Card key={c.label} className="shadow-soft">
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="mt-2 text-xl font-bold tracking-tight truncate">
                    {loading ? "…" : c.value}
                  </p>
                  {typeof c.trend === "number" && !loading && (
                    <p
                      className={`mt-1 inline-flex items-center gap-0.5 text-[11px] ${
                        c.trend >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {c.trend >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {c.trend >= 0 ? "+" : ""}
                      {c.trend}%
                    </p>
                  )}
                </div>
                <div className={`flex h-9 w-9 items-center justify-center rounded-xl shrink-0 ${c.accent}`}>
                  <c.icon className="h-4 w-4" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Platform Growth */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">نمو المنصة (آخر 30 يوماً)</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {growthCards.map((g) => (
            <div
              key={g.label}
              className="flex items-center gap-3 rounded-lg border bg-card/50 p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-success/10 text-success">
                <g.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold flex items-center gap-1">
                  {loading ? "…" : g.value.toLocaleString("ar-MA")}
                  {!loading && g.value > 0 && (
                    <TrendingUp className="h-3 w-3 text-success" />
                  )}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{g.label}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      {/* Quick Actions */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">إجراءات سريعة</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to="/super-admin/companies">
              <Plus className="h-4 w-4 ms-1" />
              إنشاء شركة
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to="/super-admin/companies">
              <Building2 className="h-4 w-4 ms-1" />
              عرض الشركات
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to="/super-admin/order-rules">
              <ClipboardList className="h-4 w-4 ms-1" />
              قواعد الطلب
            </Link>
          </Button>
          <Button asChild variant="outline" size="sm" className="justify-start">
            <Link to="/super-admin/pricing-tiers">
              <Settings className="h-4 w-4 ms-1" />
              إعدادات المنصة
            </Link>
          </Button>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Top Companies */}
        <Card className="shadow-soft">
          <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
            <CardTitle className="text-base">أفضل الشركات مبيعاً</CardTitle>
            <WindowToggle value={topWindow} onChange={setTopWindow} />
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : topCompanies.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا توجد بيانات بعد</p>
            ) : (
              <ul className="space-y-2">
                {topCompanies.map((c, i) => (
                  <li
                    key={c.id}
                    className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold">
                        {i + 1}
                      </span>
                      <span className="truncate text-sm font-medium">{c.name}</span>
                    </div>
                    <div className="text-left shrink-0">
                      <div className="text-sm font-bold">{formatMAD(c.total)}</div>
                      <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                        <span>{c.orders.toLocaleString("ar-MA")} طلب</span>
                        <DeltaBadge delta={c.delta} />
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        {/* Activity Feed */}
        <Card className="shadow-soft">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle className="text-base">آخر نشاط على المنصة</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
            ) : activity.length === 0 ? (
              <p className="text-sm text-muted-foreground">لا يوجد نشاط حديث</p>
            ) : (
              <ul className="space-y-2">
                {activity.map((a) => (
                  <li key={a.id} className="flex items-start gap-2 text-sm">
                    <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate">{describeActivity(a)}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {new Date(a.created_at).toLocaleString("ar-MA")}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Top Products Across Platform */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3 flex flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Package className="h-4 w-4 text-muted-foreground" />
            <CardTitle className="text-base">أفضل المنتجات مبيعاً في المنصة</CardTitle>
          </div>
          <WindowToggle value={topWindow} onChange={setTopWindow} />
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">جارٍ التحميل…</p>
          ) : topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد بيانات بعد</p>
          ) : (
            <ul className="space-y-2">
              {topProducts.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border bg-card/50 px-3 py-2"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-muted text-xs font-bold shrink-0">
                      {i + 1}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{p.name}</div>
                      <div className="truncate text-[11px] text-muted-foreground">{p.company}</div>
                    </div>
                  </div>
                  <div className="text-left shrink-0">
                    <div className="text-sm font-bold">{formatMAD(p.revenue)}</div>
                    <div className="flex items-center justify-end gap-1.5 text-[11px] text-muted-foreground">
                      <span>{p.units.toLocaleString("ar-MA")} وحدة</span>
                      <DeltaBadge delta={p.delta} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {/* Platform Health */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">حالة المنصة</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 grid-cols-2 lg:grid-cols-4">
          {healthCards.map((h) => (
            <div
              key={h.label}
              className="flex items-center gap-3 rounded-lg border bg-card/50 p-3"
            >
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted">
                <h.icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-lg font-bold">
                  {loading ? "…" : h.value.toLocaleString("ar-MA")}
                </div>
                <div className="text-[11px] text-muted-foreground truncate">{h.label}</div>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex justify-end">
        <Button asChild variant="ghost" size="sm">
          <Link to="/super-admin/companies">
            إدارة الشركات
            <ArrowLeft className="h-4 w-4 ms-1" />
          </Link>
        </Button>
      </div>
    </div>
  );
}
