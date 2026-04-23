import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, PackageSearch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { getUnitPrice, parseTiers, type PriceTier } from "@/lib/pricing";
import { getHiddenProductIds } from "@/lib/productZones";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
  head: () => ({ meta: [{ title: "المنتجات — DistribHub" }] }),
});

interface Product {
  id: string;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  image_url: string | null;
  category: string | null;
  /** null = available, qty unknown. */
  stock: number | null;
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  minimum_order: number;
  pack_size: number;
  price_tiers: PriceTier[];
}

function ProductsPage() {
  const { addItem } = useCart();
  const { partnerType, territoryId, isAdmin } = useAuth();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name_ar");
      const rows = (data ?? []).map((p) => ({
        ...p,
        price_tiers: parseTiers((p as { price_tiers?: unknown }).price_tiers),
      })) as Product[];
      // Admins see everything; distributors get zone-restricted products filtered out.
      const visible = isAdmin
        ? rows
        : await (async () => {
            const hidden = await getHiddenProductIds(
              rows.map((r) => r.id),
              territoryId,
            );
            return rows.filter((r) => !hidden.has(r.id));
          })();
      if (!cancelled) setProducts(visible);
    })();
    return () => {
      cancelled = true;
    };
  }, [territoryId, isAdmin]);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name_ar.includes(search) ||
          (p.category ?? "").includes(search) ||
          p.description_ar.includes(search),
      ),
    [products, search],
  );

  const addToCart = (p: Product) => {
    const pack = Math.max(1, p.pack_size || 1);
    const qty = Math.max(pack, p.minimum_order || 1);
    addItem(
      {
        id: p.id,
        name_ar: p.name_ar,
        price_mad: p.price_mad,
        image_url: p.image_url,
        stock: p.stock,
        rrp_price: p.rrp_price,
        pharmacy_price: p.pharmacy_price,
        map_price: p.map_price,
        minimum_order: p.minimum_order,
        pack_size: p.pack_size,
        price_tiers: p.price_tiers,
      },
      qty,
    );
    toast.success(
      pack > 1
        ? `تمت إضافة عبوة ${qty} وحدة إلى السلة`
        : qty === 1
          ? "تمت إضافة المنتج إلى السلة"
          : `تمت إضافة ${qty} وحدات إلى السلة`,
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">كتالوج المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">اختر المنتجات وأضفها للسلة</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="ابحث عن منتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-50" />
          لا توجد منتجات مطابقة
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => {
            // Show "starting from" wholesale price for distributors
            const startingQty = Math.max(p.minimum_order || 1, 6);
            const { unitPrice } = getUnitPrice(p, partnerType, startingQty);
            return (
              <Card
                key={p.id}
                className="overflow-hidden flex flex-col shadow-soft hover:shadow-elegant transition-shadow group"
              >
                <Link
                  to="/products/$productId"
                  params={{ productId: p.id }}
                  className="aspect-square bg-muted overflow-hidden block"
                >
                  <img
                    src={p.image_url ?? ""}
                    alt={p.name_ar}
                    loading="lazy"
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                </Link>
                <div className="p-4 flex flex-col flex-1 gap-2">
                  {p.category && (
                    <Badge variant="secondary" className="w-fit text-xs">
                      {p.category}
                    </Badge>
                  )}
                  <Link
                    to="/products/$productId"
                    params={{ productId: p.id }}
                    className="font-semibold leading-snug line-clamp-2 hover:text-primary transition-colors"
                  >
                    {p.name_ar}
                  </Link>
                  <p className="text-xs text-muted-foreground line-clamp-2 flex-1">
                    {p.description_ar}
                  </p>
                  <div className="flex items-end justify-between mt-2">
                    <div className="flex flex-col">
                      <span className="text-[10px] text-muted-foreground">يبدأ من</span>
                      <span className="text-lg font-bold text-primary leading-tight">
                        {formatMAD(unitPrice)}
                      </span>
                      {p.rrp_price != null && p.rrp_price > unitPrice && (
                        <span className="text-[10px] text-muted-foreground line-through">
                          {formatMAD(p.rrp_price)}
                        </span>
                      )}
                      {p.pack_size > 1 && (
                        <span className="text-[10px] text-muted-foreground mt-0.5">
                          حجم العبوة: {p.pack_size} وحدة
                        </span>
                      )}
                      {p.minimum_order > 1 && (
                        <Badge variant="outline" className="mt-1 w-fit text-[10px] font-medium border-warning/50 text-warning-foreground bg-warning/10">
                          الحد الأدنى: {p.minimum_order}
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" onClick={() => addToCart(p)} className="gap-1">
                      <Plus className="h-3.5 w-3.5" />
                      إضافة
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
