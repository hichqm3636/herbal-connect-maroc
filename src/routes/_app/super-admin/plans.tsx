import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { CreditCard, Users, Package, Building2, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/super-admin/plans")({
  component: SuperAdminPlansPage,
  head: () => ({
    meta: [{ title: "خطط الاشتراك — Nexora Admin" }],
  }),
});

interface Plan {
  id: string;
  name: string;
  monthly_price: number;
  currency: string;
  max_products: number | null;
  max_users: number | null;
  max_clients: number | null;
  features: Record<string, unknown>;
  active: boolean;
}

interface SubStat {
  plan_id: string;
  count: number;
}

interface RevenueStat {
  total_mad: number;
  count: number;
}

function SuperAdminPlansPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [stats, setStats] = useState<Record<string, SubStat>>({});
  const [revenue, setRevenue] = useState<RevenueStat>({ total_mad: 0, count: 0 });
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const [{ data: planData }, { data: subData }, { data: invData }] = await Promise.all([
      supabase
        .from("subscription_plans")
        .select("*")
        .order("monthly_price", { ascending: true }),
      supabase
        .from("company_subscriptions")
        .select("plan_id, status")
        .eq("status", "active"),
      supabase
        .from("subscription_invoices")
        .select("amount, status")
        .gte("created_at", new Date(Date.now() - 30 * 86400000).toISOString()),
    ]);

    setPlans((planData ?? []) as Plan[]);

    const counts: Record<string, SubStat> = {};
    for (const row of (subData ?? []) as { plan_id: string }[]) {
      counts[row.plan_id] ??= { plan_id: row.plan_id, count: 0 };
      counts[row.plan_id].count += 1;
    }
    setStats(counts);

    const inv = (invData ?? []) as { amount: number; status: string }[];
    setRevenue({
      total_mad: inv.reduce((s, r) => s + Number(r.amount || 0), 0),
      count: inv.length,
    });
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const togglePlan = async (planId: string, next: boolean) => {
    const { error } = await supabase
      .from("subscription_plans")
      .update({ active: next })
      .eq("id", planId);
    if (error) {
      toast.error("تعذّر التحديث", { description: error.message });
      return;
    }
    toast.success(next ? "تم تفعيل الخطة" : "تم إيقاف الخطة");
    void load();
  };

  const totalActive = Object.values(stats).reduce((s, x) => s + x.count, 0);

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" dir="rtl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">خطط الاشتراك</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          راقب الاشتراكات النشطة والإيرادات (محاكاة) لكل خطة.
        </p>
      </div>

      {/* Top stats */}
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard
          icon={Building2}
          label="اشتراكات نشطة"
          value={loading ? null : totalActive.toLocaleString()}
        />
        <StatCard
          icon={CreditCard}
          label="فواتير آخر 30 يومًا"
          value={loading ? null : revenue.count.toLocaleString()}
        />
        <StatCard
          icon={TrendingUp}
          label="إيراد محاكَى (آخر 30 يومًا)"
          value={
            loading
              ? null
              : `${revenue.total_mad.toLocaleString("ar-MA")} MAD`
          }
        />
      </div>

      {/* Plans table */}
      <Card className="overflow-hidden">
        <div className="border-b p-5">
          <h2 className="text-lg font-bold">الخطط المتاحة</h2>
          <p className="mt-0.5 text-sm text-muted-foreground">
            تعديل الأسعار والحدود يحتاج migration. هنا فقط: تفعيل / إيقاف الظهور للمستخدمين.
          </p>
        </div>

        {loading ? (
          <div className="space-y-3 p-5">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-20 w-full" />
            ))}
          </div>
        ) : (
          <div className="divide-y">
            {plans.map((plan) => {
              const activeSubs = stats[plan.id]?.count ?? 0;
              return (
                <div
                  key={plan.id}
                  className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent">
                      <CreditCard className="h-5 w-5 text-primary" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-lg">{plan.name}</span>
                        {!plan.active && (
                          <Badge variant="outline" className="text-xs">
                            متوقفة
                          </Badge>
                        )}
                      </div>
                      <div className="mt-1 text-sm text-muted-foreground">
                        <span className="tabular-nums" dir="ltr">
                          {plan.monthly_price.toLocaleString("ar-MA")}
                        </span>{" "}
                        {plan.currency} / شهريًا
                      </div>
                      <div className="mt-2 flex flex-wrap gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1">
                          <Package className="h-3 w-3" />
                          {plan.max_products === null
                            ? "منتجات ∞"
                            : `${plan.max_products} منتج`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Users className="h-3 w-3" />
                          {plan.max_users === null
                            ? "مستخدمون ∞"
                            : `${plan.max_users} مستخدم`}
                        </span>
                        <span className="inline-flex items-center gap-1">
                          <Building2 className="h-3 w-3" />
                          {plan.max_clients === null
                            ? "عملاء ∞"
                            : `${plan.max_clients} عميل`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 sm:gap-8">
                    <div className="text-center">
                      <div className="text-2xl font-extrabold tabular-nums">
                        {activeSubs}
                      </div>
                      <div className="text-[10px] text-muted-foreground">اشتراك نشط</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={plan.active}
                        onCheckedChange={(v) => void togglePlan(plan.id, v)}
                      />
                      <span className="text-xs text-muted-foreground">
                        {plan.active ? "ظاهرة" : "مخفية"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <Card className="p-5 text-xs text-muted-foreground">
        <p>
          <strong>وضع الاختبار:</strong> كل الإيرادات أعلاه ناتجة عن محاكاة دفع
          (status=simulated). لن تظهر إيرادات حقيقية حتى تُربط بوابة دفع فعلية
          (Stripe / Paddle / CMI).
        </p>
      </Card>
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof CreditCard;
  label: string;
  value: string | null;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        {label}
      </div>
      <div className="mt-1.5 text-2xl font-extrabold tabular-nums">
        {value === null ? <Skeleton className="h-7 w-20" /> : value}
      </div>
    </Card>
  );
}
