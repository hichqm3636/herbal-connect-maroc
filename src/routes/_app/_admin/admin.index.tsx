import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, ShoppingCart, Users, TrendingUp, AlertTriangle } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateAr, STATUS_LABELS, STATUS_VARIANTS, STATUS_CLASSES } from "@/lib/format";

export const Route = createFileRoute("/_app/_admin/admin/")({
  component: AdminDashboard,
  head: () => ({ meta: [{ title: "لوحة الإدارة — هيرباليفي" }] }),
});

interface LowStockProduct {
  id: string;
  name_ar: string;
  stock: number;
  low_stock_threshold: number;
}

function AdminDashboard() {
  const { companyId } = useAuth();
  const [stats, setStats] = useState({ sales: 0, orders: 0, distributors: 0, pending: 0 });
  const [recent, setRecent] = useState<{ id: string; order_number: string; status: string; total_mad: number; created_at: string }[]>([]);
  const [lowStock, setLowStock] = useState<LowStockProduct[]>([]);

  useEffect(() => {
    if (!companyId) return;
    (async () => {
      const { data: allOrders } = await supabase
        .from("orders")
        .select("total_mad, status")
        .eq("company_id", companyId);
      const totalSales = (allOrders ?? [])
        .filter((o) => o.status !== "cancelled")
        .reduce((s, o) => s + Number(o.total_mad), 0);
      const pending = (allOrders ?? []).filter((o) => o.status === "pending").length;

      const { count: distCount } = await supabase
        .from("user_roles")
        .select("id", { count: "exact", head: true })
        .eq("role", "distributor")
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
        .filter((p) => p.stock <= (p.low_stock_threshold ?? 5))
        .sort((a, b) => a.stock - b.stock);
      setLowStock(low as LowStockProduct[]);

      setStats({
        sales: totalSales,
        orders: allOrders?.length ?? 0,
        distributors: distCount ?? 0,
        pending,
      });
    })();
  }, [companyId]);

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
