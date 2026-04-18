import { useEffect, useState } from "react";
import { Repeat2, Loader2, PackageOpen } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useRepeatOrder } from "@/hooks/useRepeatOrder";
import { formatMAD, formatDateAr } from "@/lib/format";

interface LastOrder {
  id: string;
  order_number: string;
  total_mad: number;
  created_at: string;
  item_count: number;
}

export function RepeatLastOrderCard() {
  const { user } = useAuth();
  const { repeat, loading: repeating } = useRepeatOrder();
  const [order, setOrder] = useState<LastOrder | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("orders")
        .select("id, order_number, total_mad, created_at, order_items(id)")
        .eq("distributor_id", user.id)
        .neq("status", "cancelled")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (data) {
        setOrder({
          id: data.id,
          order_number: data.order_number,
          total_mad: Number(data.total_mad),
          created_at: data.created_at,
          item_count: (data.order_items as { id: string }[] | null)?.length ?? 0,
        });
      } else {
        setOrder(null);
      }
      setLoading(false);
    })();
  }, [user]);

  if (loading) {
    return (
      <Card className="p-5 shadow-soft flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </Card>
    );
  }

  if (!order) {
    return (
      <Card className="p-5 shadow-soft text-center text-sm text-muted-foreground">
        <PackageOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
        لا توجد طلبات سابقة لإعادتها بعد
      </Card>
    );
  }

  return (
    <Card className="p-5 shadow-soft">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center gap-2">
            <Repeat2 className="h-4 w-4 text-primary" />
            <h2 className="text-base font-bold">إعادة آخر طلب</h2>
          </div>
          <p className="text-xs text-muted-foreground">
            {order.order_number} · {formatDateAr(order.created_at)}
          </p>
          <p className="text-sm">
            <span className="font-medium">{order.item_count}</span> منتج ·{" "}
            <span className="font-semibold">{formatMAD(order.total_mad)}</span>
          </p>
        </div>
        <Button
          onClick={() => repeat(order.id, { replaceCart: true })}
          disabled={repeating}
          size="lg"
          className="w-full sm:w-auto"
        >
          {repeating ? (
            <Loader2 className="ml-2 h-4 w-4 animate-spin" />
          ) : (
            <Repeat2 className="ml-2 h-4 w-4" />
          )}
          إعادة الطلب
        </Button>
      </div>
    </Card>
  );
}
