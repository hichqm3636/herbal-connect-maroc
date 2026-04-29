import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2, Lock, Package, ShoppingCart, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/EmptyState";
import { formatMAD } from "@/lib/format";
import { parseTiers } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/store/$slug")({
  component: VendorStorePage,
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — متجر البائع` },
      {
        name: "description",
        content: `كتالوج البائع ${params.slug} على منصة Nexora.`,
      },
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

interface StoreProduct {
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
}

function VendorStorePage() {
  const { slug } = Route.useParams();
  const { session, isClient, marketplaceRole, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const cart = useCart();

  const [vendor, setVendor] = useState<Vendor | null>(null);
  const [vendorLoading, setVendorLoading] = useState(true);
  const [products, setProducts] = useState<StoreProduct[]>([]);
  const [productsLoading, setProductsLoading] = useState(false);
  const [q, setQ] = useState("");

  // Load vendor (public — anon can read listed companies)
  useEffect(() => {
    let alive = true;
    setVendorLoading(true);
    (async () => {
      const { data } = await supabase
        .from("companies")
        .select("id, name, slug, display_name, logo_url, brand_color")
        .eq("slug", slug)
        .maybeSingle();
      if (!alive) return;
      setVendor((data as Vendor | null) ?? null);
      setVendorLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [slug]);

  // Load products only when authenticated (catalog is gated per spec)
  useEffect(() => {
    if (!vendor || !session) {
      setProducts([]);
      return;
    }
    let alive = true;
    setProductsLoading(true);
    (async () => {
      const { data } = await supabase
        .from("products")
        .select(
          "id, name_ar, description_ar, price_mad, rrp_price, pharmacy_price, map_price, image_url, category, stock, minimum_order, pack_size, price_tiers",
        )
        .eq("company_id", vendor.id)
        .eq("active", true)
        .order("created_at", { ascending: false });
      if (!alive) return;
      setProducts((data as StoreProduct[] | null) ?? []);
      setProductsLoading(false);
    })();
    return () => {
      alive = false;
    };
  }, [vendor, session]);

  const filtered = useMemo(() => {
    if (!q.trim()) return products;
    const needle = q.trim().toLowerCase();
    return products.filter(
      (p) =>
        p.name_ar.toLowerCase().includes(needle) ||
        (p.category ?? "").toLowerCase().includes(needle),
    );
  }, [products, q]);

  function buildCartProduct(p: StoreProduct): CartProduct {
    const display = p.rrp_price ?? p.pharmacy_price ?? p.price_mad;
    return {
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
      vendor_id: vendor!.id,
      vendor_slug: vendor!.slug,
      vendor_name: vendor!.display_name || vendor!.name,
    };
  }

  function tryAdd(p: StoreProduct) {
    if (!session) {
      navigate({ to: "/login" });
      return;
    }
    if (!isClient) {
      toast.error("هذا الحساب ليس حساب عميل. لا يمكن إنشاء طلبات.");
      return;
    }
    const cp = buildCartProduct(p);
    const result = cart.tryAdd(cp, p.minimum_order || 1);
    if (result.kind === "added") {
      toast.success("تمت الإضافة إلى السلة");
    }
    // "conflict" → handled globally by <ReplaceCartDialog />
  }

  if (vendorLoading || authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft" dir="rtl">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!vendor) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gradient-soft p-4" dir="rtl">
        <Card className="w-full max-w-md p-8 text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-destructive/10">
            <Package className="h-7 w-7 text-destructive" />
          </div>
          <h1 className="text-xl font-bold">البائع غير موجود</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            لا يوجد بائع بالاسم <span className="font-mono">{slug}</span>.
          </p>
          <Button asChild className="mt-6 w-full">
            <Link to="/vendors">تصفّح دليل البائعين</Link>
          </Button>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-soft" dir="rtl">
      <header
        className="border-b bg-card/80 backdrop-blur sticky top-0 z-10"
        style={{ borderTopColor: vendor.brand_color, borderTopWidth: 3 }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-3">
          <Link
            to="/vendors"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
            <span className="hidden sm:inline">الدليل</span>
          </Link>
          <div className="flex flex-1 items-center justify-center gap-3">
            <div
              className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-xl text-white"
              style={{ backgroundColor: vendor.brand_color }}
            >
              {vendor.logo_url ? (
                <img src={vendor.logo_url} alt={vendor.display_name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-sm font-bold">
                  {(vendor.display_name || vendor.name)[0]?.toUpperCase()}
                </span>
              )}
            </div>
            <div className="min-w-0">
              <h1 className="truncate text-sm font-bold sm:text-base">
                {vendor.display_name || vendor.name}
              </h1>
              <p className="text-[11px] text-muted-foreground">متجر البائع</p>
            </div>
          </div>
          {isClient && cart.totalQty > 0 && (
            <Button size="sm" variant="outline" onClick={cart.openCart} className="gap-1.5">
              <ShoppingCart className="h-4 w-4" />
              {cart.totalQty}
            </Button>
          )}
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-5">
        {!session ? (
          <Card className="p-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
              <Lock className="h-7 w-7 text-primary" />
            </div>
            <h2 className="text-lg font-bold">المنتجات والأسعار محمية</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              يجب تسجيل الدخول كحساب أعمال موثّق لعرض كتالوج هذا البائع.
            </p>
            <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
              <Button asChild>
                <Link to="/login">تسجيل الدخول</Link>
              </Button>
              <Button asChild variant="outline">
                <Link to="/signup">إنشاء حساب أعمال</Link>
              </Button>
            </div>
          </Card>
        ) : (
          <>
            {session && !isClient && (
              <Card className="mb-4 border-warning/50 bg-warning/10 p-3 text-sm">
                <p className="font-semibold">
                  حسابك {marketplaceRole === "vendor" || marketplaceRole === "admin" ? "حساب بائع" : "حساب إداري"}.
                </p>
                <p className="mt-1 text-muted-foreground">
                  السلة وإنشاء الطلبات متاحة لحسابات العملاء فقط. يمكنك تصفّح المنتجات ولكن لا يمكنك الشراء.
                </p>
              </Card>
            )}
            <div className="relative mb-4">
              <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="ابحث في منتجات هذا البائع..."
                className="pr-9"
              />
            </div>

            {productsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : filtered.length === 0 ? (
              <Card className="p-10 text-center">
                <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-muted">
                  <Package className="h-7 w-7 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  {q ? "لا توجد منتجات مطابقة لبحثك." : "لم يضِف هذا البائع منتجات بعد."}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((p) => {
                  const display = p.rrp_price ?? p.pharmacy_price ?? p.price_mad;
                  return (
                    <Card key={p.id} className="overflow-hidden">
                      <div className="aspect-square bg-muted">
                        {p.image_url ? (
                          <img src={p.image_url} alt={p.name_ar} className="h-full w-full object-cover" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center">
                            <Package className="h-8 w-8 text-muted-foreground" />
                          </div>
                        )}
                      </div>
                      <div className="p-3">
                        <p className="line-clamp-2 text-sm font-semibold">{p.name_ar}</p>
                        {p.category && (
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            {p.category}
                          </Badge>
                        )}
                        <p className="mt-2 text-base font-bold">{formatMAD(display)}</p>
                        <Button
                          size="sm"
                          className="mt-2 w-full gap-1"
                          disabled={p.stock === 0 || (!!session && !isClient)}
                          onClick={() => tryAdd(p)}
                          title={!!session && !isClient ? "حسابك ليس حساب عميل" : undefined}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {p.stock === 0
                            ? "غير متوفر"
                            : !!session && !isClient
                              ? "للعملاء فقط"
                              : "أضف إلى السلة"}
                        </Button>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </>
        )}
      </main>

      {/* Vendor-conflict prompt is mounted globally in _app.tsx as <ReplaceCartDialog /> */}
