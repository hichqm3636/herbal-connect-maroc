import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Building2, Users, ClipboardList, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/super-admin/")({
  component: SuperAdminDashboard,
});

interface PlatformStats {
  companies: number;
  users: number;
  orders: number;
}

function SuperAdminDashboard() {
  const [stats, setStats] = useState<PlatformStats>({ companies: 0, users: 0, orders: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const [companiesRes, usersRes, ordersRes] = await Promise.all([
        supabase.from("companies").select("*", { count: "exact", head: true }),
        supabase.from("profiles").select("*", { count: "exact", head: true }),
        supabase.from("orders").select("*", { count: "exact", head: true }),
      ]);
      setStats({
        companies: companiesRes.count ?? 0,
        users: usersRes.count ?? 0,
        orders: ordersRes.count ?? 0,
      });
      setLoading(false);
    })();
  }, []);

  const cards = [
    { label: "إجمالي الشركات", value: stats.companies, icon: Building2, color: "text-primary" },
    { label: "إجمالي المستخدمين", value: stats.users, icon: Users, color: "text-success-foreground" },
    { label: "إجمالي الطلبات", value: stats.orders, icon: ClipboardList, color: "text-warning-foreground" },
  ];

  return (
    <div className="space-y-6" dir="rtl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">لوحة المنصة</h1>
          <p className="text-sm text-muted-foreground">نظرة عامة على نشاط المنصة بالكامل</p>
        </div>
        <Button asChild variant="outline" size="sm">
          <Link to="/super-admin/companies">
            إدارة الشركات
            <ArrowLeft className="h-4 w-4 ms-1" />
          </Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {cards.map((c) => (
          <Card key={c.label} className="shadow-soft">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{c.label}</CardTitle>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold">
                {loading ? "…" : c.value.toLocaleString("ar-MA")}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
