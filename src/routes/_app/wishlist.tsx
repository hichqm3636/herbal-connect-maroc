import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Heart, Loader2, Package, ShoppingCart, Trash2, Store } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { formatMAD } from "@/lib/format";
import { parseTiers } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/wishlist")({
  component: WishlistPage,
  head: () => ({ meta: [{ title: "المفضلة — Nexora" }] }),
});

interface WishRow {
  id: string;
  product_id: string;
  company_id: string;
  created_at: string;
  products: {
    id: string;
    name_ar: string;
    image_url: string | null;
    price_mad: number;
    rrp_price: number | null;
    pharmacy_price: number | null;
    map_price: number | null;
    stock: number | null;
    minimum_order: number;
    pack_size: number;
    price_tiers: unknown;
    active: boolean;
    category: string | null;
  } | null;
  companies: {
    id: string;
    name: string;
    display_name: string | null;
    slug: string;
    logo_url: string | null;
    brand_color: string;
  } | null;
}

function WishlistPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();
  const [items, setItems] = useState<WishRow[] | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("wishlists")
      .select(
        `id, product_id, company_id, created_at,
         products:product_id ( id, name_ar, image_url, price_mad, rrp_price, pharmacy_price, map_price, stock, minimum_order, pack_size, price_tiers, active, category ),
         companies:company_id ( id, name, display_name, slug, logo_url, brand_color )`,
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });
    if (error) toast.error("تعذّر تحميل المفضلة");
    setItems((data ?? []) as unknown as WishRow[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const remove = async (id: string) => {
    const { error } = await supabase.from("wishlists").delete().eq("id", id);
    if (error) {
      toast.error("تعذّر الحذف");
      return;
    }
    setItems((prev) => (prev ? prev.filter((i) => i.id !== id) : prev));
    toast.success("تمت الإزالة");
  };

  const addToCart = (it: WishRow) => {
    if (!it.products || !it.companies) return;
    const p = it.products;
    const c = it.companies;
    const display = p.rrp_price ?? p.pharmacy_price ?? p.price_mad;
    const cp: CartProduct = {
      id: p.id,
      name_ar: p.name_ar,
      price_mad: display,
      image_url: p.image_url,
      stock: p.stock,
      rrp_price: p.rrp_price,
      pharmacy_price: p.pharmacy_price,
      map_price: p.map_price,
      minimum_order: p.minimum_order,
      pack_size: p.pack_size,
      price_tiers: parseTiers(p.price_tiers),
      vendor_id: c.id,
      vendor_slug: c.slug,
      vendor_name: c.display_name || c.name,
    };
    const result = cart.tryAdd(cp, p.minimum_order || 1);
    if (result.kind === "added") toast.success("تمت الإضافة إلى السلة");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Heart className="h-6 w-6 text-red-500 fill-red-500" />
            المفضلة
          </h1>
          <p className="text-sm text-muted-foreground">
            المنتجات التي حفظتها لشرائها لاحقاً.
          </p>
        </div>
        {items && items.length > 0 && (
          <Badge variant="secondary" className="text-xs">
            {items.length} منتج
          </Badge>
        )}
      </header>

      {!items || items.length === 0 ? (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
            <Heart className="h-7 w-7 text-muted-foreground" />
          </div>
          <div>
            <p className="font-semibold">قائمة المفضلة فارغة</p>
            <p className="mt-1 text-sm text-muted-foreground">
              تصفّح المنتجات وأضف ما يعجبك بنقرة على أيقونة القلب.
            </p>
          </div>
          <Button asChild>
            <Link to="/vendors">
              <Store className="h-4 w-4" />
              تصفّح البائعين
            </Link>
          </Button>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((it) => {
            const p = it.products;
            const c = it.companies;
            if (!p || !c) {
              return (
                <Card key={it.id} className="p-4 text-sm text-muted-foreground">
                  المنتج لم يعد متاحاً.
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => remove(it.id)}
                    className="mt-2 text-destructive"
                  >
                    إزالة
                  </Button>
                </Card>
              );
            }
            const display = p.rrp_price ?? p.pharmacy_price ?? p.price_mad;
            const out = p.stock === 0 || !p.active;
            return (
              <Card key={it.id} className="overflow-hidden">
                <button
                  type="button"
                  onClick={() => navigate({ to: "/store/$slug", params: { slug: c.slug } })}
                  className="block aspect-square w-full bg-muted text-left"
                >
                  {p.image_url ? (
                    <img
                      src={p.image_url}
                      alt={p.name_ar}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center">
                      <Package className="h-10 w-10 text-muted-foreground" />
                    </div>
                  )}
                </button>
                <div className="space-y-2 p-3">
                  <p className="line-clamp-2 text-sm font-semibold">{p.name_ar}</p>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <Store className="h-3 w-3" />
                    <Link
                      to="/store/$slug"
                      params={{ slug: c.slug }}
                      className="truncate hover:text-foreground hover:underline"
                    >
                      {c.display_name || c.name}
                    </Link>
                  </div>
                  <p className="text-base font-bold">{formatMAD(display)}</p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="flex-1 gap-1"
                      disabled={out}
                      onClick={() => addToCart(it)}
                    >
                      <ShoppingCart className="h-3.5 w-3.5" />
                      {out ? "غير متوفر" : "أضف للسلة"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => remove(it.id)}
                      aria-label="إزالة"
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
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
