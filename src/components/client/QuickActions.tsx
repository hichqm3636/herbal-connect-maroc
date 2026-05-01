import { Link, useNavigate } from "@tanstack/react-router";
import { ClipboardList, RotateCcw, Truck, Loader2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { toast } from "sonner";
import { trackClient } from "@/lib/clientAnalytics";
import { setOrderSource } from "@/lib/orderAttribution";
import { useState } from "react";

export interface ReorderableItem {
  product: CartProduct;
  qty: number;
}

interface Props {
  /** Items from the user's most recent order — used by "إعادة آخر طلب". */
  lastOrderItems: ReorderableItem[];
  /** ID of an in-flight order (pending/confirmed/processing/shipped), if any. */
  trackableOrderId: string | null;
}

export function QuickActions({ lastOrderItems, trackableOrderId }: Props) {
  const navigate = useNavigate();
  const { tryAdd, addItem, vendorId, clear } = useCart();
  const [reordering, setReordering] = useState(false);

  const canReorder = lastOrderItems.length > 0;

  const handleReorderLast = () => {
    if (!canReorder || reordering) return;
    setReordering(true);
    trackClient("quick_action_click", { action: "reorder_last_order" });
    setOrderSource("reorder");

    const incomingVendorId = lastOrderItems[0]?.product.vendor_id;
    // Single-vendor invariant: if the cart already has another vendor, replace.
    if (vendorId && incomingVendorId && vendorId !== incomingVendorId) {
      clear();
    }
    for (const { product, qty } of lastOrderItems) {
      addItem(product, qty);
    }
    toast.success("تمت إضافة منتجات آخر طلب إلى السلة");
    setTimeout(() => {
      setReordering(false);
      navigate({ to: "/checkout" });
    }, 150);
    // Keep tryAdd referenced to satisfy lint without changing behavior.
    void tryAdd;
  };

  return (
    <section dir="rtl">
      <div className="grid grid-cols-3 gap-2 sm:gap-3">
        <Link
          to="/client/orders"
          onClick={() =>
            trackClient("quick_action_click", { action: "my_orders" })
          }
          className="block"
        >
          <Card className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center transition-all hover:border-primary/40 hover:shadow-md sm:p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <ClipboardList className="h-5 w-5" />
            </div>
            <span className="text-xs font-semibold leading-tight sm:text-sm">
              طلباتي
            </span>
          </Card>
        </Link>

        <button
          type="button"
          onClick={handleReorderLast}
          disabled={!canReorder || reordering}
          className="block text-right disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Card className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center transition-all hover:border-primary/40 hover:shadow-md sm:p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-600">
              {reordering ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <RotateCcw className="h-5 w-5" />
              )}
            </div>
            <span className="text-xs font-semibold leading-tight sm:text-sm">
              إعادة آخر طلب
            </span>
          </Card>
        </button>

        {trackableOrderId ? (
          <Link
            to="/client/orders"
            search={{ focus: trackableOrderId }}
            onClick={() =>
              trackClient("quick_action_click", { action: "track_order" })
            }
            className="block"
          >
            <Card className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center transition-all hover:border-primary/40 hover:shadow-md sm:p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-500/10 text-blue-600">
                <Truck className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold leading-tight sm:text-sm">
                متابعة الطلب
              </span>
            </Card>
          </Link>
        ) : (
          <div className="block opacity-50">
            <Card className="flex h-full flex-col items-center justify-center gap-2 p-3 text-center sm:p-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
                <Truck className="h-5 w-5" />
              </div>
              <span className="text-xs font-semibold leading-tight text-muted-foreground sm:text-sm">
                لا يوجد طلب جارٍ
              </span>
            </Card>
          </div>
        )}
      </div>
    </section>
  );
}
