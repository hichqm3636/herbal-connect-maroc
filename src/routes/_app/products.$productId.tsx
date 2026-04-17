import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Plus, Minus, Loader2, PackageX, Info } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import {
  getUnitPrice,
  parseTiers,
  validateLine,
  type PriceTier,
} from "@/lib/pricing";
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
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  minimum_order: number;
  price_tiers: PriceTier[];
}

interface ProductImage {
  id: string;
  url: string;
  position: number;
  is_primary: boolean;
}

function ProductDetail() {
  const { productId } = Route.useParams();
  const { addItem, openCart } = useCart();
  const { partnerType } = useAuth();
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
      const rawProduct = p as (Product & { price_tiers?: unknown }) | null;
      const parsed = rawProduct
        ? { ...rawProduct, price_tiers: parseTiers(rawProduct.price_tiers) }
        : null;
      setProduct(parsed);
      setImages((imgs as ProductImage[] | null) ?? []);
      setActiveIdx(0);
      setQty(Math.max(1, parsed?.minimum_order ?? 1));
      setLoading(false);
    })();
  }, [productId]);

  const pricing = useMemo(() => {
    if (!product) return null;
    return getUnitPrice(product, partnerType, qty);
  }, [product, partnerType, qty]);

  const handleAdd = () => {
    if (!product || !pricing) return;
    const validation = validateLine(
      product,
      partnerType,
      qty,
      pricing.unitPrice,
      product.name_ar,
    );
    if (!validation.ok) {
      toast.error(validation.message);
      return;
    }
    addItem(
      {
        id: product.id,
        name_ar: product.name_ar,
        price_mad: product.price_mad,
        image_url: product.image_url,
        stock: product.stock,
        rrp_price: product.rrp_price,
        pharmacy_price: product.pharmacy_price,
        map_price: product.map_price,
        minimum_order: product.minimum_order,
        price_tiers: product.price_tiers,
      },
      qty,
    );
    toast.success(`تمت إضافة ${qty} ${qty === 1 ? "منتج" : "منتجات"} إلى السلة`);
    setQty(Math.max(1, product.minimum_order));
    openCart();
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
  const minQty = Math.max(1, product.minimum_order);
  const maxQty = product.stock > 0 ? product.stock : minQty;
  const outOfStock = product.stock === 0 || !product.active;
  const showDistributorPricing =
    partnerType === "distributor" || partnerType === "master_distributor";
  const showPharmacyPricing =
    partnerType === "pharmacy" || partnerType === "parapharmacy";
  const tiers = product.price_tiers;
  const sortedTiers = [...tiers].sort((a, b) => a.min_qty - b.min_qty);

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
            <div className="flex items-baseline gap-3 flex-wrap">
              {pricing && (
                <span className="text-3xl font-bold text-primary">
                  {formatMAD(pricing.unitPrice)}
                </span>
              )}
              {product.rrp_price != null &&
                pricing &&
                product.rrp_price > pricing.unitPrice && (
                  <span className="text-sm text-muted-foreground line-through">
                    {formatMAD(product.rrp_price)}
                  </span>
                )}
              <span className="text-sm text-muted-foreground">
                المخزون: {product.stock}
              </span>
            </div>
          </div>

          {/* Wholesale pricing table */}
          <Card className="p-4 shadow-soft space-y-3">
            <h2 className="font-semibold flex items-center gap-2">
              <Info className="h-4 w-4 text-primary" />
              الأسعار
            </h2>
            {product.rrp_price != null && (
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">
                  السعر الموصى به للبيع (RRP)
                </span>
                <span className="font-medium">{formatMAD(product.rrp_price)}</span>
              </div>
            )}
            {showPharmacyPricing && product.pharmacy_price != null && (
              <div className="flex items-center justify-between text-sm border-t pt-2">
                <span className="text-muted-foreground">سعر الصيدلية</span>
                <span className="font-bold text-primary">
                  {formatMAD(product.pharmacy_price)}
                </span>
              </div>
            )}
            {showDistributorPricing && sortedTiers.length > 0 && (
              <div className="space-y-1.5 border-t pt-2">
                <p className="text-xs font-medium text-muted-foreground">
                  أسعار الجملة حسب الكمية
                </p>
                {sortedTiers.map((t, i) => {
                  const next = sortedTiers[i + 1];
                  const range = next
                    ? `${t.min_qty}–${next.min_qty - 1} وحدة`
                    : `${t.min_qty}+ وحدة`;
                  const isActive =
                    pricing?.tier?.min_qty === t.min_qty &&
                    (pricing.source === "tier" ||
                      pricing.source === "deepest_tier");
                  return (
                    <div
                      key={t.min_qty}
                      className={`flex items-center justify-between text-sm rounded-md px-2 py-1 ${
                        isActive ? "bg-accent/60 font-semibold" : ""
                      }`}
                    >
                      <span>{range}</span>
                      <span>{formatMAD(t.price)}</span>
                    </div>
                  );
                })}
              </div>
            )}
            {product.minimum_order > 1 && (
              <div className="flex items-center justify-between text-xs text-muted-foreground border-t pt-2">
                <span>الحد الأدنى للطلب</span>
                <span>{product.minimum_order} وحدة</span>
              </div>
            )}
          </Card>

          <Card className="p-4 shadow-soft">
            <h2 className="font-semibold mb-2">الوصف</h2>
            <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">
              {product.description_ar || "لا يوجد وصف لهذا المنتج."}
            </p>
          </Card>

          {!outOfStock && (
            <div className="flex items-center gap-3 flex-wrap">
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
                    if (Number.isFinite(n))
                      setQty(Math.min(maxQty, Math.max(1, Math.floor(n))));
                  }}
                  className="w-14 text-center bg-transparent outline-none font-medium tabular-nums"
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
              {pricing && (
                <span className="text-xs text-muted-foreground">
                  الإجمالي: {formatMAD(pricing.unitPrice * qty)}
                </span>
              )}
            </div>
          )}

          {qty < minQty && !outOfStock && (
            <p className="text-xs text-destructive">
              الحد الأدنى للطلب: {minQty} وحدة
            </p>
          )}

          <Button
            size="lg"
            className="w-full gap-2"
            onClick={handleAdd}
            disabled={outOfStock || qty < minQty}
          >
            <Plus className="h-4 w-4" />
            {outOfStock
              ? "غير متوفر"
              : qty < minQty
                ? `الحد الأدنى ${minQty} وحدة`
                : "إضافة إلى السلة"}
          </Button>
        </div>
      </div>
    </div>
  );
}
