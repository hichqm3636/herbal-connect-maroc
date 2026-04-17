import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Minus, Loader2, PackageX, ShoppingCart } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/products/$productId")({
  component: ProductDetail,
  head: () => ({ meta: [{ title: "تفاصيل المنتج — بوابة هيرباليفي" }] }),
});

interface Product {
  id: string;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  image_url: string | null;
  category: string | null;
  stock: number;
  active: boolean;
}

interface ProductImage {
  id: string;
  url: string;
  position: number;
  is_primary: boolean;
}

function ProductDetail() {
  const { productId } = Route.useParams();
  const { addItem, totalQty } = useCart();
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [qty, setQty] = useState(1);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [{ data: p }, { data: imgs }] = await Promise.all([
        supabase.from("products").select("*").eq("id", productId).maybeSingle(),
        supabase
          .from("product_images")
          .select("id, url, position, is_primary")
          .eq("product_id", productId)
          .order("is_primary", { ascending: false })
          .order("position", { ascending: true }),
      ]);
      setProduct(p as Product | null);
      setImages((imgs as ProductImage[] | null) ?? []);
      setActiveIdx(0);
      setQty(1);
      setLoading(false);
    })();
  }, [productId]);

  const handleAdd = () => {
    if (!product) return;
    addItem(
      {
        id: product.id,
        name_ar: product.name_ar,
        price_mad: product.price_mad,
        image_url: product.image_url,
        stock: product.stock,
      },
      qty,
    );
    toast.success(`تمت إضافة ${qty} ${qty === 1 ? "منتج" : "منتجات"} إلى السلة`);
    setQty(1);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!product) {
    return (
      <Card className="p-12 text-center text-muted-foreground">
        <PackageX className="h-10 w-10 mx-auto mb-3 opacity-50" />
        <p className="mb-4">لم يتم العثور على المنتج</p>
        <Button asChild variant="outline">
          <Link to="/products">العودة إلى الكتالوج</Link>
        </Button>
      </Card>
    );
  }

  const fallbackUrl = product.image_url ?? "";
  const gallery: { id: string; url: string }[] =
    images.length > 0
      ? images.map((i) => ({ id: i.id, url: i.url }))
      : fallbackUrl
        ? [{ id: "fallback", url: fallbackUrl }]
        : [];
  const mainUrl = gallery[activeIdx]?.url ?? "";
  const maxQty = product.stock > 0 ? product.stock : 1;
  const outOfStock = product.stock === 0 || !product.active;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-2">
        <Button asChild variant="ghost" size="sm" className="gap-2 -ms-2">
          <Link to="/products">
            <ArrowRight className="h-4 w-4" />
            العودة إلى الكتالوج
          </Link>
        </Button>
        {totalQty > 0 && (
          <Button asChild variant="outline" size="sm" className="gap-2">
            <Link to="/products">
              <ShoppingCart className="h-4 w-4" />
              السلة ({totalQty})
            </Link>
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="space-y-3">
          <Card className="overflow-hidden bg-muted">
            {mainUrl ? (
              <img
                src={mainUrl}
                alt={product.name_ar}
                className="w-full aspect-square object-cover"
              />
            ) : (
              <div className="w-full aspect-square flex items-center justify-center text-muted-foreground">
                لا توجد صورة
              </div>
            )}
          </Card>

          {gallery.length > 1 && (
            <div className="grid grid-cols-5 gap-2">
              {gallery.map((img, idx) => (
                <button
                  key={img.id}
                  type="button"
                  onClick={() => setActiveIdx(idx)}
                  className={`overflow-hidden rounded-md border-2 transition-all bg-muted ${
                    idx === activeIdx
                      ? "border-primary ring-2 ring-primary/20"
                      : "border-transparent hover:border-border"
                  }`}
                  aria-label={`عرض الصورة ${idx + 1}`}
                  aria-current={idx === activeIdx}
                >
                  <img
                    src={img.url}
                    alt=""
                    loading="lazy"
                    className="w-full aspect-square object-cover"
                  />
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            {product.category && (
              <Badge variant="secondary" className="w-fit">
                {product.category}
              </Badge>
            )}
            <h1 className="text-2xl md:text-3xl font-bold tracking-tight">
              {product.name_ar}
            </h1>
            <div className="flex items-baseline gap-3">
              <span className="text-3xl font-bold text-primary">
                {formatMAD(product.price_mad)}
              </span>
              <span className="text-sm text-muted-foreground">
                المخزون: {product.stock}
              </span>
            </div>
          </div>

          <Card className="p-4 shadow-soft">
            <h2 className="font-semibold mb-2">الوصف</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
              {product.description_ar || "لا يوجد وصف لهذا المنتج."}
            </p>
          </Card>

          {!outOfStock && (
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">الكمية:</span>
              <div className="flex items-center gap-1 border rounded-md">
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setQty((q) => Math.max(1, q - 1))}
                  disabled={qty <= 1}
                  aria-label="إنقاص الكمية"
                >
                  <Minus className="h-4 w-4" />
                </Button>
                <input
                  type="number"
                  min={1}
                  max={maxQty}
                  value={qty}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isFinite(n)) setQty(Math.min(maxQty, Math.max(1, Math.floor(n))));
                  }}
                  className="w-12 text-center bg-transparent outline-none font-medium tabular-nums"
                  aria-label="الكمية"
                />
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  className="h-9 w-9"
                  onClick={() => setQty((q) => Math.min(maxQty, q + 1))}
                  disabled={qty >= maxQty}
                  aria-label="زيادة الكمية"
                >
                  <Plus className="h-4 w-4" />
                </Button>
              </div>
              <span className="text-xs text-muted-foreground">
                الإجمالي: {formatMAD(product.price_mad * qty)}
              </span>
            </div>
          )}

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleAdd}
            disabled={outOfStock}
          >
            <Plus className="h-4 w-4" />
            {outOfStock ? "غير متوفر" : "إضافة إلى السلة"}
          </Button>
        </div>
      </div>
    </div>
  );
}
