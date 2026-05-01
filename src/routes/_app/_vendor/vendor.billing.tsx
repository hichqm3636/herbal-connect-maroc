import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CreditCard,
  CheckCircle2,
  Clock,
  AlertTriangle,
  Sparkles,
  Receipt,
  ArrowUpRight,
  TestTube2,
  Rocket,
  Crown,
  Building2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { format } from "date-fns";
import { ar } from "date-fns/locale";

export const Route = createFileRoute("/_app/_vendor/vendor/billing")({
  component: VendorBillingPage,
  head: () => ({
    meta: [{ title: "الاشتراك والفواتير — Nexora" }],
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
}

interface Subscription {
  id: string;
  plan_id: string;
  status: string;
  started_at: string;
  expires_at: string | null;
  trial_ends_at: string | null;
}

interface SubInvoice {
  id: string;
  plan_name: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  payment_reference: string | null;
  paid_at: string | null;
  period_start: string;
  period_end: string;
  created_at: string;
}

const PLAN_ICONS: Record<string, typeof Rocket> = {
  Starter: Rocket,
  Pro: Sparkles,
  Enterprise: Crown,
};

function VendorBillingPage() {
  const { companyId } = useAuth();
  const [loading, setLoading] = useState(true);
  const [plans, setPlans] = useState<Plan[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [invoices, setInvoices] = useState<SubInvoice[]>([]);
  const [upgrading, setUpgrading] = useState<string | null>(null);

  const loadAll = useMemo(
    () => async () => {
      if (!companyId) return;
      setLoading(true);
      const [{ data: planData }, { data: subData }, { data: invData }] =
        await Promise.all([
          supabase
            .from("subscription_plans")
            .select("*")
            .eq("active", true)
            .order("monthly_price", { ascending: true }),
          supabase
            .from("company_subscriptions")
            .select("*")
            .eq("company_id", companyId)
            .maybeSingle(),
          supabase
            .from("subscription_invoices")
            .select("*")
            .eq("company_id", companyId)
            .order("created_at", { ascending: false })
            .limit(20),
        ]);

      setPlans((planData ?? []) as Plan[]);
      setSub((subData as Subscription) ?? null);
      setInvoices((invData ?? []) as SubInvoice[]);
      setLoading(false);
    },
    [companyId],
  );

  useEffect(() => {
    track("billing_view", {});
    void loadAll();
  }, [loadAll]);

  const currentPlan = plans.find((p) => p.id === sub?.plan_id) ?? null;

  const handleSimulate = async (plan: Plan) => {
    setUpgrading(plan.id);
    track("subscription_simulated", {
      plan_id: plan.id,
      plan_name: plan.name,
      price: plan.monthly_price,
    });
    const { data, error } = await supabase.rpc("simulate_subscription_payment", {
      p_plan_id: plan.id,
    });
    setUpgrading(null);

    if (error) {
      toast.error("تعذّر محاكاة الدفع", { description: error.message });
      return;
    }

    track("subscription_upgraded", {
      plan_id: plan.id,
      plan_name: plan.name,
    });
    toast.success(`تم تفعيل خطة ${plan.name}`, {
      description: "هذه محاكاة دفع — لم يتم خصم أي مبلغ حقيقي.",
    });
    await loadAll();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
        <Skeleton className="h-48 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight">الاشتراك والفواتير</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          أدر خطتك الحالية، رقّ في أي وقت، وراجع تاريخ فواتيرك.
        </p>
      </div>

      {/* Test mode banner */}
      <div className="flex items-start gap-3 rounded-2xl border border-warning/30 bg-warning/5 p-4">
        <TestTube2 className="h-5 w-5 text-warning-foreground shrink-0 mt-0.5" />
        <div className="text-sm">
          <strong className="font-semibold">وضع الاختبار مفعّل</strong>
          <p className="text-muted-foreground mt-0.5">
            بوابة الدفع الحقيقية (Stripe / CMI) لم تُربط بعد. كل عمليات الترقية تتم
            بمحاكاة فورية بدون خصم أي مبلغ.
          </p>
        </div>
      </div>

      {/* Current subscription card */}
      <CurrentSubCard sub={sub} currentPlan={currentPlan} />

      {/* Available plans */}
      <Card className="p-6">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-bold">الخطط المتاحة</h2>
            <p className="text-sm text-muted-foreground">
              ترقية فورية — تطبّق الحدود الجديدة على شركتك مباشرةً.
            </p>
          </div>
          <Link to="/pricing" className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            عرض الصفحة العامة <ArrowUpRight className="h-3 w-3" />
          </Link>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {plans.map((plan) => {
            const Icon = PLAN_ICONS[plan.name] ?? Building2;
            const isCurrent = sub?.plan_id === plan.id && sub.status === "active";
            return (
              <div
                key={plan.id}
                className={`rounded-xl border p-4 transition-all ${
                  isCurrent ? "border-primary bg-primary/5" : "hover:border-primary/50"
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-accent">
                      <Icon className="h-4 w-4 text-primary" />
                    </div>
                    <span className="font-bold">{plan.name}</span>
                  </div>
                  {isCurrent && (
                    <Badge variant="default" className="bg-primary">
                      الحالية
                    </Badge>
                  )}
                </div>
                <div className="mt-3" dir="ltr">
                  <span className="text-2xl font-extrabold tabular-nums">
                    {plan.monthly_price.toLocaleString("ar-MA")}
                  </span>
                  <span className="ms-1 text-xs text-muted-foreground">
                    {plan.currency}/شهر
                  </span>
                </div>
                <div className="mt-2 text-xs text-muted-foreground space-y-0.5">
                  <div>• {plan.max_products === null ? "منتجات غير محدودة" : `${plan.max_products} منتج`}</div>
                  <div>• {plan.max_users === null ? "مستخدمون غير محدودون" : `${plan.max_users} مستخدم`}</div>
                </div>
                <Button
                  size="sm"
                  className="mt-4 w-full"
                  variant={isCurrent ? "outline" : "default"}
                  disabled={isCurrent || upgrading !== null}
                  onClick={() => void handleSimulate(plan)}
                >
                  {upgrading === plan.id ? (
                    "جاري المحاكاة..."
                  ) : isCurrent ? (
                    "خطتك الحالية"
                  ) : (
                    <>
                      <CreditCard className="h-4 w-4 me-1" />
                      محاكاة الدفع
                    </>
                  )}
                </Button>
              </div>
            );
          })}
        </div>
      </Card>

      {/* Invoice history */}
      <Card className="p-6">
        <div className="mb-4 flex items-center gap-2">
          <Receipt className="h-5 w-5 text-primary" />
          <h2 className="text-lg font-bold">تاريخ الفواتير</h2>
        </div>

        {invoices.length === 0 ? (
          <div className="py-10 text-center text-sm text-muted-foreground">
            لا توجد فواتير بعد. اختر خطة لبدء اشتراكك.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2 pe-3">التاريخ</th>
                  <th className="py-2 pe-3">الخطة</th>
                  <th className="py-2 pe-3">المبلغ</th>
                  <th className="py-2 pe-3">الطريقة</th>
                  <th className="py-2 pe-3">المرجع</th>
                  <th className="py-2 pe-3">الحالة</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {invoices.map((inv) => (
                  <tr key={inv.id}>
                    <td className="py-3 pe-3 text-muted-foreground">
                      {format(new Date(inv.created_at), "dd MMM yyyy", { locale: ar })}
                    </td>
                    <td className="py-3 pe-3 font-medium">{inv.plan_name}</td>
                    <td className="py-3 pe-3 tabular-nums" dir="ltr">
                      {inv.amount.toLocaleString("ar-MA")} {inv.currency}
                    </td>
                    <td className="py-3 pe-3 text-xs text-muted-foreground">
                      {inv.payment_method === "simulated" ? "محاكاة" : inv.payment_method}
                    </td>
                    <td className="py-3 pe-3 text-xs text-muted-foreground font-mono" dir="ltr">
                      {inv.payment_reference ?? "—"}
                    </td>
                    <td className="py-3 pe-3">
                      <InvoiceStatusBadge status={inv.status} />
                    </td>
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

function CurrentSubCard({
  sub,
  currentPlan,
}: {
  sub: Subscription | null;
  currentPlan: Plan | null;
}) {
  if (!sub || !currentPlan) {
    return (
      <Card className="p-6 border-dashed">
        <div className="flex items-start gap-3">
          <AlertTriangle className="h-5 w-5 text-warning-foreground mt-0.5" />
          <div>
            <h3 className="font-bold">لا يوجد اشتراك نشط</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              اختر خطة أدناه لتفعيل شركتك على المنصة.
            </p>
          </div>
        </div>
      </Card>
    );
  }

  const isActive = sub.status === "active";
  const isTrial = sub.status === "trial";
  const expires = sub.expires_at ? new Date(sub.expires_at) : null;
  const daysLeft = expires
    ? Math.max(0, Math.ceil((expires.getTime() - Date.now()) / 86400000))
    : null;

  return (
    <Card className="p-6 bg-gradient-soft border-primary/20">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
            <CreditCard className="h-6 w-6 text-primary-foreground" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-extrabold">خطة {currentPlan.name}</h3>
              {isActive && (
                <Badge className="bg-success text-success-foreground gap-1">
                  <CheckCircle2 className="h-3 w-3" /> نشط
                </Badge>
              )}
              {isTrial && (
                <Badge variant="secondary" className="gap-1">
                  <Clock className="h-3 w-3" /> فترة تجريبية
                </Badge>
              )}
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              {currentPlan.monthly_price.toLocaleString("ar-MA")} {currentPlan.currency} / شهريًا
            </p>
            {daysLeft !== null && (
              <p className="mt-2 text-xs text-muted-foreground">
                {daysLeft > 0
                  ? `يتجدّد خلال ${daysLeft} يوم`
                  : "انتهت صلاحية الاشتراك — يرجى التجديد"}
              </p>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function InvoiceStatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    paid: { label: "مدفوعة", cls: "bg-success/10 text-success border-success/30" },
    simulated: {
      label: "محاكاة",
      cls: "bg-warning/10 text-warning-foreground border-warning/30",
    },
    pending: { label: "قيد الانتظار", cls: "bg-muted text-muted-foreground" },
    failed: { label: "فشلت", cls: "bg-destructive/10 text-destructive border-destructive/30" },
    refunded: { label: "مستردّة", cls: "bg-muted text-muted-foreground" },
  };
  const m = map[status] ?? { label: status, cls: "bg-muted" };
  return (
    <Badge variant="outline" className={`text-xs ${m.cls}`}>
      {m.label}
    </Badge>
  );
}
