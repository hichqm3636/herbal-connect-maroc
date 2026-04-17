import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, ShoppingCart, Users, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD, formatDateAr, STATUS_LABELS, STATUS_VARIANTS } from "@/lib/format";

export const Route = createFileRoute("/_app/_admin/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [{ title: "لوحة الإدارة — هيرباليفي" }] }),
});

function AdminDashboard() {
  const [stats, setStats] = useState({ sales: 0, orders: 0, distributors: 0, pending: 0 });
  const [recent, setRecent] = useState<{ id: string; order_number: string; status: string; total_mad: number; created_at: string }[]>([]);

  useEffect(() => {
    (async () => {
      const { data: allOrders } = await supabase
        .from("orders")
        .select("total_mad, status");
      const totalSales = (allOrders ?? [])
        .filter((o) => o.status !== "cancelled")
        .reduce((s, o) => s + Number(o.total_mad), 0);
      const pending = (allOrders ?? []).filter((o) => o.status === "pending").length;

      const { count: distCount } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "distributor");

      const { data: r } = await supabase
        .from("orders")
        .select("id, order_number, status, total_mad, created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      setRecent(r ?? []);

      setStats({
        sales: totalSales,
        orders: allOrders?.length ?? 0,
        distributors: distCount ?? 0,
        pending,
      });
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">لوحة الإدارة</h1>
        <p className="text-sm text-muted-foreground mt-1">نظرة شاملة على أداء البوابة</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="إجمالي المبيعات" value={formatMAD(stats.sales)} icon={Wallet} accent="primary" />
        <StatCard label="إجمالي الطلبات" value={String(stats.orders)} icon={ShoppingCart} accent="success" />
        <StatCard label="عدد الموزعين" value={String(stats.distributors)} icon={Users} accent="warning" />
        <StatCard label="طلبات قيد الانتظار" value={String(stats.pending)} icon={TrendingUp} accent="muted" />
      </div>

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
