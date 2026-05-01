import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  Eye,
  Repeat,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  Zap,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/super-admin/growth")({
  component: GrowthPage,
  head: () => ({ meta: [{ title: "نمو العملاء — Nexora" }] }),
});

const PERIODS = [
  { label: "7 أيام", value: 7 },
  { label: "30 يوم", value: 30 },
  { label: "90 يوم", value: 90 },
] as const;

interface GrowthRow {
  reorder_clicks: number;
  recommendation_clicks: number;
  dashboard_views: number;
  quick_action_clicks: number;
  orders: number;
  conversion_rate: number;
}

async function fetchGrowth(days: number): Promise<GrowthRow> {
  const { data, error } = await supabase.rpc("analytics_client_growth", {
    _days: days,
  });
  if (error) throw error;
  const row = (Array.isArray(data) ? data[0] : data) as
    | Partial<GrowthRow>
    | null
    | undefined;
  return {
    reorder_clicks: Number(row?.reorder_clicks ?? 0),
    recommendation_clicks: Number(row?.recommendation_clicks ?? 0),
    dashboard_views: Number(row?.dashboard_views ?? 0),
    quick_action_clicks: Number(row?.quick_action_clicks ?? 0),
    orders: Number(row?.orders ?? 0),
    conversion_rate: Number(row?.conversion_rate ?? 0),
  };
}

function MetricCard({
  label,
  value,
  icon: Icon,
  hint,
}: {
  label: string;
  value: string;
  icon: LucideIcon;
  hint?: string;
}) {
  return (
    <Card className="p-5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
          {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
        </div>
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

function GrowthPage() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError, refetch, isFetching } = useQuery({
    queryKey: ["analytics-client-growth", days],
    queryFn: () => fetchGrowth(days),
    staleTime: 60_000,
  });

  return (
    <div className="space-y-6 p-4 md:p-6" dir="rtl">
      <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">نمو العملاء</h1>
          <p className="text-sm text-muted-foreground">
            مؤشرات سلوك العملاء وتحويل الزيارات إلى طلبات.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-card p-1">
            {PERIODS.map((p) => (
              <Button
                key={p.value}
                size="sm"
                variant={days === p.value ? "default" : "ghost"}
                className="h-8 px-3"
                onClick={() => setDays(p.value)}
              >
                {p.label}
              </Button>
            ))}
          </div>
          <Button
            size="sm"
            variant="outline"
            onClick={() => refetch()}
            disabled={isFetching}
          >
            تحديث
          </Button>
        </div>
      </header>

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : isError || !data ? (
        <Card className="p-6 text-center text-sm text-muted-foreground">
          تعذّر تحميل البيانات.
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <MetricCard
            label="مشاهدات لوحة العميل"
            value={data.dashboard_views.toLocaleString("ar")}
            icon={Eye}
          />
          <MetricCard
            label="نقرات إعادة الطلب"
            value={data.reorder_clicks.toLocaleString("ar")}
            icon={Repeat}
          />
          <MetricCard
            label="نقرات التوصيات"
            value={data.recommendation_clicks.toLocaleString("ar")}
            icon={Sparkles}
          />
          <MetricCard
            label="نقرات الإجراءات السريعة"
            value={data.quick_action_clicks.toLocaleString("ar")}
            icon={Zap}
          />
          <MetricCard
            label="الطلبات"
            value={data.orders.toLocaleString("ar")}
            icon={ShoppingBag}
            hint={`خلال ${days} يوم`}
          />
          <MetricCard
            label="نسبة التحويل"
            value={`${data.conversion_rate}%`}
            icon={TrendingUp}
            hint="طلبات / مشاهدات لوحة العميل"
          />
        </div>
      )}
    </div>
  );
}
