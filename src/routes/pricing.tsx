import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, Sparkles, Building2, Rocket, Crown, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "@/hooks/useAuth";
import { track } from "@/lib/analytics";

export const Route = createFileRoute("/pricing")({
  component: PricingPage,
  head: () => ({
    meta: [
      { title: "خطط الاشتراك — Nexora" },
      {
        name: "description",
        content:
          "اختر خطة Nexora المناسبة لشركتك: Starter للبداية، Pro للنمو، Enterprise للشركات الكبرى. سوق B2B متخصص في قطاع الصحة.",
      },
      { property: "og:title", content: "خطط الاشتراك — Nexora" },
      {
        property: "og:description",
        content: "ثلاث خطط مرنة للموردين في قطاع الصحة بالجملة.",
      },
    ],
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

const PLAN_META: Record<
  string,
  { icon: typeof Rocket; tagline: string; highlight?: boolean }
> = {
  Starter: { icon: Rocket, tagline: "لبدء رحلتك في السوق" },
  Pro: { icon: Sparkles, tagline: "الأكثر شيوعًا — للنمو الجاد", highlight: true },
  Enterprise: { icon: Crown, tagline: "لشركات الأدوية والموردين الكبار" },
};

function formatLimit(n: number | null, suffix: string) {
  if (n === null) return `غير محدود ${suffix}`;
  return `${n.toLocaleString("ar-MA")} ${suffix}`;
}

function PricingPage() {
  const [plans, setPlans] = useState<Plan[]>([]);
  const [loading, setLoading] = useState(true);
  const { session } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    track("pricing_view", {});
    supabase
      .from("subscription_plans")
      .select("*")
      .eq("active", true)
      .order("monthly_price", { ascending: true })
      .then(({ data }) => {
        setPlans((data ?? []) as Plan[]);
        setLoading(false);
      });
  }, []);

  const handleChoose = (plan: Plan) => {
    track("pricing_plan_click", {
      plan_id: plan.id,
      plan_name: plan.name,
      price: plan.monthly_price,
    });
    if (!session) {
      navigate({ to: "/signup", search: { plan: plan.id } as never });
      return;
    }
    navigate({ to: "/vendor/billing", search: { plan: plan.id } as never });
  };

  return (
    <div className="min-h-screen bg-gradient-soft" dir="rtl">
      {/* Top bar */}
      <header className="border-b bg-background/80 backdrop-blur sticky top-0 z-30">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <Link
            to="/"
            className="flex items-center gap-2 font-extrabold text-lg"
            onClick={() => track("landing_nav_click", { target: "home_from_pricing" })}
          >
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-primary shadow-glow">
              <Building2 className="h-4 w-4 text-primary-foreground" />
            </div>
            Nexora
          </Link>
          <Link to="/" className="text-sm text-muted-foreground hover:text-foreground inline-flex items-center gap-1">
            <ArrowLeft className="h-4 w-4" />
            العودة
          </Link>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto max-w-4xl px-4 pt-16 pb-10 text-center">
        <Badge variant="secondary" className="mb-4">خطط مرنة • بدون رسوم خفية</Badge>
        <h1 className="text-4xl md:text-5xl font-extrabold tracking-tight">
          اختر الخطة المناسبة لنمو شركتك
        </h1>
        <p className="mt-4 text-lg text-muted-foreground">
          تجربة 14 يوم مجانية على كل الخطط. ألغِ في أي وقت — بدون التزامات.
        </p>
      </section>

      {/* Plans grid */}
      <section className="mx-auto max-w-6xl px-4 pb-20">
        {loading ? (
          <div className="grid gap-6 md:grid-cols-3">
            {[1, 2, 3].map((i) => (
              <Skeleton key={i} className="h-[520px] rounded-2xl" />
            ))}
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-3">
            {plans.map((plan) => {
              const meta = PLAN_META[plan.name] ?? {
                icon: Building2,
                tagline: "",
              };
              const Icon = meta.icon;
              return (
                <Card
                  key={plan.id}
                  className={`relative flex flex-col p-6 transition-all hover:shadow-elegant ${
                    meta.highlight
                      ? "border-primary border-2 shadow-glow scale-[1.02]"
                      : ""
                  }`}
                >
                  {meta.highlight && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-gradient-primary text-primary-foreground border-0 shadow-md">
                      الأكثر شعبية
                    </Badge>
                  )}

                  <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-accent">
                    <Icon className="h-6 w-6 text-primary" />
                  </div>

                  <h3 className="text-2xl font-extrabold">{plan.name}</h3>
                  <p className="mt-1 text-sm text-muted-foreground">{meta.tagline}</p>

                  <div className="mt-6">
                    <span className="text-4xl font-extrabold tabular-nums" dir="ltr">
                      {plan.monthly_price.toLocaleString("ar-MA")}
                    </span>
                    <span className="ms-2 text-sm text-muted-foreground">
                      {plan.currency} / شهريًا
                    </span>
                  </div>

                  <ul className="mt-6 space-y-3 text-sm flex-1">
                    <FeatureRow text={formatLimit(plan.max_products, "منتج")} />
                    <FeatureRow text={formatLimit(plan.max_users, "مستخدم")} />
                    <FeatureRow text={formatLimit(plan.max_clients, "عميل / شهر")} />
                    <FeatureRow
                      text={`تحليلات ${
                        (plan.features?.analytics as string) === "enterprise"
                          ? "متقدمة جداً"
                          : (plan.features?.analytics as string) === "advanced"
                            ? "متقدمة"
                            : "أساسية"
                      }`}
                    />
                    <FeatureRow
                      text={`دعم ${
                        (plan.features?.support as string) === "dedicated"
                          ? "مخصّص (مدير حساب)"
                          : (plan.features?.support as string) === "priority"
                            ? "ذو أولوية"
                            : "عبر البريد"
                      }`}
                    />
                    {plan.features?.custom_domain ? (
                      <FeatureRow text="نطاق مخصّص (yourbrand.com)" />
                    ) : null}
                    {plan.features?.api_access ? (
                      <FeatureRow text="وصول API كامل" />
                    ) : null}
                    {plan.features?.priority_listing ? (
                      <FeatureRow text="ظهور مميّز في السوق" />
                    ) : null}
                    {plan.features?.sla ? (
                      <FeatureRow text="اتفاقية مستوى خدمة (SLA) 99.9%" />
                    ) : null}
                  </ul>

                  <Button
                    className={`mt-8 w-full ${
                      meta.highlight ? "bg-gradient-primary shadow-glow" : ""
                    }`}
                    variant={meta.highlight ? "default" : "outline"}
                    onClick={() => handleChoose(plan)}
                  >
                    {session ? "ترقية لهذه الخطة" : "ابدأ تجربتك المجانية"}
                  </Button>
                </Card>
              );
            })}
          </div>
        )}

        {/* Test mode notice */}
        <div className="mt-12 rounded-2xl border border-warning/30 bg-warning/5 p-5 text-center text-sm text-warning-foreground">
          <strong>وضع الاختبار:</strong> بوابة الدفع الحقيقية لم تُفعَّل بعد. عند الترقية،
          سيتم محاكاة الدفع فوريًا لأغراض التجربة.
        </div>
      </section>
    </div>
  );
}

function FeatureRow({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2">
      <Check className="h-5 w-5 shrink-0 text-primary mt-0.5" />
      <span>{text}</span>
    </li>
  );
}
