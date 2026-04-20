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
  orders: number;
  gmv: number;
  ordersThisWeek: number;
  ordersLastWeek: number;
  activeCompanies: number;
  companiesWithOrdersThisWeek: number;
  pendingOrders: number;
  ordersCompletedToday: number;
}

interface TopCompany {
  id: string;
  name: string;
  total: number;
  orders: number;
}

interface TopProduct {
  id: string;
  name: string;
  company: string;
  units: number;
  revenue: number;
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

function SuperAdminDashboard() {
  const [stats, setStats] = useState<Overview>({
    companies: 0,
    distributors: 0,
    orders: 0,
    gmv: 0,
    ordersThisWeek: 0,
    ordersLastWeek: 0,
    activeCompanies: 0,
    companiesWithOrdersThisWeek: 0,
    pendingOrders: 0,
    ordersCompletedToday: 0,
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
      const startToday = new Date(now);
      startToday.setHours(0, 0, 0, 0);
      const startWeek = new Date(now);
      startWeek.setDate(startWeek.getDate() - 7);
      const startLastWeek = new Date(now);
      startLastWeek.setDate(startLastWeek.getDate() - 14);

      const [
        companiesRes,
        distributorsRes,
        ordersCountRes,
        ordersAllRes,
        thisWeekRes,
        lastWeekRes,
        pendingRes,
        completedTodayRes,
        weekOrdersRes,
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
          .from("orders")
          .select("*", { count: "exact", head: true })
          .eq("status", "delivered")
          .gte("updated_at", startToday.toISOString()),
        supabase
          .from("orders")
          .select("company_id")
          .gte("created_at", startWeek.toISOString()),
        supabase
          .from("admin_activity_log")
          .select("id, action, created_at, metadata, company_id")
          .order("created_at", { ascending: false })
          .limit(8),
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

      const activeCompanies = new Set(ordersData.map((o) => o.company_id)).size;
      const companiesWithOrdersThisWeek = new Set(
        (weekOrdersRes.data ?? []).map((o: { company_id: string }) => o.company_id),
      ).size;

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
      setAllItems(
        (orderItemsRes.data ?? []) as Array<{
          product_id: string;
          quantity: number;
          unit_price_mad: number;
          order_id: string;
        }>,
      );
      setOrderDateById(dateById);
      setStats({
        companies: companiesRes.count ?? 0,
        distributors: distributorsRes.count ?? 0,
        orders: ordersCountRes.count ?? 0,
        gmv,
        ordersThisWeek: thisWeekRes.count ?? 0,
        ordersLastWeek: lastWeekRes.count ?? 0,
        activeCompanies,
        companiesWithOrdersThisWeek,
        pendingOrders: pendingRes.count ?? 0,
        ordersCompletedToday: completedTodayRes.count ?? 0,
      });
      setActivity(enrichedActivity);
      setLoading(false);
    })();
  }, []);

  const windowStart = useMemo(() => {
    if (topWindow === "all") return 0;
    const days = topWindow === "7d" ? 7 : 30;
    return Date.now() - days * 24 * 60 * 60 * 1000;
  }, [topWindow]);

  const topCompanies: TopCompany[] = useMemo(() => {
    const totals = new Map<string, { total: number; orders: number }>();
    allOrders.forEach((o) => {
      const ts = new Date(o.created_at).getTime();
      if (windowStart && ts < windowStart) return;
      const cur = totals.get(o.company_id) ?? { total: 0, orders: 0 };
      cur.total += Number(o.total_mad) || 0;
      cur.orders += 1;
      totals.set(o.company_id, cur);
    });
    return Array.from(totals.entries())
      .map(([id, v]) => ({ id, name: companyMap.get(id) ?? "—", ...v }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 5);
  }, [allOrders, companyMap, windowStart]);

  const topProducts: TopProduct[] = useMemo(() => {
    const agg = new Map<string, { units: number; revenue: number }>();
    allItems.forEach((it) => {
      if (windowStart) {
        const ts = orderDateById.get(it.order_id);
        if (!ts || ts < windowStart) return;
      }
      const cur = agg.get(it.product_id) ?? { units: 0, revenue: 0 };
      cur.units += Number(it.quantity) || 0;
      cur.revenue += (Number(it.quantity) || 0) * (Number(it.unit_price_mad) || 0);
      agg.set(it.product_id, cur);
    });
    return Array.from(agg.entries())
      .map(([id, v]) => {
        const p = productMap.get(id);
        return {
          id,
          name: p?.name ?? "—",
          company: p ? (companyMap.get(p.company_id) ?? "—") : "—",
          units: v.units,
          revenue: v.revenue,
        };
      })
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 5);
  }, [allItems, orderDateById, productMap, companyMap, windowStart]);

  const growth =
    stats.ordersLastWeek === 0
      ? stats.ordersThisWeek > 0
        ? 100
        : 0
      : Math.round(((stats.ordersThisWeek - stats.ordersLastWeek) / stats.ordersLastWeek) * 100);
  const growthUp = growth >= 0;

  const overviewCards = [
    {
      label: "إجمالي الشركات",
      value: stats.companies.toLocaleString("ar-MA"),
      icon: Building2,
      accent: "bg-primary/10 text-primary",
    },
    {
      label: "إجمالي الموزعين",
      value: stats.distributors.toLocaleString("ar-MA"),
      icon: Users,
      accent: "bg-success/10 text-success",
    },
    {
      label: "إجمالي الطلبات",
      value: stats.orders.toLocaleString("ar-MA"),
      icon: ClipboardList,
      accent: "bg-warning/15 text-warning-foreground",
      trend: growth,
    },
    {
      label: "إجمالي قيمة الطلبات",
      value: formatMAD(stats.gmv),
      icon: Wallet,
      accent: "bg-accent/40 text-accent-foreground",
    },
  ];

  const healthCards = [
    { label: "شركات نشطة", value: stats.activeCompanies, icon: Building2 },
    { label: "شركات لها طلبات هذا الأسبوع", value: stats.companiesWithOrdersThisWeek, icon: TrendingUp },
    { label: "طلبات قيد الانتظار", value: stats.pendingOrders, icon: Clock },
    { label: "طلبات مُسلَّمة اليوم", value: stats.ordersCompletedToday, icon: CheckCircle2 },
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
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {overviewCards.map((c) => (
          <Card key={c.label} className="shadow-soft">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground">{c.label}</p>
                  <p className="mt-2 text-2xl font-bold tracking-tight truncate">
                    {loading ? "…" : c.value}
                  </p>
                  {typeof c.trend === "number" && !loading && (
                    <p
                      className={`mt-1 inline-flex items-center gap-0.5 text-xs ${
                        c.trend >= 0 ? "text-success" : "text-destructive"
                      }`}
                    >
                      {c.trend >= 0 ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {c.trend >= 0 ? "+" : ""}
                      {c.trend}% أسبوعياً
                    </p>
                  )}
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-xl shrink-0 ${c.accent}`}>
                  <c.icon className="h-5 w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

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
                      <div className="text-[11px] text-muted-foreground">
                        {c.orders.toLocaleString("ar-MA")} طلب
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
        <CardHeader className="pb-3 flex flex-row items-center justify-between">
          <CardTitle className="text-base">أفضل المنتجات مبيعاً في المنصة</CardTitle>
          <Package className="h-4 w-4 text-muted-foreground" />
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
                    <div className="text-[11px] text-muted-foreground">
                      {p.units.toLocaleString("ar-MA")} وحدة
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
