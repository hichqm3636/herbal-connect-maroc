import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Loader2, Lock, Package, ShoppingCart } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductReviewsSection } from "@/components/ProductReviewsSection";
import { formatMAD } from "@/lib/format";
import { parseTiers } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/store/$slug/product/$id")({
  component: ProductDetailPage,
  head: ({ params }) => ({
    meta: [
      { title: `منتج — ${params.slug}` },
      { name: "description", content: "تفاصيل المنتج والمراجعات على Nexora." },
    ],
  }),
});

interface Vendor {
  id: string;
  name: string;
  slug: string;
  display_name: string;
  logo_url: string | null;
  brand_color: string;
}

interface ProductDetail {
  id: string;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  image_url: string | null;
  category: string | null;
  stock: number | null;
  minimum_order: number;
  pack_size: number;
  price_tiers: unknown;
  company_id: string;
}

function ProductDetailPage() {
  const { slug, id } = Route.useParams();
  const { session, isClient } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [product, setProduct] = useState<ProductDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    (async () => {
      const [{ data: v }, { data: p }] = await Promise.all([
        supabase
          .from("companies")
          .select("id, name, slug, display_name, logo_url, brand_color")
          .eq("slug", slug)
          .maybeSingle(),
        supabase
          .from("products")
          .select(
            "id, name_ar, description_ar, price_mad, rrp_price, pharmacy_price, map_price, image_url, category, stock, minimum_order, pack_size, price_tiers, company_id",
          )
          .eq("id", id)
          .eq("active", true)
          .maybeSingle(),
      ]);
      if (!alive) return;
      setVendor((v as Vendor | null) ?? null);
      setProduct((p as ProductDetail | null) ?? null);
      setLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [slug, id]);

  const tryAdd = () => {
    if (!product || !vendor) return;
    const cp: CartProduct = {
      id: product.id,
      name_ar: product.name_ar,
      price_mad: product.price_mad,
      image_url: product.image_url,
      stock: product.stock,
      vendor_id: vendor.id,
      vendor_slug: vendor.slug,
      vendor_name: vendor.display_name || vendor.name,
      rrp_price: product.rrp_price,
      pharmacy_price: product.pharmacy_price,
      map_price: product.map_price,
      minimum_order: product.minimum_order,
      pack_size: product.pack_size,
      price_tiers: parseTiers(product.price_tiers),
    };
    const res = cart.tryAdd(cp, product.minimum_order || 1);
    if (res === "added") toast.success("تمت الإضافة إلى السلة");
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendor || !product) {
    return (
      <div className="mx-auto max-w-md p-8 text-center" dir="rtl">
        <Card className="p-8">
          <Package className="mx-auto h-10 w-10 text-muted-foreground" />
          <h1 className="mt-3 font-bold">المنتج غير متوفر</h1>
          <Button asChild variant="outline" className="mt-4">
            <Link to="/store/$slug" params={{ slug }}>
              العودة إلى المتجر
            </Link>
          </Button>
        </Card>
      </div>
    );
  }

  const display = product.rrp_price ?? product.pharmacy_price ?? product.price_mad;

  return (
    <div className="min-h-screen bg-background" dir="rtl">
      <header className="sticky top-0 z-30 border-b bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-2 px-4 py-3">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigate({ to: "/store/$slug", params: { slug } })}
            className="gap-1"
          >
            <ArrowRight className="h-4 w-4" />
            <span className="hidden sm:inline">المتجر</span>
          </Button>
          <h1 className="flex-1 truncate text-sm font-bold sm:text-base">
            {vendor.display_name || vendor.name}
          </h1>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        <Card className="overflow-hidden">
          <div className="aspect-square w-full bg-muted sm:aspect-[16/9]">
            {product.image_url ? (
              <img
                src={product.image_url}
                alt={product.name_ar}
                className="h-full w-full object-contain"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Package className="h-12 w-12 text-muted-foreground" />
              </div>
            )}
          </div>
          <div className="p-4">
            {product.category && (
              <Badge variant="secondary" className="mb-2 text-[10px]">
                {product.category}
              </Badge>
            )}
            <h2 className="text-xl font-bold">{product.name_ar}</h2>
            {product.description_ar && (
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                {product.description_ar}
              </p>
            )}
            <div className="mt-4 flex items-end justify-between">
              <p className="text-2xl font-extrabold">{formatMAD(display)}</p>
              {!session ? (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/login">
                    <Lock className="h-4 w-4" />
                    تسجيل الدخول
                  </Link>
                </Button>
              ) : (
                <Button
                  onClick={tryAdd}
                  disabled={product.stock === 0 || !isClient}
                  className="gap-1.5"
                  title={!isClient ? "حسابك ليس حساب عميل" : undefined}
                >
                  <ShoppingCart className="h-4 w-4" />
                  {product.stock === 0
                    ? "غير متوفر"
                    : !isClient
                      ? "للعملاء فقط"
                      : "أضف إلى السلة"}
                </Button>
              )}
            </div>
          </div>
        </Card>

        <ProductReviewsSection
          productId={product.id}
          productName={product.name_ar}
          companyId={product.company_id}
          companyName={vendor.display_name || vendor.name}
        />
      </main>
    </div>
  );
}
