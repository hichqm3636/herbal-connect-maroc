import { Link } from "@tanstack/react-router";
import { Package, ShoppingBag, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  formatMAD,
  formatDateTimeAr,
  STATUS_LABELS,
  STATUS_CLASSES,
} from "@/lib/format";
import { cn } from "@/lib/utils";

export interface PreviewOrder {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  created_at: string;
  vendor_name: string;
  vendor_logo: string | null;
}

interface Props {
  orders: PreviewOrder[];
}

export function OrdersPreview({ orders }: Props) {
  return (
    <Card className="overflow-hidden" dir="rtl">
      <div className="flex items-center justify-between border-b p-4">
        <h2 className="flex items-center gap-2 text-sm font-bold">
          <ShoppingBag className="h-4 w-4 text-primary" />
          آخر الطلبات
        </h2>
        {orders.length > 0 && (
          <Button asChild variant="ghost" size="sm">
            <Link to="/client/orders">عرض الكل</Link>
          </Button>
        )}
      </div>
      {orders.length === 0 ? (
        <div className="flex flex-col items-center gap-3 p-8 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-muted">
            <Package className="h-6 w-6 text-muted-foreground" />
          </div>
          <p className="text-sm font-medium">لا توجد طلبات بعد</p>
          <Button asChild size="sm">
            <Link to="/vendors">
              <Store className="h-4 w-4" />
              ابدأ أول طلب لك
            </Link>
          </Button>
        </div>
      ) : (
        <ul className="divide-y">
          {orders.map((o) => {
            const statusLabel = STATUS_LABELS[o.status] ?? o.status;
            const statusClass = STATUS_CLASSES[o.status] ?? "";
            return (
              <li key={o.id}>
                <Link
                  to="/client/orders"
                  search={{ focus: o.id }}
                  className="flex items-center gap-3 p-4 transition-colors hover:bg-muted/40"
                >
                  {o.vendor_logo ? (
                    <img
                      src={o.vendor_logo}
                      alt={o.vendor_name}
                      className="h-10 w-10 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Store className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold">
                      {o.vendor_name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      <span dir="ltr" className="font-mono">
                        #{o.order_number}
                      </span>
                      {" · "}
                      {formatDateTimeAr(o.created_at)}
                    </p>
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge
                      variant="outline"
                      className={cn("text-[10px] font-medium", statusClass)}
                    >
                      {statusLabel}
                    </Badge>
                    <span className="text-sm font-bold">
                      {formatMAD(o.total_mad)}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}
