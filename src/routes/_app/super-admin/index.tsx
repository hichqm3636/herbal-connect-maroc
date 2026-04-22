import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Building2,
  Users,
  ClipboardList,
  Wallet,
  Plus,
  Settings,
  ArrowLeft,
  Layers,
  Activity as ActivityIcon,
  Package,
  UserPlus,
  ShoppingCart,
  Sparkles,
  PieChart as PieChartIcon,
  Trophy,
  TrendingUp,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
import { formatMAD, formatDateAr, formatDateTimeAr } from "@/lib/format";

export const Route = createFileRoute("/_app/super-admin/")({
  component: SuperAdminDashboard,
  head: () => ({ meta: [{ title: "Nexora — لوحة المنصة" }] }),
});

interface PlatformStats {
  companies: number;
  distributors: number;
  orders: number;
  revenue: number;
}

interface RecentCompany {
  id: string;
  name: string;
  admin_email: string;
  city: string;
  products_count: number;
  created_at: string;
}

interface ActivityRow {
  id: string;
  action: string;
  created_at: string;
  metadata: Record<string, unknown>;
  company_name?: string;
}

const ORDER_STATUSES: Array<{ key: string; label: string; tone: string }> = [
  { key: "pending", label: "قيد الانتظار", tone: "bg-warning/15 text-warning-foreground" },
  { key: "confirmed", label: "مؤكد", tone: "bg-primary/10 text-primary" },
  { key: "preparing", label: "قيد التحضير", tone: "bg-accent/40 text-accent-foreground" },
  { key: "shipped", label: "تم الشحن", tone: "bg-blue-500/10 text-blue-600 dark:text-blue-400" },
  { key: "delivered", label: "تم التسليم", tone: "bg-success/10 text-success" },
];

interface CompanyRevenue {
  id: string;
  name: string;
  orders: number;
  revenue: number;
}

const ACTION_META: Record<string, { label: string; icon: typeof Building2; tone: string }> = {
  create_company: { label: "تسجيل شركة جديدة", icon: Building2, tone: "bg-primary/10 text-primary" },
  create_distributor: { label: "إضافة موزع جديد", icon: UserPlus, tone: "bg-success/10 text-success" },
  order_status_change: { label: "تحديث حالة طلب", icon: ShoppingCart, tone: "bg-warning/15 text-warning-foreground" },
  create_territory: { label: "إنشاء منطقة", icon: Layers, tone: "bg-accent/40 text-accent-foreground" },
  update_territory: { label: "تعديل منطقة", icon: Layers, tone: "bg-muted text-muted-foreground" },
  delete_territory: { label: "حذف منطقة", icon: Layers, tone: "bg-destructive/10 text-destructive" },
};

function describeActivity(row: ActivityRow): { label: string; detail: string } {
  const company = row.company_name ?? "المنصة";
  const meta = row.metadata || {};
  const base = ACTION_META[row.action]?.label ?? row.action;
  if (row.action === "order_status_change") {
    const num = (meta as { order_number?: string }).order_number ?? "";
    const status = (meta as { new_status?: string }).new_status ?? "";
    return { label: `${base} ${num}`, detail: `${company} → ${status}` };
  }
  return { label: base, detail: company };
}

function SuperAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({
    companies: 0,
    distributors: 0,
    orders: 0,
    revenue: 0,
  });
  const [recentCompanies, setRecentCompanies] = useState<RecentCompany[]>([]);
  const [activity, setActivity] = useState<ActivityRow[]>([]);
  const [ordersDaily, setOrdersDaily] = useState<Array<{ date: string; label: string; count: number }>>(
    [],
  );
  const [statusCounts, setStatusCounts] = useState<Record<string, number>>({});
  const [companyRevenue, setCompanyRevenue] = useState<CompanyRevenue[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const now = new Date();
      const start30d = new Date(now);
      start30d.setDate(start30d.getDate() - 30);

      const [
        companiesCountRes,
        distributorsRes,
        ordersCountRes,
        ordersRevenueRes,
        recentCompaniesRes,
        activityRes,
        companiesListRes,
        ordersLast30Res,
      ] = await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase
          .from("profiles")
          .select("*", { count: "exact", head: true })
          .eq("account_type", "distributor")
          .eq("is_active", true),
        supabase.from("orders").select("*", { count: "exact", head: true }),
        supabase.from("orders").select("total_mad, status, company_id"),
        supabase
          .from("companies")
          .select("id, name, display_name, created_at")
          .order("created_at", { ascending: false })
          .limit(5),
        supabase
          .from("admin_activity_log")
          .select("id, action, created_at, metadata, company_id")
          .order("created_at", { ascending: false })
          .limit(8),
        supabase.from("companies").select("id, display_name, name"),
        supabase
          .from("orders")
          .select("created_at")
          .gte("created_at", start30d.toISOString()),
      ]);

      const revenue = (ordersRevenueRes.data ?? []).reduce(
        (s, o) => s + (Number(o.total_mad) || 0),
        0,
      );

      const cMap = new Map<string, string>();
      (companiesListRes.data ?? []).forEach((c) =>
        cMap.set(c.id, c.display_name || c.name),
      );

      // Enrich recent companies with admin email + city + products count
      const recents = recentCompaniesRes.data ?? [];
      const recentIds = recents.map((c) => c.id);

      const [adminRolesRes, territoriesRes, productsByCompanyRes] = await Promise.all([
        recentIds.length
          ? supabase
              .from("user_roles")
              .select("user_id, company_id")
              .eq("role", "admin")
              .in("company_id", recentIds)
          : Promise.resolve({ data: [] as Array<{ user_id: string; company_id: string }> }),
        recentIds.length
          ? supabase
              .from("territories")
              .select("company_id, city, name")
              .in("company_id", recentIds)
          : Promise.resolve({ data: [] as Array<{ company_id: string; city: string | null; name: string }> }),
        recentIds.length
          ? supabase
              .from("products")
              .select("company_id")
              .in("company_id", recentIds)
          : Promise.resolve({ data: [] as Array<{ company_id: string }> }),
      ]);

      const adminUserByCompany = new Map<string, string>();
      (adminRolesRes.data ?? []).forEach((r) => {
        if (r.company_id && !adminUserByCompany.has(r.company_id)) {
          adminUserByCompany.set(r.company_id, r.user_id);
        }
      });

      const adminUserIds = Array.from(new Set(Array.from(adminUserByCompany.values())));
      const emailByUser = new Map<string, string>();
      if (adminUserIds.length) {
        // Fetch emails through the auth-aware path: profiles do not store email.
        // We fall back to "—" if not retrievable client-side.
        // Use rpc-less approach: nothing reliable client-side, so leave blank.
      }

      const cityByCompany = new Map<string, string>();
      (territoriesRes.data ?? []).forEach((t) => {
        if (!cityByCompany.has(t.company_id)) {
          cityByCompany.set(t.company_id, t.city || t.name || "—");
        }
      });

      const productsCountByCompany = new Map<string, number>();
      (productsByCompanyRes.data ?? []).forEach((p) => {
        productsCountByCompany.set(p.company_id, (productsCountByCompany.get(p.company_id) ?? 0) + 1);
      });

      const recentMapped: RecentCompany[] = recents.map((c) => ({
        id: c.id,
        name: c.display_name || c.name,
        admin_email: emailByUser.get(adminUserByCompany.get(c.id) ?? "") || "—",
        city: cityByCompany.get(c.id) || "—",
        products_count: productsCountByCompany.get(c.id) ?? 0,
        created_at: c.created_at,
      }));

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

      // Build orders/day for last 30 days (zero-filled)
      const buckets = new Map<string, number>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(now);
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() - i);
        buckets.set(d.toISOString().slice(0, 10), 0);
      }
      (ordersLast30Res.data ?? []).forEach((o) => {
        const key = new Date(o.created_at).toISOString().slice(0, 10);
        if (buckets.has(key)) buckets.set(key, (buckets.get(key) ?? 0) + 1);
      });
      const dailyArr = Array.from(buckets.entries()).map(([date, count]) => {
        const d = new Date(date);
        return {
          date,
          label: new Intl.DateTimeFormat("ar-MA", { day: "2-digit", month: "2-digit" }).format(d),
          count,
        };
      });

      setStats({
        companies: companiesCountRes.count ?? 0,
        distributors: distributorsRes.count ?? 0,
        orders: ordersCountRes.count ?? 0,
        revenue,
      });
      setRecentCompanies(recentMapped);
      setActivity(enrichedActivity);
      setOrdersDaily(dailyArr);
      setLoading(false);
    })();
  }, []);

  const overviewCards = useMemo(
    () => [
      {
        label: "إجمالي الشركات",
        value: stats.companies.toLocaleString("ar-MA"),
        icon: Building2,
        accent: "bg-primary/10 text-primary",
      },
      {
        label: "الموزعون النشطون",
        value: stats.distributors.toLocaleString("ar-MA"),
        icon: Users,
        accent: "bg-success/10 text-success",
      },
      {
        label: "إجمالي الطلبات",
        value: stats.orders.toLocaleString("ar-MA"),
        icon: ClipboardList,
        accent: "bg-warning/15 text-warning-foreground",
      },
      {
        label: "إيرادات المنصة",
        value: formatMAD(stats.revenue),
        icon: Wallet,
        accent: "bg-accent/40 text-accent-foreground",
      },
    ],
    [stats],
  );

  const chartConfig: ChartConfig = {
    count: { label: "الطلبات", color: "hsl(var(--primary))" },
  };

  return (
    <div className="space-y-6" dir="rtl">
      {/* Branded platform header */}
      <Card className="shadow-soft overflow-hidden border-primary/20">
        <CardContent className="p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div
                className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-primary/60 text-primary-foreground shadow-md shrink-0"
                aria-hidden="true"
              >
                <Sparkles className="h-6 w-6" />
              </div>
              <div className="min-w-0">
                <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Nexora</h1>
                <p className="text-xs sm:text-sm text-muted-foreground">
                  Distribution Management Platform · لوحة تحكم مالك المنصة
                </p>
              </div>
            </div>
            <Badge variant="outline" className="gap-1 text-[11px] border-primary/30 text-primary">
              <Sparkles className="h-3 w-3" />
              Super Admin
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* SECTION 1 — Platform Overview Cards */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
        {overviewCards.map((c) => (
          <Card key={c.label} className="shadow-soft hover:shadow-elegant transition-shadow">
            <CardContent className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-xs sm:text-sm text-muted-foreground">{c.label}</p>
                  <p className="mt-2 text-lg sm:text-2xl font-bold tracking-tight truncate">
                    {loading ? "…" : c.value}
                  </p>
                </div>
                <div
                  className={`flex h-9 w-9 sm:h-11 sm:w-11 items-center justify-center rounded-xl shrink-0 ${c.accent}`}
                  aria-hidden="true"
                >
                  <c.icon className="h-4 w-4 sm:h-5 sm:w-5" />
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* SECTION 4 — Growth Metrics (chart) */}
      <Card className="shadow-soft">
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <ActivityIcon className="h-4 w-4 text-primary" />
            الطلبات اليومية — آخر 30 يوماً
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-2">
          <ChartContainer config={chartConfig} className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ordersDaily} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={{ fontSize: 11 }}
                  interval="preserveStartEnd"
                  reversed
                />
                <YAxis tick={{ fontSize: 11 }} allowDecimals={false} orientation="right" width={32} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <Line
                  type="monotone"
                  dataKey="count"
                  stroke="var(--color-count)"
                  strokeWidth={2.5}
                  dot={false}
                  activeDot={{ r: 5 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </ChartContainer>
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-3">
        {/* SECTION 2 — Recent Companies (spans 2) */}
        <Card className="shadow-soft lg:col-span-2">
          <CardHeader className="pb-3 flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="h-4 w-4 text-primary" />
              الشركات الأخيرة
            </CardTitle>
            <Button asChild variant="ghost" size="sm" className="text-xs gap-1">
              <Link to="/super-admin/companies">
                عرض الكل
                <ArrowLeft className="h-3 w-3" />
              </Link>
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">الشركة</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">المسؤول</TableHead>
                    <TableHead className="text-right hidden md:table-cell">المنطقة</TableHead>
                    <TableHead className="text-right hidden sm:table-cell">المنتجات</TableHead>
                    <TableHead className="text-right hidden md:table-cell">تاريخ الإنشاء</TableHead>
                    <TableHead className="text-right">الإجراء</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loading ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        جاري التحميل…
                      </TableCell>
                    </TableRow>
                  ) : recentCompanies.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-sm text-muted-foreground py-6">
                        لا توجد شركات بعد
                      </TableCell>
                    </TableRow>
                  ) : (
                    recentCompanies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell className="hidden sm:table-cell text-muted-foreground text-xs">
                          {c.admin_email}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                          {c.city}
                        </TableCell>
                        <TableCell className="hidden sm:table-cell">
                          <Badge variant="outline" className="text-[10px]">
                            {c.products_count}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-muted-foreground text-xs">
                          {formatDateAr(c.created_at)}
                        </TableCell>
                        <TableCell>
                          <Button asChild variant="outline" size="sm" className="text-xs h-7">
                            <Link to="/super-admin/companies">عرض</Link>
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>

        {/* SECTION 3 — Platform Activity */}
        <Card className="shadow-soft">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <ActivityIcon className="h-4 w-4 text-primary" />
              نشاط المنصة
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            {loading ? (
              <p className="text-xs text-muted-foreground py-4 text-center">جاري التحميل…</p>
            ) : activity.length === 0 ? (
              <p className="text-xs text-muted-foreground py-4 text-center">لا يوجد نشاط بعد</p>
            ) : (
              <ul className="space-y-3">
                {activity.map((row) => {
                  const meta = ACTION_META[row.action] ?? {
                    label: row.action,
                    icon: ActivityIcon,
                    tone: "bg-muted text-muted-foreground",
                  };
                  const Icon = meta.icon;
                  const desc = describeActivity(row);
                  return (
                    <li key={row.id} className="flex items-start gap-3">
                      <div
                        className={`flex h-8 w-8 items-center justify-center rounded-lg shrink-0 ${meta.tone}`}
                        aria-hidden="true"
                      >
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium truncate">{desc.label}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{desc.detail}</p>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5">
                          {formatDateTimeAr(row.created_at)}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* SECTION 5 — Quick Actions */}
      <Card className="shadow-soft">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            إجراءات سريعة
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 hover:border-primary hover:bg-primary/5">
              <Link to="/super-admin/companies">
                <Plus className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium">إنشاء شركة</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 hover:border-primary hover:bg-primary/5">
              <Link to="/super-admin/companies">
                <Building2 className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium">جميع الشركات</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 hover:border-primary hover:bg-primary/5">
              <Link to="/super-admin/pricing-tiers">
                <Layers className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium">شرائح الأسعار</span>
              </Link>
            </Button>
            <Button asChild variant="outline" className="h-auto py-4 flex-col gap-2 hover:border-primary hover:bg-primary/5">
              <Link to="/super-admin/order-rules">
                <Settings className="h-5 w-5 text-primary" />
                <span className="text-xs font-medium">إعدادات المنصة</span>
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
