import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Activity,
  AlertTriangle,
  Eye,
  ShoppingCart,
  CheckCircle2,
  TrendingDown,
  XCircle,
} from "lucide-react";
import { AnalyticsRecommendations } from "@/components/AnalyticsRecommendations";

export const Route = createFileRoute("/_app/_vendor/vendor/analytics")({
  component: VendorAnalyticsPage,
  head: () => ({ meta: [{ title: "تحليلات المنتجات — لوحة البائع" }] }),
});

interface FunnelData {
  views: number;
  add_to_cart: number;
  checkout_view: number;
  completed: number;
  whatsapp_fallback: number;
  drop_view_to_cart: number;
  drop_cart_to_checkout: number;
  drop_checkout_to_completed: number;
}

interface VendorProductRow {
  product_id: string;
  views: number;
  add_to_cart: number;
  checkout_started: number;
  completed: number;
  exits_before_cart: number;
  conversion_rate: number;
  cart_rate: number;
}

interface AlertRow {
  product_id: string;
  vendor_id: string;
  views: number;
  add_to_cart: number;
  checkout_started: number;
  completed: number;
  conversion_rate: number;
  cart_rate: number;
  abandonment_rate: number;
  alert_type: "low_conversion" | "weak_add_to_cart" | "high_abandonment";
  severity: "high" | "medium";
}

const PERIODS = [
  { label: "7 أيام", value: 7 },
  { label: "30 يوم", value: 30 },
  { label: "90 يوم", value: 90 },
];

const ALERT_LABEL: Record<AlertRow["alert_type"], string> = {
  low_conversion: "معدل تحويل منخفض (<1%)",
  weak_add_to_cart: "إضافة للسلة ضعيفة (<5%)",
  high_abandonment: "هجر السلة مرتفع (≥50%)",
};

function VendorAnalyticsPage() {
  const { companyId } = useAuth();
  const [days, setDays] = useState(30);

  const funnelQ = useQuery({
    queryKey: ["v-funnel", companyId, days],
    enabled: !!companyId,
    queryFn: async (): Promise<FunnelData | null> => {
      const { data, error } = await supabase.rpc("analytics_checkout_funnel", {
        _vendor_id: companyId!,
        _days: days,
      });
      if (error) throw error;
      return (data as unknown as FunnelData) ?? null;
    },
  });

  const productsQ = useQuery({
    queryKey: ["v-products", companyId, days],
    enabled: !!companyId,
    queryFn: async (): Promise<VendorProductRow[]> => {
      const { data, error } = await supabase.rpc("analytics_vendor_product_stats", {
        _vendor_id: companyId!,
        _days: days,
      });
      if (error) throw error;
      return (data as unknown as VendorProductRow[]) ?? [];
    },
  });

  const alertsQ = useQuery({
    queryKey: ["v-alerts", companyId, days],
    enabled: !!companyId,
    queryFn: async (): Promise<AlertRow[]> => {
      const { data, error } = await supabase.rpc("analytics_alerts", {
        _vendor_id: companyId!,
        _days: days,
      });
      if (error) throw error;
      return (data as unknown as AlertRow[]) ?? [];
    },
  });

  const productIds = (productsQ.data ?? []).map((r) => r.product_id);
  const namesQ = useQuery({
    queryKey: ["v-product-names", productIds.join(",")],
    enabled: productIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("products")
        .select("id, name_ar")
        .in("id", productIds);
      return new Map((data ?? []).map((p) => [p.id, p.name_ar]));
    },
  });

  const f = funnelQ.data;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> تحليلات منتجاتك
          </h1>
          <p className="text-sm text-muted-foreground">
            مشاهدات، إضافات للسلة، طلبات، ومعدل التحويل لكل منتج
          </p>
        </div>
        <div className="flex gap-1">
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

      {/* Alerts */}
      {(alertsQ.data ?? []).length > 0 && (
        <Card className="p-4 border-destructive/40 bg-destructive/5">
          <h2 className="font-bold mb-3 flex items-center gap-2 text-destructive">
            <AlertTriangle className="h-5 w-5" /> تنبيهات تحتاج اهتمامك
          </h2>
          <div className="space-y-2">
            {(alertsQ.data ?? []).slice(0, 10).map((a) => (
              <div
                key={`${a.product_id}-${a.alert_type}`}
                className="flex flex-wrap items-center gap-2 rounded-md border bg-card p-2 text-sm"
              >
                <Badge variant={a.severity === "high" ? "destructive" : "secondary"}>
                  {a.severity === "high" ? "عاجل" : "متوسط"}
                </Badge>
                <span className="font-medium">
                  {namesQ.data?.get(a.product_id) ?? a.product_id.slice(0, 8)}
                </span>
                <span className="text-muted-foreground">— {ALERT_LABEL[a.alert_type]}</span>
                <span className="ms-auto text-xs text-muted-foreground tabular-nums">
                  {a.views} مشاهدة · تحويل {a.conversion_rate}%
                </span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Funnel */}
      <Card className="p-4">
        <h2 className="font-bold mb-3">قمع التحويل (متجرك)</h2>
        {funnelQ.isLoading || !f ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Step icon={<Eye className="h-4 w-4" />} label="مشاهدات" value={f.views} />
            <Step
              icon={<ShoppingCart className="h-4 w-4" />}
              label="أضيف للسلة"
              value={f.add_to_cart}
              drop={f.drop_view_to_cart}
            />
            <Step
              icon={<Activity className="h-4 w-4" />}
              label="بدء الدفع"
              value={f.checkout_view}
              drop={f.drop_cart_to_checkout}
            />
            <Step
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="اكتمل"
              value={f.completed}
              drop={f.drop_checkout_to_completed}
              good
            />
          </div>
        )}
      </Card>

      {/* Products */}
      <Card className="p-4">
        <h2 className="font-bold mb-3">أداء المنتجات</h2>
        {productsQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (productsQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بيانات بعد لهذه الفترة</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">المنتج</th>
                  <th className="py-2">مشاهدات</th>
                  <th className="py-2">سلة</th>
                  <th className="py-2">طلبات</th>
                  <th className="py-2">خروج</th>
                  <th className="py-2">سلة %</th>
                  <th className="py-2">تحويل %</th>
                </tr>
              </thead>
              <tbody>
                {(productsQ.data ?? []).slice(0, 100).map((r) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="py-2 truncate max-w-[200px]">
                      {namesQ.data?.get(r.product_id) ?? r.product_id.slice(0, 8)}
                    </td>
                    <td className="py-2 tabular-nums">{r.views}</td>
                    <td className="py-2 tabular-nums">{r.add_to_cart}</td>
                    <td className="py-2 tabular-nums">{r.completed}</td>
                    <td className="py-2 tabular-nums text-muted-foreground">
                      {r.exits_before_cart}
                    </td>
                    <td className="py-2 tabular-nums">{r.cart_rate}%</td>
                    <td className="py-2 tabular-nums">
                      <Badge variant={r.conversion_rate >= 2 ? "default" : "secondary"}>
                        {r.conversion_rate}%
                      </Badge>
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

function Step({
  icon,
  label,
  value,
  drop,
  good,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  drop?: number;
  good?: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <p
        className={`mt-1 text-2xl font-extrabold tabular-nums ${good ? "text-success" : ""}`}
      >
        {value}
      </p>
      {typeof drop === "number" && drop > 0 && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-destructive">
          {drop >= 50 ? <XCircle className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}{" "}
          فقدان {drop}%
        </p>
      )}
    </div>
  );
}
