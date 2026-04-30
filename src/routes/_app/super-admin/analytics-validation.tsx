import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle2, Database, ListChecks, ShoppingCart } from "lucide-react";

export const Route = createFileRoute("/_app/super-admin/analytics-validation")({
  component: ValidationPage,
  head: () => ({ meta: [{ title: "تحقق من جودة التحليلات — Nexora" }] }),
});

interface RawEvent {
  id: string;
  event_name: string;
  product_id: string | null;
  vendor_id: string | null;
  user_id: string | null;
  price: number | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

interface IntegrityRow {
  event_name: string;
  total: number;
  missing_product: number;
  missing_vendor: number;
  duplicate_groups: number;
  duplicate_events: number;
}

interface OrdersVsEvents {
  orders_count: number;
  checkout_completed_events: number;
  diff: number;
  product_views: number;
  real_conversion_pct: number;
}

const PRODUCT_LEVEL_EVENTS = new Set([
  "product_view",
  "add_to_cart",
  "buy_now",
  "time_on_product",
  "scroll_depth_25",
  "scroll_depth_50",
  "scroll_depth_75",
  "scroll_depth_100",
  "exit_before_add_to_cart",
]);

function ValidationPage() {
  const recent = useQuery({
    queryKey: ["analytics-recent"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_recent_events", { p_limit: 50 });
      if (error) throw error;
      return (data ?? []) as RawEvent[];
    },
  });

  const integrity = useQuery({
    queryKey: ["analytics-integrity"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_integrity_report");
      if (error) throw error;
      return (data ?? []) as IntegrityRow[];
    },
  });

  const compare = useQuery({
    queryKey: ["analytics-orders-vs-events"],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("analytics_orders_vs_events", { p_days: 30 });
      if (error) throw error;
      return (data?.[0] ?? null) as OrdersVsEvents | null;
    },
  });

  const c = compare.data;
  const realConv = c?.real_conversion_pct ?? 0;
  const diffAbs = Math.abs(c?.diff ?? 0);
  const diffOk = diffAbs === 0;

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">تحقق من جودة التحليلات</h1>
        <p className="text-sm text-muted-foreground mt-1">
          فحص شامل للأحداث الخام، تكاملها، ومطابقتها مع جدول الطلبات الحقيقي.
        </p>
      </div>

