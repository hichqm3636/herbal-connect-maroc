import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Flame,
  Loader2,
  Lock,
  MessageCircle,
  Package,
  ShieldCheck,
  ShoppingCart,
  Sparkles,
  Star,
  Truck,
  Users,
  Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductReviewsSection } from "@/components/ProductReviewsSection";
import { formatMAD } from "@/lib/format";
import { parseTiers } from "@/lib/pricing";
import { buildWhatsappLink } from "@/utils/whatsapp";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  contact_phone: string | null;
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

interface TrustSignals {
  total_orders: number;
  buyers_7d: number;
  buyers_24h: number;
}

interface ReviewSummary {
  count: number;
  avg: number;
}

const LOW_STOCK_THRESHOLD = 10;
const HIGH_DEMAND_THRESHOLD = 3; // distinct buyers in last 24h

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
          .select(
            "id, name, slug, display_name, logo_url, brand_color, contact_phone",
          )
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

  // Trust signals (orders aggregate) — cached 60s
  const trustQuery = useQuery({
    queryKey: ["product-trust", id],
    enabled: !!product,
    staleTime: 60_000,
    queryFn: async (): Promise<TrustSignals> => {
      const { data, error } = await supabase.rpc("product_trust_signals", {
        _product_id: id,
      });
      if (error) throw error;
      const r = (data ?? {}) as Partial<TrustSignals>;
      return {
        total_orders: Number(r.total_orders ?? 0),
        buyers_7d: Number(r.buyers_7d ?? 0),
        buyers_24h: Number(r.buyers_24h ?? 0),
      };
    },
  });

  // Compact rating summary for the hero (reuses reviews summary RPC; cached separately by ProductReviewsSection key)
  const ratingQuery = useQuery({
    queryKey: ["product-reviews", "summary", id],
    enabled: !!product,
    staleTime: 60_000,
    queryFn: async (): Promise<ReviewSummary> => {
      const { data, error } = await supabase.rpc("product_reviews_summary", {
        _product_id: id,
      });
      if (error) throw error;
      const r = (data ?? {}) as { count?: number; avg?: number | string };
      return { count: Number(r.count ?? 0), avg: Number(r.avg ?? 0) };
    },
  });

  const trust = trustQuery.data;
  const rating = ratingQuery.data;

  const stock = product?.stock ?? null;
  const lowStock =
    typeof stock === "number" && stock > 0 && stock <= LOW_STOCK_THRESHOLD;
  const outOfStock = stock === 0;
  const highDemand = (trust?.buyers_24h ?? 0) >= HIGH_DEMAND_THRESHOLD;

  const cartProduct = useMemo<CartProduct | null>(() => {
    if (!product || !vendor) return null;
    return {
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
  }, [product, vendor]);

  const tryAdd = (): boolean => {
    if (!cartProduct || !product) return false;
    const res = cart.tryAdd(cartProduct, product.minimum_order || 1);
    if (res.kind === "added") {
      toast.success("تمت الإضافة إلى السلة");
      return true;
    }
    return false;
  };

  // 1-tap "Buy now": add + go straight to checkout
  const buyNow = () => {
    if (tryAdd()) navigate({ to: "/checkout" });
  };

  // WhatsApp fallback link with prefilled order intent
  const whatsappHref = useMemo(() => {
    if (!vendor?.contact_phone || !product) return "";
    const productUrl =
      typeof window !== "undefined" ? window.location.href : "";
    const message = `السلام عليكم،
أرغب في طلب هذا المنتج:

🛒 ${product.name_ar}
💰 السعر: ${formatMAD(product.price_mad)}
🏬 المتجر: ${vendor.display_name || vendor.name}
${productUrl ? `🔗 ${productUrl}` : ""}

شكراً لكم.`;
    return buildWhatsappLink(vendor.contact_phone, message);
  }, [vendor, product]);

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

  const display =
    product.rrp_price ?? product.pharmacy_price ?? product.price_mad;
  const ctaDisabled = outOfStock || (!!session && !isClient);
  const ctaLabel = outOfStock
    ? "غير متوفر"
    : !session
      ? "تسجيل الدخول للشراء"
      : !isClient
        ? "للعملاء فقط"
        : "أضف إلى السلة";

  return (
    <div className="min-h-screen bg-background pb-24 sm:pb-6" dir="rtl">
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

      <main className="mx-auto max-w-3xl space-y-4 px-4 py-5">
        <Card className="overflow-hidden">
          <div className="relative aspect-square w-full bg-muted sm:aspect-[16/9]">
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
            {/* Scarcity / demand badges over the image */}
            <div className="absolute right-3 top-3 flex flex-col gap-1.5">
              {highDemand && (
                <span className="inline-flex items-center gap-1 rounded-full bg-orange-500 px-2.5 py-1 text-[11px] font-bold text-white shadow-md">
                  <Flame className="h-3 w-3" />
                  طلب مرتفع
                </span>
              )}
              {lowStock && (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1 text-[11px] font-bold text-destructive-foreground shadow-md">
                  <Zap className="h-3 w-3" />
                  بقي {stock} فقط
                </span>
              )}
            </div>
          </div>

          <div className="p-4">
            {product.category && (
              <Badge variant="secondary" className="mb-2 text-[10px]">
                {product.category}
              </Badge>
            )}
            <h2 className="text-xl font-bold">{product.name_ar}</h2>

            {/* Inline rating + sales social proof */}
            {(rating?.count ?? 0) > 0 || (trust?.total_orders ?? 0) > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                {(rating?.count ?? 0) > 0 && (
                  <a
                    href="#reviews"
                    className="inline-flex items-center gap-1 font-medium text-foreground hover:underline"
                  >
                    <Star className="h-3.5 w-3.5 fill-yellow-400 text-yellow-400" />
                    <span className="tabular-nums">
                      {rating!.avg.toFixed(1)}
                    </span>
                    <span className="text-muted-foreground">
                      ({rating!.count} مراجعة)
                    </span>
                  </a>
                )}
                {(trust?.total_orders ?? 0) > 0 && (
                  <span className="inline-flex items-center gap-1">
                    <ShoppingCart className="h-3.5 w-3.5" />
                    تم طلبه {trust!.total_orders}+ مرة
                  </span>
                )}
              </div>
            ) : null}

            {product.description_ar && (
              <p className="mt-3 whitespace-pre-line text-sm text-muted-foreground">
                {product.description_ar}
              </p>
            )}

            <div className="mt-4 flex items-end justify-between gap-3">
              <div>
                <p className="text-2xl font-extrabold">{formatMAD(display)}</p>
                {product.minimum_order > 1 && (
                  <p className="text-[11px] text-muted-foreground">
                    الحد الأدنى: {product.minimum_order}
                  </p>
                )}
              </div>
              {!session ? (
                <Button asChild variant="outline" className="gap-1.5">
                  <Link to="/login">
                    <Lock className="h-4 w-4" />
                    تسجيل الدخول
                  </Link>
                </Button>
              ) : (
                <div className="flex flex-col gap-1.5 sm:flex-row">
                  <Button
                    onClick={tryAdd}
                    disabled={ctaDisabled}
                    variant="outline"
                    className="gap-1.5"
                  >
                    <ShoppingCart className="h-4 w-4" />
                    أضف للسلة
                  </Button>
                  <Button
                    onClick={buyNow}
                    disabled={ctaDisabled}
                    className="gap-1.5"
                  >
                    <Sparkles className="h-4 w-4" />
                    اشترِ الآن
                  </Button>
                </div>
              )}
            </div>
          </div>
        </Card>

        {/* Trust signals row */}
        <Card className="grid grid-cols-2 gap-3 p-4 sm:grid-cols-4">
          <TrustItem
            icon={<ShieldCheck className="h-4 w-4 text-success" />}
            label="دفع آمن"
            value="موثوق"
          />
          <TrustItem
            icon={<Truck className="h-4 w-4 text-primary" />}
            label="توصيل"
            value="سريع"
          />
          <TrustItem
            icon={<Users className="h-4 w-4 text-orange-500" />}
            label="آخر 7 أيام"
            value={
              trustQuery.isLoading
                ? "…"
                : `${trust?.buyers_7d ?? 0} مشترٍ`
            }
            highlight={(trust?.buyers_7d ?? 0) > 0}
          />
          <TrustItem
            icon={<Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />}
            label="التقييم"
            value={
              ratingQuery.isLoading
                ? "…"
                : (rating?.count ?? 0) > 0
                  ? `${rating!.avg.toFixed(1)} / 5`
                  : "جديد"
            }
          />
        </Card>

        {/* Recent activity snippet */}
        {(trust?.buyers_24h ?? 0) > 0 && (
          <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs text-orange-800 dark:border-orange-900/40 dark:bg-orange-950/30 dark:text-orange-200">
            <Flame className="h-4 w-4 shrink-0" />
            <span>
              {trust!.buyers_24h} {trust!.buyers_24h === 1 ? "شخص" : "أشخاص"}{" "}
              طلبوا هذا المنتج خلال آخر 24 ساعة
            </span>
          </div>
        )}

        {/* WhatsApp fallback */}
        {whatsappHref && (
          <a
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 rounded-lg border border-green-200 bg-green-50 px-4 py-3 text-sm font-semibold text-green-800 transition-colors hover:bg-green-100 dark:border-green-900/40 dark:bg-green-950/30 dark:text-green-200 dark:hover:bg-green-950/50"
          >
            <MessageCircle className="h-4 w-4" />
            اطلب عبر واتساب
          </a>
        )}

        <div id="reviews" className="scroll-mt-20">
          <ProductReviewsSection
            productId={product.id}
            productName={product.name_ar}
            companyId={product.company_id}
            companyName={vendor.display_name || vendor.name}
          />
        </div>
      </main>

      {/* Sticky mobile Add-to-Cart bar */}
      {session && (
        <div
          className={cn(
            "fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 py-3 shadow-[0_-4px_12px_-6px_rgba(0,0,0,0.1)] backdrop-blur sm:hidden",
          )}
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2">
            <div className="flex-1">
              <p className="text-base font-extrabold leading-tight">
                {formatMAD(display)}
              </p>
              {lowStock && (
                <p className="text-[10px] font-medium text-destructive">
                  بقي {stock} فقط
                </p>
              )}
            </div>
            <Button
              onClick={tryAdd}
              disabled={ctaDisabled}
              variant="outline"
              size="sm"
              className="gap-1.5"
            >
              <ShoppingCart className="h-4 w-4" />
              السلة
            </Button>
            <Button
              onClick={buyNow}
              disabled={ctaDisabled}
              size="sm"
              className="gap-1.5"
            >
              <Sparkles className="h-4 w-4" />
              {ctaLabel === "أضف إلى السلة" ? "اشترِ الآن" : ctaLabel}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function TrustItem({
  icon,
  label,
  value,
  highlight,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-[10px] text-muted-foreground">{label}</p>
        <p
          className={cn(
            "truncate text-xs font-bold",
            highlight && "text-orange-600",
          )}
        >
          {value}
        </p>
      </div>
    </div>
  );
}
