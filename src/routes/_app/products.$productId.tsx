import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowRight, Plus, Loader2, PackageX } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
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
  const navigate = useNavigate();
  const [product, setProduct] = useState<Product | null>(null);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
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
      setLoading(false);
    })();
  }, [productId]);

  const addToCartAndGo = () => {
    toast.success("تمت إضافة المنتج إلى السلة");
    navigate({ to: "/products" });
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

  return (
    <div className="space-y-6">
      <Button asChild variant="ghost" size="sm" className="gap-2 -ms-2">
        <Link to="/products">
          <ArrowRight className="h-4 w-4" />
          العودة إلى الكتالوج
        </Link>
      </Button>

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

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={addToCartAndGo}
            disabled={product.stock === 0 || !product.active}
          >
            <Plus className="h-4 w-4" />
            {product.stock === 0 ? "غير متوفر" : "إضافة إلى السلة"}
          </Button>
        </div>
      </div>
    </div>
  );
}
