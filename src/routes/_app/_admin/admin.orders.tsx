import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD, formatDateTimeAr, STATUS_LABELS, STATUS_VARIANTS } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/orders")({
  component: AdminOrders,
  head: () => ({ meta: [{ title: "إدارة الطلبات — هيرباليفي" }] }),
});

interface OrderRow {
  id: string;
  status: string;
  total_mad: number;
  points_earned: number;
  created_at: string;
  distributor_id: string;
  notes: string | null;
  profiles: { full_name: string; city: string | null } | null;
}

const STATUSES = ["pending", "confirmed", "shipped", "delivered", "cancelled"];

function AdminOrders() {
  const [orders, setOrders] = useState<OrderRow[]>([]);

  const load = async () => {
    const { data } = await supabase
      .from("orders")
      .select("id, status, total_mad, points_earned, created_at, distributor_id, notes, profiles(full_name, city)")
      .order("created_at", { ascending: false });
    setOrders((data as unknown as OrderRow[]) ?? []);
  };

  useEffect(() => {
    load();
  }, []);

  const updateStatus = async (id: string, status: string) => {
    const { error } = await supabase
      .from("orders")
      .update({ status: status as "pending" | "confirmed" | "shipped" | "delivered" | "cancelled" })
      .eq("id", id);
    if (error) {
      toast.error("تعذر التحديث");
      return;
    }
    toast.success("تم تحديث حالة الطلب");
    load();
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight">إدارة الطلبات</h1>
        <p className="text-sm text-muted-foreground mt-1">{orders.length} طلب</p>
      </div>

      <div className="grid gap-3">
        {orders.map((o) => (
          <Card key={o.id} className="p-4 shadow-soft">
            <div className="flex flex-col md:flex-row md:items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <p className="font-semibold">طلب #{o.id.slice(0, 8)}</p>
                  <Badge variant={STATUS_VARIANTS[o.status]}>{STATUS_LABELS[o.status]}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {o.profiles?.full_name || "—"} • {o.profiles?.city || "—"} • {formatDateTimeAr(o.created_at)}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-left">
                  <p className="font-bold">{formatMAD(o.total_mad)}</p>
                  <p className="text-xs text-warning">+{o.points_earned} نقطة</p>
                </div>
                <Select value={o.status} onValueChange={(v) => updateStatus(o.id, v)}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {STATUS_LABELS[s]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
}
