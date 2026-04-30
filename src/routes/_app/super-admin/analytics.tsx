import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatMAD } from "@/lib/format";
import {
  Activity,
  Eye,
  ShoppingCart,
  CheckCircle2,
  MessageCircle,
  TrendingDown,
} from "lucide-react";

export const Route = createFileRoute("/_app/super-admin/analytics")({
  component: AnalyticsPage,
  head: () => ({ meta: [{ title: "تحليلات التحويل — Nexora" }] }),
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

interface ConversionRow {
  product_id: string;
  views: number;
  add_to_cart: number;
  completed: number;
  conversion_rate: number;
}

interface VendorRow {
  vendor_id: string;
  orders_count: number;
  revenue_mad: number;
}

const PERIODS = [
  { label: "7 أيام", value: 7 },
  { label: "30 يوم", value: 30 },
  { label: "90 يوم", value: 90 },
];

function AnalyticsPage() {
  const [days, setDays] = useState(30);

  const funnelQ = useQuery({
    queryKey: ["analytics-funnel", days],
    queryFn: async (): Promise<FunnelData | null> => {
      const { data, error } = await supabase.rpc("analytics_checkout_funnel", {
        _vendor_id: undefined as unknown as string,
        _days: days,
      });
      if (error) throw error;
      return (data as unknown as FunnelData) ?? null;
    },
  });

  const conversionQ = useQuery({
    queryKey: ["analytics-conversion", days],
    queryFn: async (): Promise<ConversionRow[]> => {
      const { data, error } = await supabase.rpc("analytics_product_conversion", {
        _vendor_id: undefined as unknown as string,
        _days: days,
      });
      if (error) throw error;
      return (data as unknown as ConversionRow[]) ?? [];
    },
  });

  const vendorQ = useQuery({
    queryKey: ["analytics-vendors", days],
    queryFn: async (): Promise<VendorRow[]> => {
      const { data, error } = await supabase.rpc("analytics_vendor_orders", {
        _days: days,
      });
      if (error) throw error;
      return (data as unknown as VendorRow[]) ?? [];
    },
  });

  // Resolve product & vendor names in one go
  const productIds = (conversionQ.data ?? []).map((r) => r.product_id);
  const vendorIds = (vendorQ.data ?? []).map((r) => r.vendor_id);

  const namesQ = useQuery({
    queryKey: ["analytics-names", productIds.join(","), vendorIds.join(",")],
    enabled: productIds.length > 0 || vendorIds.length > 0,
    queryFn: async () => {
      const [{ data: prods }, { data: vendors }] = await Promise.all([
        productIds.length
          ? supabase.from("products").select("id, name_ar").in("id", productIds)
          : Promise.resolve({ data: [] as { id: string; name_ar: string }[] }),
        vendorIds.length
          ? supabase
              .from("companies")
              .select("id, name, display_name")
              .in("id", vendorIds)
          : Promise.resolve({
              data: [] as { id: string; name: string; display_name: string }[],
            }),
      ]);
      const pMap = new Map((prods ?? []).map((p) => [p.id, p.name_ar]));
      const vMap = new Map(
        (vendors ?? []).map((v) => [v.id, v.display_name || v.name]),
      );
      return { pMap, vMap };
    },
  });

  const f = funnelQ.data;

  return (
    <div dir="rtl" className="space-y-5">
      <div className="flex items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="h-6 w-6" /> تحليلات التحويل
          </h1>
          <p className="text-sm text-muted-foreground">
            مسار العميل من المشاهدة إلى الشراء
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

      {/* Funnel */}
      <Card className="p-4">
        <h2 className="font-bold mb-3">قمع التحويل</h2>
        {funnelQ.isLoading || !f ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
            <FunnelStep icon={<Eye className="h-4 w-4" />} label="مشاهدات" value={f.views} />
            <FunnelStep
              icon={<ShoppingCart className="h-4 w-4" />}
              label="أضيف للسلة"
              value={f.add_to_cart}
              drop={f.drop_view_to_cart}
            />
            <FunnelStep
              icon={<Activity className="h-4 w-4" />}
              label="بدء الدفع"
              value={f.checkout_view}
              drop={f.drop_cart_to_checkout}
            />
            <FunnelStep
              icon={<CheckCircle2 className="h-4 w-4" />}
              label="اكتمل"
              value={f.completed}
              drop={f.drop_checkout_to_completed}
              good
            />
            <FunnelStep
              icon={<MessageCircle className="h-4 w-4" />}
              label="WhatsApp"
              value={f.whatsapp_fallback}
            />
          </div>
        )}
      </Card>

      {/* Vendor orders */}
      <Card className="p-4">
        <h2 className="font-bold mb-3">الطلبات حسب البائع</h2>
        {vendorQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (vendorQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بيانات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">البائع</th>
                  <th className="py-2">الطلبات</th>
                  <th className="py-2">الإيراد</th>
                </tr>
              </thead>
              <tbody>
                {(vendorQ.data ?? []).map((v) => (
                  <tr key={v.vendor_id} className="border-t">
                    <td className="py-2">
                      {namesQ.data?.vMap.get(v.vendor_id) ?? v.vendor_id.slice(0, 8)}
                    </td>
                    <td className="py-2 tabular-nums">{v.orders_count}</td>
                    <td className="py-2 tabular-nums">{formatMAD(v.revenue_mad)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Product conversion */}
      <Card className="p-4">
        <h2 className="font-bold mb-3">معدل التحويل لكل منتج</h2>
        {conversionQ.isLoading ? (
          <Skeleton className="h-32 w-full" />
        ) : (conversionQ.data ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">لا توجد بيانات</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-right text-xs text-muted-foreground">
                <tr>
                  <th className="py-2">المنتج</th>
                  <th className="py-2">مشاهدات</th>
                  <th className="py-2">سلة</th>
                  <th className="py-2">شراء</th>
                  <th className="py-2">التحويل</th>
                </tr>
              </thead>
              <tbody>
                {(conversionQ.data ?? []).slice(0, 50).map((r) => (
                  <tr key={r.product_id} className="border-t">
                    <td className="py-2 truncate max-w-[200px]">
                      {namesQ.data?.pMap.get(r.product_id) ?? r.product_id.slice(0, 8)}
                    </td>
                    <td className="py-2 tabular-nums">{r.views}</td>
                    <td className="py-2 tabular-nums">{r.add_to_cart}</td>
                    <td className="py-2 tabular-nums">{r.completed}</td>
                    <td className="py-2 tabular-nums">
                      <Badge
                        variant={r.conversion_rate >= 2 ? "default" : "secondary"}
                      >
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

function FunnelStep({
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
      <p className={`mt-1 text-2xl font-extrabold tabular-nums ${good ? "text-success" : ""}`}>
        {value}
      </p>
      {typeof drop === "number" && drop > 0 && (
        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-destructive">
          <TrendingDown className="h-3 w-3" /> فقدان {drop}%
        </p>
      )}
    </div>
  );
}
