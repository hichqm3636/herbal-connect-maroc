import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ChevronDown, ClipboardList } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD, formatDateTimeAr, STATUS_LABELS, STATUS_VARIANTS } from "@/lib/format";

export const Route = createFileRoute("/_app/orders")({
  component: OrdersPage,
  head: () => ({ meta: [{ title: "طلباتي — بوابة هيرباليفي" }] }),
});

interface OrderItem {
  id: string;
  quantity: number;
  unit_price_mad: number;
  products: { name_ar: string; image_url: string | null } | null;
}

interface Order {
  id: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  notes: string | null;
  order_items: OrderItem[];
}

function OrdersPage() {
  const { user } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("orders")
        .select("id, status, total_mad, points_earned, created_at, notes, order_items(id, quantity, unit_price_mad, products(name_ar, image_url))")
        .eq("distributor_id", user.id)
        .order("created_at", { ascending: false });
      setOrders((data as unknown as Order[]) ?? []);
    })();
  }, [user]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">طلباتي</h1>
        <p className="text-sm text-muted-foreground mt-1">سجل جميع طلباتك</p>
      </div>

      {orders.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-50" />
          لا توجد طلبات بعد
        </Card>
      ) : (
        <div className="space-y-3">
          {orders.map((o) => (
            <Card key={o.id} className="shadow-soft overflow-hidden">
              <Collapsible>
                <CollapsibleTrigger className="w-full p-4 flex items-center justify-between gap-4 hover:bg-accent/40 transition-colors">
                  <div className="flex items-center gap-3 min-w-0">
                    <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180 shrink-0" />
                    <div className="text-right min-w-0">
                      <p className="font-semibold text-sm">طلب #{o.id.slice(0, 8)}</p>
                      <p className="text-xs text-muted-foreground">{formatDateTimeAr(o.created_at)}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-left">
                      <p className="font-bold">{formatMAD(o.total_mad)}</p>
                      <p className="text-xs text-warning">+{o.points_earned} نقطة</p>
                    </div>
                    <Badge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                  </div>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <div className="border-t divide-y">
                    {o.order_items.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3">
                        <img
                          src={item.products?.image_url ?? ""}
                          alt=""
                          className="h-12 w-12 rounded-md object-cover bg-muted"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.products?.name_ar}</p>
                          <p className="text-xs text-muted-foreground">
                            {item.quantity} × {formatMAD(item.unit_price_mad)}
                          </p>
                        </div>
                        <p className="text-sm font-semibold">
                          {formatMAD(Number(item.unit_price_mad) * item.quantity)}
                        </p>
                      </div>
                    ))}
                  </div>
                </CollapsibleContent>
              </Collapsible>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
