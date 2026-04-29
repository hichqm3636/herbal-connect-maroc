import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2, Search, Eye, Package, Clock, CheckCircle2, Truck, XCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type OrderStatus = Database["public"]["Enums"]["order_status"];

export const Route = createFileRoute("/_app/_vendor/vendor/orders")({
  component: VendorOrdersPage,
  head: () => ({ meta: [{ title: "الطلبات — Nexora" }] }),
});

interface OrderRow {
  id: string;
  order_number: string;
  status: OrderStatus;
  total_mad: number;
  created_at: string;
  buyer_id: string;
  notes: string | null;
  admin_notes: string | null;
  payment_method: string | null;
  buyer_name: string;
  buyer_phone: string | null;
}

interface OrderItemRow {
  id: string;
  product_id: string;
  quantity: number;
  unit_price_mad: number;
  product_name: string;
}

const STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  processing: "قيد المعالجة",
  preparing: "قيد التحضير",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

const STATUS_TONE: Record<OrderStatus, string> = {
  pending: "bg-warning/15 text-warning-foreground",
  confirmed: "bg-primary/15 text-primary",
  processing: "bg-primary/15 text-primary",
  preparing: "bg-primary/15 text-primary",
  shipped: "bg-blue-500/15 text-blue-700 dark:text-blue-300",
  delivered: "bg-success/15 text-success",
  cancelled: "bg-destructive/15 text-destructive",
};

// Allowed forward transitions per current status.
const NEXT_STATUS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["shipped", "cancelled"],
  processing: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

