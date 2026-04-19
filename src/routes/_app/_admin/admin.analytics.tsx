import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { BarChart3, TrendingUp, MapPin, Users, Zap, LineChart as LineIcon, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LineChart,
  Line,
  Legend,
} from "recharts";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";

type RangeDays = 7 | 30 | 90;

export const Route = createFileRoute("/_app/_admin/admin/analytics")({
  component: AnalyticsPage,
  head: () => ({ meta: [{ title: "ذكاء السوق — Market Intelligence" }] }),
});

// Orders considered "fulfilled" for analytics (exclude pending & cancelled)
const VALID_STATUSES: ("confirmed" | "preparing" | "shipped" | "delivered")[] = [
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
];

type ProductRow = { id: string; name_ar: string };
type ProfileRow = { id: string; full_name: string; territory_id: string };
type TerritoryRow = { id: string; name: string };
type OrderRow = {
  id: string;
  distributor_id: string;
  total_mad: number;
  created_at: string;
  status: string;
};
type ItemRow = {
  order_id: string;
  product_id: string;
  quantity: number;
  unit_price_mad: number;
};

function AnalyticsPage() {
  const { companyId } = useAuth();
  const [rangeDays, setRangeDays] = useState<RangeDays>(30);
  const [loading, setLoading] = useState(true);
  const [ordersRange, setOrdersRange] = useState<OrderRow[]>([]);
  const [itemsRange, setItemsRange] = useState<ItemRow[]>([]);
  const [orders6m, setOrders6m] = useState<OrderRow[]>([]);
  const [products, setProducts] = useState<Record<string, ProductRow>>({});
  const [profiles, setProfiles] = useState<Record<string, ProfileRow>>({});
  const [territories, setTerritories] = useState<Record<string, TerritoryRow>>({});

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      setLoading(true);
      const now = new Date();
      const dRange = new Date(now);
      dRange.setDate(dRange.getDate() - rangeDays);
      const d6m = new Date(now);
      d6m.setMonth(d6m.getMonth() - 5);
      d6m.setDate(1);
      d6m.setHours(0, 0, 0, 0);

      const [{ data: oRange }, { data: o6m }, { data: prods }, { data: profs }, { data: terrs }] =
        await Promise.all([
          supabase
            .from("orders")
            .select("id, distributor_id, total_mad, created_at, status")
            .eq("company_id", companyId)
            .in("status", VALID_STATUSES)
            .gte("created_at", dRange.toISOString()),
          supabase
            .from("orders")
            .select("id, distributor_id, total_mad, created_at, status")
            .eq("company_id", companyId)
            .in("status", VALID_STATUSES)
            .gte("created_at", d6m.toISOString()),
          supabase.from("products").select("id, name_ar").eq("company_id", companyId),
          supabase.from("profiles").select("id, full_name, territory_id").eq("company_id", companyId),
          supabase.from("territories").select("id, name").eq("company_id", companyId),
        ]);

      const orderIdsRange = (oRange ?? []).map((o) => o.id);
      let itRange: ItemRow[] = [];
      if (orderIdsRange.length) {
        const { data } = await supabase
          .from("order_items")
          .select("order_id, product_id, quantity, unit_price_mad")
          .in("order_id", orderIdsRange);
        itRange = (data ?? []) as ItemRow[];
      }

      setOrdersRange((oRange ?? []) as OrderRow[]);
      setOrders6m((o6m ?? []) as OrderRow[]);
      setItemsRange(itRange);
      setProducts(Object.fromEntries((prods ?? []).map((p) => [p.id, p as ProductRow])));
      setProfiles(Object.fromEntries((profs ?? []).map((p) => [p.id, p as ProfileRow])));
      setTerritories(Object.fromEntries((terrs ?? []).map((t) => [t.id, t as TerritoryRow])));
      setLoading(false);
    })();
  }, [companyId, rangeDays]);

  // 1. Top selling products (selected range)
  const topProducts = useMemo(() => {
    const agg = new Map<string, { qty: number; revenue: number }>();
    for (const it of itemsRange) {
      const cur = agg.get(it.product_id) ?? { qty: 0, revenue: 0 };
      cur.qty += Number(it.quantity);
      cur.revenue += Number(it.quantity) * Number(it.unit_price_mad);
      agg.set(it.product_id, cur);
    }
    return [...agg.entries()]
      .map(([pid, v]) => ({ id: pid, name: products[pid]?.name_ar ?? "—", ...v }))
      .sort((a, b) => b.qty - a.qty)
      .slice(0, 10);
  }, [itemsRange, products]);

  // 4. Fastest moving (velocity per day over selected range)
  const fastest = useMemo(
    () =>
      topProducts
        .map((p) => ({ ...p, velocity: p.qty / rangeDays }))
        .sort((a, b) => b.velocity - a.velocity)
        .slice(0, 10),
    [topProducts, rangeDays],
  );

  // 2. Demand by territory
  const territoryDemand = useMemo(() => {
    const orderTerr = new Map<string, string>(); // order_id -> territory_id
    for (const o of ordersRange) {
      const tid = profiles[o.distributor_id]?.territory_id;
      if (tid) orderTerr.set(o.id, tid);
    }
    const agg = new Map<string, { orders: Set<string>; qty: number }>();
    for (const it of itemsRange) {
      const tid = orderTerr.get(it.order_id);
      if (!tid) continue;
      const cur = agg.get(tid) ?? { orders: new Set(), qty: 0 };
      cur.orders.add(it.order_id);
      cur.qty += Number(it.quantity);
      agg.set(tid, cur);
    }
    // Include territories that have orders but no items too
    for (const [oid, tid] of orderTerr.entries()) {
      const cur = agg.get(tid) ?? { orders: new Set(), qty: 0 };
      cur.orders.add(oid);
      agg.set(tid, cur);
    }
    return [...agg.entries()]
      .map(([tid, v]) => ({
        id: tid,
        name: territories[tid]?.name ?? "—",
        orders: v.orders.size,
        qty: v.qty,
      }))
      .sort((a, b) => b.qty - a.qty);
  }, [ordersRange, itemsRange, profiles, territories]);

  // 3. Distributor performance
  const distributorPerf = useMemo(() => {
    const agg = new Map<string, { orders: number; revenue: number }>();
    for (const o of ordersRange) {
      const cur = agg.get(o.distributor_id) ?? { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += Number(o.total_mad);
      agg.set(o.distributor_id, cur);
    }
    return [...agg.entries()]
      .map(([did, v]) => ({
        id: did,
        name: profiles[did]?.full_name || "موزع",
        orders: v.orders,
        revenue: v.revenue,
        aov: v.orders ? v.revenue / v.orders : 0,
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);
  }, [ordersRange, profiles]);

  // 5. Monthly trend (6 months)
  const monthlyTrend = useMemo(() => {
    const buckets = new Map<string, { label: string; orders: number; revenue: number }>();
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = new Intl.DateTimeFormat("ar-MA", { month: "short", year: "2-digit" }).format(d);
      buckets.set(key, { label, orders: 0, revenue: 0 });
    }
    for (const o of orders6m) {
      const d = new Date(o.created_at);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const b = buckets.get(key);
      if (!b) continue;
      b.orders += 1;
      b.revenue += Number(o.total_mad);
    }
    return [...buckets.values()];
  }, [orders6m]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-72" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 min-w-0">
      <header className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <BarChart3 className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl md:text-2xl font-bold">ذكاء السوق</h1>
          <p className="text-xs md:text-sm text-muted-foreground">
            تحليلات أداء المنتجات والموزعين والمناطق — آخر {rangeDays} يومًا
          </p>
        </div>
        <ToggleGroup
          type="single"
          value={String(rangeDays)}
          onValueChange={(v) => {
            if (v === "7" || v === "30" || v === "90") setRangeDays(Number(v) as RangeDays);
          }}
          className="ms-auto"
        >
          <ToggleGroupItem value="7" aria-label="آخر 7 أيام" className="px-3 text-xs">
            7 أيام
          </ToggleGroupItem>
          <ToggleGroupItem value="30" aria-label="آخر 30 يومًا" className="px-3 text-xs">
            30 يومًا
          </ToggleGroupItem>
          <ToggleGroupItem value="90" aria-label="آخر 90 يومًا" className="px-3 text-xs">
            90 يومًا
          </ToggleGroupItem>
        </ToggleGroup>
      </header>

      {/* Monthly trend */}
      <Card className="p-4 md:p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <LineIcon className="h-4 w-4 text-primary" />
          <h2 className="font-bold">اتجاه المبيعات الشهري (آخر 6 أشهر)</h2>
        </div>
        <div className="h-64 w-full" dir="ltr">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={monthlyTrend} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
              <XAxis dataKey="label" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="left" tick={{ fontSize: 11 }} />
              <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11 }} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === "revenue" ? formatMAD(value) : value
                }
              />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="orders"
                name="الطلبات"
                stroke="var(--primary)"
                strokeWidth={2}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="revenue"
                name="الإيرادات"
                stroke="var(--primary-glow)"
                strokeWidth={2}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Top selling */}
        <Card className="p-4 md:p-5 shadow-soft overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <TrendingUp className="h-4 w-4 text-primary" />
            <h2 className="font-bold">المنتجات الأكثر مبيعًا</h2>
          </div>
          {topProducts.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد بيانات بعد</p>
          ) : (
            <ul className="space-y-2">
              {topProducts.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary" className="shrink-0">
                      {i + 1}
                    </Badge>
                    <span className="truncate font-medium">{p.name}</span>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="font-bold">{p.qty} وحدة</div>
                    <div className="text-xs text-muted-foreground">{formatMAD(p.revenue)}</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Fastest moving */}
        <Card className="p-4 md:p-5 shadow-soft overflow-hidden">
          <div className="flex items-center gap-2 mb-4">
            <Zap className="h-4 w-4 text-primary" />
            <h2 className="font-bold">الأسرع حركة (سرعة يومية)</h2>
          </div>
          {fastest.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">لا توجد بيانات بعد</p>
          ) : (
            <ul className="space-y-2">
              {fastest.map((p, i) => (
                <li
                  key={p.id}
                  className="flex items-center justify-between gap-3 rounded-lg border p-3 text-sm"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Badge variant="secondary" className="shrink-0">
                      {i + 1}
                    </Badge>
                    <span className="truncate font-medium">{p.name}</span>
                  </div>
                  <div className="text-end shrink-0">
                    <div className="font-bold">{p.velocity.toFixed(2)} / يوم</div>
                    <div className="text-xs text-muted-foreground">{p.qty} خلال {rangeDays} يوم</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Demand by territory */}
      <Card className="p-4 md:p-5 shadow-soft overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <MapPin className="h-4 w-4 text-primary" />
          <h2 className="font-bold">الطلب حسب المنطقة</h2>
        </div>
        {territoryDemand.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">لا توجد بيانات بعد</p>
        ) : (
          <>
            <div className="h-56 w-full mb-4" dir="ltr">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={territoryDemand} margin={{ top: 5, right: 12, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar dataKey="qty" name="الكمية" fill="var(--primary)" radius={[6, 6, 0, 0]} />
                  <Bar
                    dataKey="orders"
                    name="الطلبات"
                    fill="var(--primary-glow)"
                    radius={[6, 6, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="overflow-x-auto -mx-2">
              <table className="w-full text-sm min-w-[420px]">
                <thead>
                  <tr className="text-muted-foreground text-xs">
                    <th className="text-start font-medium px-2 py-2">المنطقة</th>
                    <th className="text-end font-medium px-2 py-2">الطلبات</th>
                    <th className="text-end font-medium px-2 py-2">الكمية</th>
                  </tr>
                </thead>
                <tbody>
                  {territoryDemand.map((t) => (
                    <tr key={t.id} className="border-t">
                      <td className="px-2 py-2 font-medium">{t.name}</td>
                      <td className="px-2 py-2 text-end">{t.orders}</td>
                      <td className="px-2 py-2 text-end font-bold">{t.qty}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {/* Distributor performance */}
      <Card className="p-4 md:p-5 shadow-soft overflow-hidden">
        <div className="flex items-center gap-2 mb-4">
          <Users className="h-4 w-4 text-primary" />
          <h2 className="font-bold">أداء الموزعين</h2>
        </div>
        {distributorPerf.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">لا توجد بيانات بعد</p>
        ) : (
          <div className="overflow-x-auto -mx-2">
            <table className="w-full text-sm min-w-[520px]">
              <thead>
                <tr className="text-muted-foreground text-xs">
                  <th className="text-start font-medium px-2 py-2">الموزع</th>
                  <th className="text-end font-medium px-2 py-2">الطلبات</th>
                  <th className="text-end font-medium px-2 py-2">الإيرادات</th>
                  <th className="text-end font-medium px-2 py-2">متوسط الطلب</th>
                </tr>
              </thead>
              <tbody>
                {distributorPerf.map((d) => (
                  <tr key={d.id} className="border-t">
                    <td className="px-2 py-2 font-medium truncate max-w-[160px]">{d.name}</td>
                    <td className="px-2 py-2 text-end">{d.orders}</td>
                    <td className="px-2 py-2 text-end font-bold">{formatMAD(d.revenue)}</td>
                    <td className="px-2 py-2 text-end text-muted-foreground">{formatMAD(d.aov)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}
