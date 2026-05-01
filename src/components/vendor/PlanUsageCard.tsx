import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

type Usage = {
  products: number;
  users: number;
  maxProducts: number | null;
  maxUsers: number | null;
  planName: string | null;
};

function tone(current: number, max: number | null): string {
  if (max == null) return "bg-success";
  const pct = max === 0 ? 100 : (current / max) * 100;
  if (pct >= 100) return "bg-destructive";
  if (pct >= 80) return "bg-warning";
  return "bg-success";
}

function pctValue(current: number, max: number | null): number {
  if (max == null || max === 0) return 0;
  return Math.min(100, Math.round((current / max) * 100));
}

export function PlanUsageCard({ companyId }: { companyId: string | null | undefined }) {
  const [usage, setUsage] = useState<Usage | null>(null);

  useEffect(() => {
    let alive = true;
    if (!companyId) return;
    (async () => {
      const [productsRes, usersRes, planRes] = await Promise.all([
        supabase.from("products").select("*", { count: "exact", head: true }).eq("company_id", companyId),
        supabase
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("company_id", companyId)
          .neq("role", "client"),
        supabase
          .from("company_subscriptions")
          .select("subscription_plans(name, max_products, max_users)")
          .eq("company_id", companyId)
          .in("status", ["active", "trial"])
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);
      if (!alive) return;
      const plan = (planRes.data as any)?.subscription_plans ?? null;
      setUsage({
        products: productsRes.count ?? 0,
        users: usersRes.count ?? 0,
        maxProducts: plan?.max_products ?? null,
        maxUsers: plan?.max_users ?? null,
        planName: plan?.name ?? null,
      });
    })();
    return () => {
      alive = false;
    };
  }, [companyId]);

  if (!usage) return null;

  return (
    <Card className="p-5 shadow-soft" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="font-bold text-base">استخدام الخطة</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {usage.planName ?? "بدون خطة نشطة"}
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link to="/settings">ترقية</Link>
        </Button>
      </div>

      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-medium">المنتجات</span>
            <span className="text-muted-foreground">
              {usage.products} / {usage.maxProducts ?? "∞"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${tone(usage.products, usage.maxProducts)}`}
              style={{ width: `${pctValue(usage.products, usage.maxProducts)}%` }}
            />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between text-sm mb-1.5">
            <span className="font-medium">المستخدمون</span>
            <span className="text-muted-foreground">
              {usage.users} / {usage.maxUsers ?? "∞"}
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div
              className={`h-full transition-all ${tone(usage.users, usage.maxUsers)}`}
              style={{ width: `${pctValue(usage.users, usage.maxUsers)}%` }}
            />
          </div>
        </div>
      </div>
    </Card>
  );
}
