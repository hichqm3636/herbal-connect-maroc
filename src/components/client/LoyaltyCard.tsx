import { useQuery } from "@tanstack/react-query";
import { Sparkles, Gift, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";

interface LoyaltyTxRow {
  id: string;
  points: number;
  type: string;
  description: string | null;
  created_at: string;
  order_id: string | null;
}

interface Props {
  userId: string;
}

export function LoyaltyCard({ userId }: Props) {
  const { data, isLoading } = useQuery({
    queryKey: ["loyalty", userId],
    queryFn: async () => {
      const [profileRes, txRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("loyalty_points")
          .eq("id", userId)
          .single(),
        supabase
          .from("loyalty_transactions")
          .select("id, points, type, description, created_at, order_id")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      // profiles row may not yet exist for brand-new users
      const balance = (profileRes.data as { loyalty_points?: number } | null)
        ?.loyalty_points ?? 0;
      const transactions = (txRes.data ?? []) as LoyaltyTxRow[];

      // Pull related order numbers for nicer rows
      const orderIds = Array.from(
        new Set(transactions.map((t) => t.order_id).filter((x): x is string => !!x)),
      );
      let orderMap = new Map<string, string>();
      if (orderIds.length > 0) {
        const { data: ordersData } = await supabase
          .from("orders")
          .select("id, order_number")
          .in("id", orderIds);
        orderMap = new Map(
          (ordersData ?? []).map((o) => [o.id, o.order_number]),
        );
      }

      return { balance, transactions, orderMap };
    },
    staleTime: 30_000,
  });

  if (isLoading || !data) {
    return <Skeleton className="h-40 w-full rounded-2xl" />;
  }

  const { balance, transactions, orderMap } = data;

  return (
    <section dir="rtl" className="space-y-3">
      {/* Balance card */}
      <Card className="relative overflow-hidden border-0 bg-gradient-to-br from-emerald-500 via-green-500 to-emerald-600 p-6 text-white shadow-elegant">
        <div className="absolute -right-6 -top-6 h-28 w-28 rounded-full bg-white/10 blur-2xl" />
        <div className="absolute -bottom-8 -left-8 h-32 w-32 rounded-full bg-white/5 blur-3xl" />
        <div className="relative flex items-center justify-between gap-4">
          <div>
            <div className="mb-2 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1 text-xs font-medium backdrop-blur">
              <Sparkles className="h-3.5 w-3.5" />
              نقاط الولاء
            </div>
            <div className="text-4xl font-extrabold leading-none">
              {balance.toLocaleString("ar-MA")}
            </div>
            <div className="mt-1 text-sm text-white/85">نقطة متراكمة</div>
          </div>
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/15 backdrop-blur">
            <Gift className="h-8 w-8" />
          </div>
        </div>
      </Card>

      {/* History */}
      <Card className="p-4">
        <h3 className="mb-3 text-sm font-bold">سجل النقاط</h3>
        {transactions.length === 0 ? (
          <div className="rounded-xl bg-muted/40 px-4 py-6 text-center text-sm text-muted-foreground">
            أكمل طلبك الأول لتبدأ في جمع النقاط 🎁
          </div>
        ) : (
          <ul className="divide-y">
            {transactions.map((t) => {
              const isPositive = t.points > 0;
              const orderNumber = t.order_id ? orderMap.get(t.order_id) : null;
              const date = new Date(t.created_at).toLocaleDateString("ar-MA", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
              });
              return (
                <li
                  key={t.id}
                  className="flex items-center justify-between py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="font-medium">
                      {orderNumber ? `طلب #${orderNumber}` : t.description ?? "حركة"}
                    </div>
                    <div className="text-xs text-muted-foreground">{date}</div>
                  </div>
                  <div
                    className={
                      "shrink-0 rounded-full px-3 py-1 text-xs font-bold " +
                      (isPositive
                        ? "bg-emerald-500/15 text-emerald-700"
                        : "bg-destructive/15 text-destructive")
                    }
                  >
                    {isPositive ? "+" : ""}
                    {t.points} نقطة
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </section>
  );
}

// Keeps Loader2 import used in case of future inline-loading states
void Loader2;
