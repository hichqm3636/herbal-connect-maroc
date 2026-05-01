import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { FlaskConical } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_app/super-admin/ab-tests")({
  component: AbTestsPage,
  head: () => ({ meta: [{ title: "تجارب A/B — Nexora" }] }),
});

const PERIODS = [
  { label: "7 أيام", value: 7 },
  { label: "30 يوم", value: 30 },
  { label: "90 يوم", value: 90 },
] as const;

interface AbRow {
  experiment: string;
  variant: string;
  assignments: number;
  conversions: number;
  conversion_rate: number;
}

async function fetchAb(days: number): Promise<AbRow[]> {
  const { data, error } = await supabase.rpc("analytics_ab_results", { _days: days });
  if (error) throw error;
  return ((data ?? []) as Partial<AbRow>[]).map((r) => ({
    experiment: String(r.experiment ?? "unknown"),
    variant: String(r.variant ?? "unknown"),
    assignments: Number(r.assignments ?? 0),
    conversions: Number(r.conversions ?? 0),
    conversion_rate: Number(r.conversion_rate ?? 0),
  }));
}

function AbTestsPage() {
  const [days, setDays] = useState<number>(30);

  const { data, isLoading, isError, refetch } = useQuery({
    queryKey: ["analytics-ab-results", days],
    queryFn: () => fetchAb(days),
    staleTime: 30_000,
  });

  // Group by experiment
  const grouped = (data ?? []).reduce<Record<string, AbRow[]>>((acc, row) => {
    (acc[row.experiment] ??= []).push(row);
    return acc;
  }, {});

  return (
    <div dir="rtl" className="container mx-auto max-w-5xl space-y-6 p-4 md:p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="flex items-center gap-2">
          <FlaskConical className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold md:text-2xl">تجارب A/B</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {PERIODS.map((p) => (
            <Button
              key={p.value}
              size="sm"
              variant={days === p.value ? "default" : "outline"}
              onClick={() => setDays(p.value)}
            >
              {p.label}
            </Button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 md:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : isError ? (
        <Card className="p-6 text-center">
          <p className="mb-3 text-sm text-muted-foreground">تعذر تحميل النتائج</p>
          <Button size="sm" onClick={() => refetch()}>
            إعادة المحاولة
          </Button>
        </Card>
      ) : Object.keys(grouped).length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          لا توجد بيانات تجارب في هذه الفترة بعد
        </Card>
      ) : (
        <div className="space-y-6">
          {Object.entries(grouped).map(([experiment, rows]) => {
            const best = [...rows].sort((a, b) => b.conversion_rate - a.conversion_rate)[0];
            return (
              <Card key={experiment} className="p-4 md:p-5">
                <div className="mb-4 flex items-baseline justify-between">
                  <h2 className="text-lg font-semibold">{experiment}</h2>
                  {best && best.conversions > 0 ? (
                    <span className="text-xs text-muted-foreground">
                      الأفضل: <span className="font-semibold text-foreground">{best.variant}</span>
                    </span>
                  ) : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  {rows.map((r) => {
                    const isBest = best && r.variant === best.variant && r.conversions > 0;
                    return (
                      <div
                        key={r.variant}
                        className={`rounded-lg border p-3 ${
                          isBest ? "border-primary bg-primary/5" : "border-border"
                        }`}
                      >
                        <div className="mb-2 flex items-center justify-between">
                          <span className="font-medium">{r.variant}</span>
                          <span className="text-lg font-bold">{r.conversion_rate}%</span>
                        </div>
                        <div className="flex justify-between text-xs text-muted-foreground">
                          <span>التعيينات: {r.assignments.toLocaleString("ar")}</span>
                          <span>التحويلات: {r.conversions.toLocaleString("ar")}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
