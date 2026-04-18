import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Wallet, ShoppingCart, Award, TrendingUp } from "lucide-react";
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts";
import { StatCard } from "@/components/StatCard";
import { RepeatLastOrderCard } from "@/components/RepeatLastOrderCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateAr, LEVEL_LABELS, STATUS_LABELS, STATUS_VARIANTS } from "@/lib/format";

export const Route = createFileRoute("/_app/dashboard")({
  component: Dashboard,
  head: () => ({ meta: [{ title: "لوحة التحكم — بوابة هيرباليفي" }] }),
});

interface Profile {
  full_name: string;
  level: string;
  loyalty_points: number;
  monthly_sales: number;
}
interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  created_at: string;
}

function Dashboard() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [monthlySales, setMonthlySales] = useState(0);
  const [revenue30d, setRevenue30d] = useState<{ created_at: string; total_mad: number }[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, level, loyalty_points, monthly_sales")
        .eq("id", user.id)
        .maybeSingle();
      if (prof) setProfile(prof);

      const { data: recent } = await supabase
        .from("orders")
        .select("id, order_number, status, total_mad, created_at")
        .eq("distributor_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5);
      setOrders(recent ?? []);

      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("distributor_id", user.id);
      setTotalOrders(count ?? 0);

      const startOfMonth = new Date();
      startOfMonth.setDate(1);
      startOfMonth.setHours(0, 0, 0, 0);
      const { data: monthOrders } = await supabase
        .from("orders")
        .select("total_mad")
        .eq("distributor_id", user.id)
        .gte("created_at", startOfMonth.toISOString())
        .neq("status", "cancelled");
      setMonthlySales((monthOrders ?? []).reduce((s, o) => s + Number(o.total_mad), 0));

      const start30 = new Date();
      start30.setDate(start30.getDate() - 29);
      start30.setHours(0, 0, 0, 0);
      const { data: rev } = await supabase
        .from("orders")
        .select("created_at, total_mad")
        .eq("distributor_id", user.id)
        .gte("created_at", start30.toISOString())
        .neq("status", "cancelled");
      setRevenue30d(rev ?? []);
    })();
  }, [user]);

  const chartData = useMemo(() => {
    const days: { date: string; label: string; revenue: number }[] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    for (let i = 29; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      days.push({
        date: key,
        label: d.toLocaleDateString("ar-MA", { day: "numeric", month: "short" }),
        revenue: 0,
      });
    }
    const map = new Map(days.map((d) => [d.date, d]));
    for (const r of revenue30d) {
      const key = new Date(r.created_at).toISOString().slice(0, 10);
      const day = map.get(key);
      if (day) day.revenue += Number(r.total_mad);
    }
    return days;
  }, [revenue30d]);

  const total30d = useMemo(() => chartData.reduce((s, d) => s + d.revenue, 0), [chartData]);

  const chartConfig = {
    revenue: { label: "الإيرادات", color: "var(--primary)" },
  } satisfies ChartConfig;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
          مرحباً، {profile?.full_name || "موزعنا الكريم"} 👋
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          هذه نظرة سريعة على نشاطك هذا الشهر
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          label="مبيعات الشهر"
          value={formatMAD(monthlySales)}
          icon={Wallet}
          accent="primary"
          hint="إجمالي مبيعاتك خلال الشهر الجاري"
        />
        <StatCard
          label="إجمالي الطلبات"
          value={String(totalOrders)}
          icon={ShoppingCart}
          accent="success"
        />
        <StatCard
          label="نقاط الولاء"
          value={String(profile?.loyalty_points ?? 0)}
          icon={Award}
          accent="warning"
        />
        <StatCard
          label="مستوى الموزع"
          value={LEVEL_LABELS[profile?.level ?? "distributor"]}
          icon={TrendingUp}
          accent="muted"
        />
      </div>

      <RepeatLastOrderCard />

      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-lg font-bold">إيرادات آخر 30 يوماً</h2>
            <p className="text-xs text-muted-foreground mt-1">
              المجموع: <span className="font-semibold text-foreground">{formatMAD(total30d)}</span>
            </p>
          </div>
        </div>
        <ChartContainer config={chartConfig} className="h-[240px] w-full" dir="ltr">
          <AreaChart data={chartData} margin={{ left: 8, right: 8, top: 8, bottom: 0 }}>
            <defs>
              <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-revenue)" stopOpacity={0.4} />
                <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.05} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} strokeDasharray="3 3" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tickMargin={8}
              minTickGap={24}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              width={50}
              tickFormatter={(v) => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v))}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  formatter={(value) => formatMAD(Number(value))}
                  labelFormatter={(label) => String(label)}
                />
              }
            />
            <Area
              type="monotone"
              dataKey="revenue"
              stroke="var(--color-revenue)"
              fill="url(#fillRevenue)"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </Card>

      <Card className="p-5 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold">آخر الطلبات</h2>
          <Button asChild variant="ghost" size="sm">
            <Link to="/orders">عرض الكل</Link>
          </Button>
        </div>
        {orders.length === 0 ? (
          <div className="text-center py-12 text-sm text-muted-foreground">
            لا توجد طلبات بعد.{" "}
            <Link to="/products" className="text-primary font-medium hover:underline">
              تصفح المنتجات
            </Link>
          </div>
        ) : (
          <div className="divide-y">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium">{o.order_number}</p>
                  <p className="text-xs text-muted-foreground">{formatDateAr(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="font-semibold text-sm">{formatMAD(o.total_mad)}</span>
                  <Badge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
