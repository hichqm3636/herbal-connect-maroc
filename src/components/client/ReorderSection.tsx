import { RotateCcw, Package, TrendingUp } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { trackClient } from "@/lib/clientAnalytics";
import { setOrderSource } from "@/lib/orderAttribution";
import { formatMAD } from "@/lib/format";
import { parseTiers, type PriceTier } from "@/lib/pricing";

export interface ReorderProduct extends CartProduct {
  last_qty: number;
}

interface Props {
  products: ReorderProduct[];
}

/**
 * For a wholesale tier list, return the next tier above current qty (if any)
 * along with the savings per unit when reaching it.
 */
function nextTierSuggestion(tiers: PriceTier[], qty: number, basePrice: number) {
  if (tiers.length === 0) return null;
  const sorted = [...tiers].sort((a, b) => a.min_quantity - b.min_quantity);
  const next = sorted.find((t) => t.min_quantity > qty);
  if (!next) return null;
  const savePerUnit = Math.max(0, basePrice - next.unit_price_mad);
  if (savePerUnit <= 0) return null;
  return { qty: next.min_quantity, unitPrice: next.unit_price_mad, savePerUnit };
}

export function ReorderSection({ products }: Props) {
  const { addItem, vendorId, clear } = useCart();
  const navigate = useNavigate();

  if (products.length === 0) return null;

  const handleReorder = (p: ReorderProduct, qty: number) => {
    trackClient("reorder_click", {
      product_id: p.id,
      vendor_id: p.vendor_id,
      qty,
    });
    setOrderSource("reorder");
    if (vendorId && vendorId !== p.vendor_id) {
      clear();
    }
    addItem(p, qty);
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
        {products.map((p) => {
          const tiers = parseTiers(p.price_tiers);
          const suggestion = nextTierSuggestion(tiers, p.last_qty, p.price_mad);
          return (
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

              {suggestion && (
                <div className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[10px] leading-tight text-emerald-700 dark:text-emerald-300">
                  <TrendingUp className="mt-0.5 h-3 w-3 shrink-0" />
                  <span>
                    اشترِ <b>{suggestion.qty}</b> ووفّر{" "}
                    <b>{formatMAD(suggestion.savePerUnit)}</b> للوحدة
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-px border-t bg-border">
                <Button
                  size="sm"
                  variant="secondary"
                  className="rounded-none"
                  onClick={() => handleReorder(p, p.last_qty)}
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  ×{p.last_qty}
                </Button>
                {suggestion ? (
                  <Button
                    size="sm"
                    className="rounded-none bg-emerald-600 text-white hover:bg-emerald-700"
                    onClick={() => handleReorder(p, suggestion.qty)}
                  >
                    جملة ×{suggestion.qty}
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant="outline"
                    className="rounded-none"
                    onClick={() => handleReorder(p, p.last_qty * 2)}
                  >
                    ×{p.last_qty * 2}
                  </Button>
                )}
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

