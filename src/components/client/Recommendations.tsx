import { Link } from "@tanstack/react-router";
import { Sparkles, Plus, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatMAD } from "@/lib/format";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { toast } from "sonner";
import { track } from "@/lib/analytics";
import { trackClient } from "@/lib/clientAnalytics";
import { setOrderSource } from "@/lib/orderAttribution";

export interface RecommendedProduct extends CartProduct {
  vendor_slug: string;
  source: "reorder" | "top_seller";
}

interface Props {
  items: RecommendedProduct[];
}

export function Recommendations({ items }: Props) {
  const { tryAdd, vendorName, openCart } = useCart();

  if (items.length === 0) return null;

  const handleAdd = (p: RecommendedProduct) => {
    trackClient("recommendation_click", {
      product_id: p.id,
      vendor_id: p.vendor_id,
      source: p.source,
    });
    setOrderSource("recommendation");
    track("add_to_cart", {
      product_id: p.id,
      vendor_id: p.vendor_id,
      price: p.price_mad,
    });
    const result = tryAdd(p, p.minimum_order ?? 1);
    if (result.kind === "added") {
      toast.success("تمت الإضافة إلى السلة");
      openCart();
    } else {
      toast.error(
        `سلتك تحتوي على منتجات من ${vendorName ?? "بائع آخر"}. أفرغها أولاً.`,
      );
    }
  };

  return (
    <section dir="rtl" className="space-y-3">
      <div className="flex items-center justify-between px-1">
        <h2 className="flex items-center gap-2 text-base font-bold">
          <Sparkles className="h-4 w-4 text-primary" />
          مقترح لك
        </h2>
      </div>
      <div className="-mx-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="flex gap-3">
          {items.map((p) => (
            <Card
              key={p.id}
              className="flex w-44 shrink-0 flex-col overflow-hidden transition-all hover:shadow-md"
            >
              <Link
                to="/store/$slug/product/$id"
                params={{ slug: p.vendor_slug, id: p.id }}
                className="block"
              >
                <div className="aspect-square w-full overflow-hidden bg-muted">
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name_ar}
                      loading="lazy"
                      className="h-full w-full object-cover transition-transform hover:scale-105"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-muted-foreground">
                      <Package className="h-8 w-8" />
                    </div>
                  )}
                </div>
              </Link>
              <div className="flex flex-1 flex-col gap-2 p-3">
                <Link
                  to="/store/$slug/product/$id"
                  params={{ slug: p.vendor_slug, id: p.id }}
                  className="line-clamp-2 min-h-[2.5rem] text-xs font-semibold hover:text-primary"
                >
                  {p.name_ar}
                </Link>
                <p className="text-sm font-bold text-primary">
                  {formatMAD(p.price_mad)}
                </p>
                <Button
                  size="sm"
                  className="mt-auto h-8 w-full text-xs"
                  onClick={() => handleAdd(p)}
                >
                  <Plus className="h-3.5 w-3.5" />
                  أضف للسلة
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </div>
    </section>
  );
}
