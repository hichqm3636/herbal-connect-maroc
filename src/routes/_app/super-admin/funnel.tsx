import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownRight,
  Filter,
  RefreshCw,
  TrendingDown,
  TrendingUp,
  MousePointerClick,
  ShoppingCart,
  Sparkles,
  Building2,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_app/super-admin/funnel")({
  component: FunnelPage,
  head: () => ({
    meta: [{ title: "قمع التحويل — Nexora" }],
  }),
});

type RangeKey = "7d" | "30d" | "90d";

const RANGE_OPTIONS: { key: RangeKey; label: string; days: number }[] = [
  { key: "7d", label: "آخر 7 أيام", days: 7 },
  { key: "30d", label: "آخر 30 يومًا", days: 30 },
  { key: "90d", label: "آخر 90 يومًا", days: 90 },
];

interface FunnelStep {
  key: string;
  label: string;
  description: string;
  count: number;
  icon: typeof MousePointerClick;
}

function rangeStartIso(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function FunnelPage() {
  const [range, setRange] = useState<RangeKey>("30d");
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    const days = RANGE_OPTIONS.find((r) => r.key === range)?.days ?? 30;
    const since = rangeStartIso(days);

    const events = [
      // Acquisition / landing
      "landing_view",
      "landing_cta_click",
      "landing_vendor_click",
      "landing_category_click",
      // Vendor signup funnel
      "signup_view",
      "signup_started",
      "signup_completed",
      "signup_failed",
      "vendor_onboarded",
      // Buyer commerce funnel
      "vendors_directory_view",
      "vendor_store_view",
      "product_view",
      "add_to_cart",
      "checkout_view",
      "checkout_completed",
    ];

    Promise.all(
      events.map((ev) =>
        supabase
          .from("analytics_events")
          .select("id", { count: "exact", head: true })
          .eq("event_name", ev)
          .gte("created_at", since)
          .then(({ count }) => [ev, count ?? 0] as const),
      ),
    ).then((rows) => {
      if (cancelled) return;
      const map: Record<string, number> = {};
      for (const [k, v] of rows) map[k] = v;
      setCounts(map);
      setLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, [range, refreshKey]);

  const acquisitionFunnel = useMemo<FunnelStep[]>(
    () => [
      {
        key: "landing_view",
        label: "زيارات الواجهة",
        description: "عدد مرات تحميل الصفحة الرئيسية",
        count: counts.landing_view ?? 0,
        icon: Sparkles,
      },
      {
        key: "landing_cta_click",
        label: "نقرات CTA",
        description: "كل أزرار 'ابدأ مجانًا' / 'تصفّح السوق' / إلخ",
        count: counts.landing_cta_click ?? 0,
        icon: MousePointerClick,
      },
      {
        key: "signup_view",
        label: "وصلوا لصفحة التسجيل",
        description: "فتحوا /signup",
        count: counts.signup_view ?? 0,
        icon: Building2,
      },
      {
        key: "signup_started",
        label: "بدؤوا الإرسال",
        description: "ضغطوا 'إنشاء بوابتي'",
        count: counts.signup_started ?? 0,
        icon: MousePointerClick,
      },
      {
        key: "signup_completed",
        label: "أنشؤوا بوابتهم",
        description: "تحويل ناجح إلى مورد",
        count: counts.signup_completed ?? 0,
        icon: TrendingUp,
      },
    ],
    [counts],
  );

  const commerceFunnel = useMemo<FunnelStep[]>(
    () => [
      {
        key: "product_view",
        label: "مشاهدة منتج",
        description: "زائر شاهد صفحة منتج",
        count: counts.product_view ?? 0,
        icon: Sparkles,
      },
      {
        key: "add_to_cart",
        label: "إضافة للسلة",
        description: "أضاف منتجًا إلى سلته",
        count: counts.add_to_cart ?? 0,
        icon: ShoppingCart,
      },
      {
        key: "checkout_view",
        label: "وصول للدفع",
        description: "فتح صفحة إتمام الطلب",
        count: counts.checkout_view ?? 0,
        icon: MousePointerClick,
      },
      {
        key: "checkout_completed",
        label: "إتمام الطلب",
        description: "أكمل الطلب بنجاح",
        count: counts.checkout_completed ?? 0,
        icon: TrendingUp,
      },
    ],
    [counts],
  );

  return (
    <div className="space-y-6 p-4 sm:p-6 lg:p-8" dir="rtl">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight">قمع التحويل</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            من زيارة الواجهة إلى مورد جديد، ومن مشاهدة منتج إلى طلب مكتمل.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={range} onValueChange={(v) => setRange(v as RangeKey)}>
            <SelectTrigger className="w-[160px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {RANGE_OPTIONS.map((r) => (
                <SelectItem key={r.key} value={r.key}>
                  {r.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            size="icon"
            variant="outline"
            onClick={() => setRefreshKey((k) => k + 1)}
            aria-label="تحديث"
          >
            <RefreshCw className={cn("h-4 w-4", loading && "animate-spin")} />
          </Button>
        </div>
      </div>

      <FunnelCard
        title="قمع الاكتساب (مورد جديد)"
        subtitle="من زائر الواجهة الرئيسية إلى تسجيل بوابة جديدة"
        steps={acquisitionFunnel}
        loading={loading}
      />

      <FunnelCard
        title="قمع التجارة (مشترٍ B2B)"
        subtitle="من مشاهدة منتج إلى طلب مكتمل"
        steps={commerceFunnel}
        loading={loading}
      />

      <SecondaryStats counts={counts} loading={loading} />

      <Card className="p-5 text-xs text-muted-foreground">
        <p>
          ملاحظة: الأحداث تُجمَع من جدول <code>analytics_events</code> ضمن الفترة
          المختارة. كل خطوة في القمع تعرض النسبة المئوية مقارنة بالخطوة السابقة
          (معدل التحويل) ونسبة الفقد. للوصول إلى أدوات تحليل مفصّلة:{" "}
          <Link to="/super-admin/analytics" className="text-primary hover:underline">
            تحليلات المنصة
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}

function FunnelCard({
  title,
  subtitle,
  steps,
  loading,
}: {
  title: string;
  subtitle: string;
  steps: FunnelStep[];
  loading: boolean;
}) {
  const top = steps[0]?.count ?? 0;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-border/60 p-5">
        <h2 className="text-lg font-bold">{title}</h2>
        <p className="mt-0.5 text-sm text-muted-foreground">{subtitle}</p>
      </div>
      <div className="divide-y divide-border/60">
        {loading
          ? Array.from({ length: steps.length }).map((_, i) => (
              <div key={i} className="p-5">
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="mt-3 h-4 w-full" />
              </div>
            ))
          : steps.map((step, i) => {
              const prev = i === 0 ? null : steps[i - 1].count;
              const stepRate =
                prev === null || prev === 0 ? null : (step.count / prev) * 100;
              const overallRate =
                top === 0 ? null : (step.count / top) * 100;
              const dropOff =
                prev === null || prev === 0
                  ? null
                  : ((prev - step.count) / prev) * 100;

              return (
                <div key={step.key} className="p-5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent text-accent-foreground">
                        <step.icon className="h-5 w-5" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold">
                            {i + 1}. {step.label}
                          </span>
                          {i === 0 && (
                            <Badge variant="secondary" className="text-[10px]">
                              نقطة البداية
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {step.description}
                        </div>
                      </div>
                    </div>
                    <div className="text-left shrink-0" dir="ltr">
                      <div className="text-2xl font-extrabold tabular-nums">
                        {step.count.toLocaleString()}
                      </div>
                      {overallRate !== null && (
                        <div className="text-[11px] text-muted-foreground">
                          {overallRate.toFixed(1)}% من البداية
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Progress bar */}
                  <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-gradient-primary transition-all"
                      style={{
                        width: `${Math.max(2, overallRate ?? 0)}%`,
                      }}
                    />
                  </div>

                  {/* Step → Step rates */}
                  {stepRate !== null && dropOff !== null && (
                    <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
                      <Badge
                        variant="outline"
                        className={cn(
                          "gap-1",
                          stepRate >= 50
                            ? "border-success/40 text-success"
                            : stepRate >= 20
                              ? "border-warning/40 text-warning"
                              : "border-destructive/40 text-destructive",
                        )}
                      >
                        <ArrowDownRight className="h-3 w-3" />
                        تحويل من السابقة: {stepRate.toFixed(1)}%
                      </Badge>
                      <Badge variant="outline" className="gap-1 text-muted-foreground">
                        <TrendingDown className="h-3 w-3" />
                        فقد: {dropOff.toFixed(1)}%
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
      </div>
    </Card>
  );
}

function SecondaryStats({
  counts,
  loading,
}: {
  counts: Record<string, number>;
  loading: boolean;
}) {
  const items = [
    { label: "نقرات على بطاقات الموردين", value: counts.landing_vendor_click ?? 0 },
    { label: "نقرات على الفئات", value: counts.landing_category_click ?? 0 },
    { label: "زيارات دليل الموردين", value: counts.vendors_directory_view ?? 0 },
    { label: "محاولات تسجيل فاشلة", value: counts.signup_failed ?? 0 },
  ];

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((it) => (
        <Card key={it.label} className="p-4">
          <div className="text-xs text-muted-foreground">{it.label}</div>
          <div className="mt-1.5 text-2xl font-extrabold tabular-nums" dir="ltr">
            {loading ? <Skeleton className="h-7 w-16" /> : it.value.toLocaleString()}
          </div>
        </Card>
      ))}
    </div>
  );
}
