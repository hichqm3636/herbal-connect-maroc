import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Wallet, ShoppingCart, Award, TrendingUp } from "lucide-react";
import { StatCard } from "@/components/StatCard";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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
        .select("id, status, total_mad, created_at")
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
    })();
  }, [user]);

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
                  <p className="text-sm font-medium">طلب #{o.id.slice(0, 8)}</p>
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