function VendorOrdersPage() {
  const { companyId } = useAuth();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<OrderStatus | "all">("all");
  const [selected, setSelected] = useState<OrderRow | null>(null);
  const [items, setItems] = useState<OrderItemRow[]>([]);
  const [itemsLoading, setItemsLoading] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);

  const loadOrders = async () => {
    if (!companyId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("orders")
      .select("id, order_number, status, total_mad, created_at, buyer_id, notes, admin_notes, payment_method")
      .eq("company_id", companyId)
      .order("created_at", { ascending: false });

    if (error) {
      toast.error("تعذر تحميل الطلبات");
      setLoading(false);
      return;
    }

    const buyerIds = Array.from(new Set((data ?? []).map((o) => o.distributor_id)));
    const { data: profiles } = buyerIds.length
      ? await supabase.from("profiles").select("id, full_name, phone").in("id", buyerIds)
      : { data: [] as { id: string; full_name: string; phone: string | null }[] };
    const map = new Map((profiles ?? []).map((p) => [p.id, p]));

    setOrders(
      (data ?? []).map((o) => ({
        ...o,
        total_mad: Number(o.total_mad),
        buyer_name: map.get(o.distributor_id)?.full_name || "عميل",
        buyer_phone: map.get(o.distributor_id)?.phone ?? null,
      })),
    );
    setLoading(false);
  };

  useEffect(() => {
    loadOrders();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return orders.filter((o) => {
      if (statusFilter !== "all" && o.status !== statusFilter) return false;
      if (!q) return true;
      return (
        o.order_number.toLowerCase().includes(q) ||
        o.buyer_name.toLowerCase().includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  const openDetail = async (order: OrderRow) => {
    setSelected(order);
    setItemsLoading(true);
    const { data } = await supabase
      .from("order_items")
      .select("id, product_id, quantity, unit_price_mad, products(name_ar)")
      .eq("order_id", order.id);
    type Row = {
      id: string; product_id: string; quantity: number; unit_price_mad: number;
      products: { name_ar: string } | { name_ar: string }[] | null;
    };
    setItems(
      ((data ?? []) as Row[]).map((it) => {
        const prod = Array.isArray(it.products) ? it.products[0] : it.products;
        return {
          id: it.id,
          product_id: it.product_id,
          quantity: it.quantity,
          unit_price_mad: Number(it.unit_price_mad),
          product_name: prod?.name_ar ?? "—",
        };
      }),
    );
    setItemsLoading(false);
  };

  const updateStatus = async (next: OrderStatus) => {
    if (!selected) return;
    setSavingStatus(true);
    const { error } = await supabase
      .from("orders")
      .update({ status: next })
      .eq("id", selected.id);
    setSavingStatus(false);
    if (error) {
      toast.error("تعذر تحديث الحالة");
      return;
    }
    toast.success(`تم تحديث الحالة إلى: ${STATUS_LABELS[next]}`);
    setSelected({ ...selected, status: next });
    setOrders((prev) => prev.map((o) => (o.id === selected.id ? { ...o, status: next } : o)));
  };

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="text-2xl font-bold">الطلبات الواردة</h1>
        <p className="text-sm text-muted-foreground mt-1">
          {orders.length} طلب · {filtered.length} معروض
        </p>
      </header>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="بحث برقم الطلب أو اسم العميل..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9"
          />
        </div>
        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as OrderStatus | "all")}>
          <SelectTrigger className="sm:w-56">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">كل الحالات</SelectItem>
            {(Object.keys(STATUS_LABELS) as OrderStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Table */}
      <Card className="overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="py-16 text-center text-sm text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-40" />
            لا توجد طلبات مطابقة
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 text-muted-foreground text-xs">
                <tr className="text-right">
                  <th className="px-4 py-3 font-medium">رقم الطلب</th>
                  <th className="px-4 py-3 font-medium">العميل</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                  <th className="px-4 py-3 font-medium">المجموع</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">إجراء</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map((o) => (
                  <tr key={o.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3 font-mono font-semibold">{o.order_number}</td>
                    <td className="px-4 py-3">{o.buyer_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(o.created_at).toLocaleDateString("ar")}
                    </td>
                    <td className="px-4 py-3 font-bold">{formatMAD(o.total_mad)}</td>
                    <td className="px-4 py-3">
                      <Badge variant="secondary" className={STATUS_TONE[o.status]}>
                        {STATUS_LABELS[o.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Button size="sm" variant="ghost" onClick={() => openDetail(o)}>
                        <Eye className="h-4 w-4" />
                        عرض
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" dir="rtl">
          {selected && (
            <>
              <DialogHeader>
                <DialogTitle className="font-mono">{selected.order_number}</DialogTitle>
                <DialogDescription>
                  {new Date(selected.created_at).toLocaleString("ar")}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <span className="text-muted-foreground">العميل:</span>
                    <p className="font-medium">{selected.buyer_name}</p>
                  </div>
                  {selected.buyer_phone && (
                    <div>
                      <span className="text-muted-foreground">الهاتف:</span>
                      <p className="font-medium" dir="ltr">{selected.buyer_phone}</p>
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground">الحالة:</span>
                    <p>
                      <Badge variant="secondary" className={STATUS_TONE[selected.status]}>
                        {STATUS_LABELS[selected.status]}
                      </Badge>
                    </p>
                  </div>
                  <div>
                    <span className="text-muted-foreground">المجموع:</span>
                    <p className="font-bold text-base">{formatMAD(selected.total_mad)}</p>
                  </div>
                </div>

                {selected.notes && (
                  <div className="rounded-md bg-muted/50 p-3 text-sm">
                    <p className="text-xs text-muted-foreground mb-1">ملاحظات العميل:</p>
                    <p className="whitespace-pre-wrap">{selected.notes}</p>
                  </div>
                )}

                <Separator />

                <div>
                  <h3 className="text-sm font-bold mb-3">المنتجات</h3>
                  {itemsLoading ? (
                    <div className="py-6 text-center">
                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mx-auto" />
                    </div>
                  ) : (
                    <ul className="divide-y border rounded-md">
                      {items.map((it) => (
                        <li key={it.id} className="px-3 py-2 flex items-center justify-between text-sm">
                          <div className="min-w-0 flex-1">
                            <p className="font-medium truncate">{it.product_name}</p>
                            <p className="text-xs text-muted-foreground">
                              {it.quantity} × {formatMAD(it.unit_price_mad)}
                            </p>
                          </div>
                          <div className="font-semibold whitespace-nowrap">
                            {formatMAD(it.quantity * it.unit_price_mad)}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <Separator />

                {/* Status transitions */}
                {NEXT_STATUS[selected.status].length > 0 ? (
                  <div>
                    <h3 className="text-sm font-bold mb-3">تحديث الحالة</h3>
                    <div className="flex flex-wrap gap-2">
                      {NEXT_STATUS[selected.status].map((next) => (
                        <Button
                          key={next}
                          size="sm"
                          variant={next === "cancelled" ? "destructive" : "default"}
                          disabled={savingStatus}
                          onClick={() => updateStatus(next)}
                        >
                          {savingStatus && <Loader2 className="h-3 w-3 animate-spin" />}
                          {next === "confirmed" && <CheckCircle2 className="h-4 w-4" />}
                          {next === "preparing" && <Package className="h-4 w-4" />}
                          {next === "shipped" && <Truck className="h-4 w-4" />}
                          {next === "delivered" && <CheckCircle2 className="h-4 w-4" />}
                          {next === "cancelled" && <XCircle className="h-4 w-4" />}
                          {STATUS_LABELS[next]}
                        </Button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <p className="text-xs text-muted-foreground text-center py-2">
                    <Clock className="h-3 w-3 inline ml-1" />
                    هذا الطلب وصل إلى نهاية دورة حياته
                  </p>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
