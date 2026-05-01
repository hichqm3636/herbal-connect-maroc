import { RotateCcw, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { trackClient } from "@/lib/clientAnalytics";
import { setOrderSource } from "@/lib/orderAttribution";
import { formatMAD } from "@/lib/format";

export interface ReorderProduct extends CartProduct {
  last_qty: number;
}

interface Props {
  products: ReorderProduct[];
}

export function ReorderSection({ products }: Props) {
  const { addItem, vendorId, clear } = useCart();
  const navigate = useNavigate();

  if (products.length === 0) return null;

  const handleReorder = (p: ReorderProduct) => {
    trackClient("reorder_click", {
      product_id: p.id,
      vendor_id: p.vendor_id,
      qty: p.last_qty,
    });
    setOrderSource("reorder");
    if (vendorId && vendorId !== p.vendor_id) {
      clear();
    }
    addItem(p, p.last_qty);
    toast.success("تمت الإضافة — انتقال للدفع");
    setTimeout(() => navigate({ to: "/checkout" }), 120);
  };

  return (
    <section dir="rtl" className="space-y-3">
      <h2 className="flex items-center gap-2 px-1 text-base font-bold">
        <RotateCcw className="h-4 w-4 text-primary" />
        أعد طلب منتجاتك المعتادة
      </h2>
      <div className="grid grid-cols-2 gap-3">
        {products.map((p) => (
          <Card key={p.id} className="overflow-hidden">
            <div className="flex gap-3 p-3">
              <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted">
                {p.image_url ? (
                  <img
                    src={p.image_url}
                    alt={p.name_ar}
                    loading="lazy"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                    <Package className="h-6 w-6" />
                  </div>
                )}
              </div>
              <div className="flex min-w-0 flex-1 flex-col">
                <p className="line-clamp-2 text-xs font-semibold leading-tight">
                  {p.name_ar}
                </p>
                <p className="mt-1 text-xs font-bold text-primary">
                  {formatMAD(p.price_mad)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  آخر مرة: {p.last_qty}
                </p>
              </div>
            </div>
            <Button
              size="sm"
              variant="secondary"
              className="w-full rounded-none"
              onClick={() => handleReorder(p)}
            >
              <RotateCcw className="h-3.5 w-3.5" />
              إعادة الطلب
            </Button>
          </Card>
        ))}
      </div>
    </section>
  );
}