      {/* Real conversion from orders */}
      <Card className="p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <ShoppingCart className="h-4 w-4 text-primary" />
          <h2 className="font-bold">التحويل الحقيقي (من جدول الطلبات — آخر 30 يوم)</h2>
        </div>
        {compare.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid gap-3 sm:grid-cols-4">
            <Stat label="مشاهدات منتجات" value={String(c?.product_views ?? 0)} />
            <Stat label="طلبات حقيقية" value={String(c?.orders_count ?? 0)} accent="primary" />
            <Stat
              label="conversion حقيقي"
              value={`${realConv.toFixed(2)}%`}
              accent={realConv >= 1 ? "success" : "warning"}
            />
            <Stat
              label="checkout_completed events"
              value={String(c?.checkout_completed_events ?? 0)}
            />
          </div>
        )}
        {!compare.isLoading && c && (
          <div
            className={`mt-4 flex items-start gap-2 rounded-lg border p-3 text-sm ${
              diffOk
                ? "border-success/40 bg-success/5 text-success"
                : "border-warning/40 bg-warning/5"
            }`}
          >
            {diffOk ? (
              <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" />
            ) : (
              <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0 text-warning-foreground" />
            )}
            <div>
              <p className="font-medium">
                مقارنة orders ↔ checkout_completed:{" "}
                {diffOk
                  ? "متطابق تماماً ✓"
                  : `فرق ${diffAbs} ${
                      (c.diff ?? 0) > 0
                        ? "(events أكثر من الطلبات الفعلية — احتمال تتبع مكرر)"
                        : "(طلبات بدون tracking — events ناقصة)"
                    }`}
              </p>
            </div>
          </div>
        )}
      </Card>

      {/* Integrity report */}
      <Card className="p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <ListChecks className="h-4 w-4 text-primary" />
          <h2 className="font-bold">تقرير تكامل الأحداث</h2>
        </div>
        {integrity.isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (integrity.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            لا توجد أحداث مسجلة بعد.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-right py-2 px-2">الحدث</th>
                  <th className="text-right py-2 px-2">العدد</th>
                  <th className="text-right py-2 px-2">بدون product</th>
                  <th className="text-right py-2 px-2">بدون vendor</th>
                  <th className="text-right py-2 px-2">مجموعات مكررة</th>
                  <th className="text-right py-2 px-2">أحداث مكررة</th>
                  <th className="text-right py-2 px-2">الحالة</th>
                </tr>
              </thead>
              <tbody>
                {integrity.data!.map((r) => {
                  const requiresProduct = PRODUCT_LEVEL_EVENTS.has(r.event_name);
                  const productIssue = requiresProduct && r.missing_product > 0;
                  const vendorIssue = r.missing_vendor > r.total * 0.5;
                  const dupIssue = r.duplicate_groups > 0;
                  const ok = !productIssue && !vendorIssue && !dupIssue;
                  return (
                    <tr key={r.event_name} className="border-b last:border-0">
                      <td className="py-2 px-2 font-medium">{r.event_name}</td>
                      <td className="py-2 px-2">{r.total}</td>
                      <td
                        className={`py-2 px-2 ${
                          productIssue ? "text-destructive font-bold" : ""
                        }`}
                      >
                        {r.missing_product}
                      </td>
                      <td
                        className={`py-2 px-2 ${
                          vendorIssue ? "text-warning-foreground font-bold" : ""
                        }`}
                      >
                        {r.missing_vendor}
                      </td>
                      <td
                        className={`py-2 px-2 ${
                          dupIssue ? "text-warning-foreground font-bold" : ""
                        }`}
                      >
                        {r.duplicate_groups}
                      </td>
                      <td className="py-2 px-2">{r.duplicate_events}</td>
                      <td className="py-2 px-2">
                        {ok ? (
                          <Badge variant="outline" className="border-success/40 text-success">
                            سليم
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="border-warning/40 text-warning-foreground">
                            انتباه
                          </Badge>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Raw events */}
      <Card className="p-5 shadow-soft">
        <div className="flex items-center gap-2 mb-4">
          <Database className="h-4 w-4 text-primary" />
          <h2 className="font-bold">آخر 50 حدث خام</h2>
        </div>
        {recent.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : (recent.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">
            لا توجد أحداث.
          </p>
        ) : (
          <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-background">
                <tr className="border-b text-muted-foreground">
                  <th className="text-right py-2 px-2">الوقت</th>
                  <th className="text-right py-2 px-2">الحدث</th>
                  <th className="text-right py-2 px-2">product_id</th>
                  <th className="text-right py-2 px-2">vendor_id</th>
                  <th className="text-right py-2 px-2">السعر</th>
                </tr>
              </thead>
              <tbody>
                {recent.data!.map((e) => (
                  <tr key={e.id} className="border-b last:border-0">
                    <td className="py-1.5 px-2 whitespace-nowrap text-muted-foreground">
                      {new Date(e.created_at).toLocaleString("ar-MA")}
                    </td>
                    <td className="py-1.5 px-2 font-medium">{e.event_name}</td>
                    <td className="py-1.5 px-2 font-mono">
                      {e.product_id ? (
                        e.product_id.slice(0, 8)
                      ) : (
                        <span className="text-destructive">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 font-mono">
                      {e.vendor_id ? (
                        e.vendor_id.slice(0, 8)
                      ) : (
                        <span className="text-warning-foreground">—</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2">{e.price ?? "—"}</td>
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

function Stat({
  label,
  value,
  accent = "muted",
}: {
  label: string;
  value: string;
  accent?: "muted" | "primary" | "success" | "warning";
}) {
  const accentMap = {
    muted: "bg-muted text-foreground",
    primary: "bg-primary/10 text-primary",
    success: "bg-success/10 text-success",
    warning: "bg-warning/10 text-warning-foreground",
  };
  return (
    <div className={`rounded-lg p-3 ${accentMap[accent]}`}>
      <p className="text-[11px] opacity-80">{label}</p>
      <p className="text-xl font-bold mt-1">{value}</p>
    </div>
  );
}
