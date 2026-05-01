import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { ArrowLeft, Loader2, Lock, Package, ShoppingCart, Search } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { EmptyState } from "@/components/EmptyState";
import { formatMAD } from "@/lib/format";
import { parseTiers } from "@/lib/pricing";
import { cn } from "@/lib/utils";
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
  const [sort, setSort] = useState<"new" | "price_asc" | "price_desc" | "name">("new");
  const [categoryFilter, setCategoryFilter] = useState<string>("all");
  const [stockOnly, setStockOnly] = useState(false);

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

  const categories = useMemo(() => {
    const set = new Set<string>();
    products.forEach((p) => p.category && set.add(p.category));
    return Array.from(set).sort();
  }, [products]);

  const filtered = useMemo(() => {
    let list = products;
    const needle = q.trim().toLowerCase();
    if (needle) {
      list = list.filter(
        (p) =>
          p.name_ar.toLowerCase().includes(needle) ||
          (p.category ?? "").toLowerCase().includes(needle),
      );
    }
    if (categoryFilter !== "all") {
      list = list.filter((p) => p.category === categoryFilter);
    }
    if (stockOnly) {
      list = list.filter((p) => p.stock === null || (p.stock ?? 0) > 0);
    }
    const sorted = [...list];
    if (sort === "price_asc") {
      sorted.sort((a, b) => (a.rrp_price ?? a.price_mad) - (b.rrp_price ?? b.price_mad));
    } else if (sort === "price_desc") {
      sorted.sort((a, b) => (b.rrp_price ?? b.price_mad) - (a.rrp_price ?? a.price_mad));
    } else if (sort === "name") {
      sorted.sort((a, b) => a.name_ar.localeCompare(b.name_ar, "ar"));
    }
    return sorted;
  }, [products, q, categoryFilter, stockOnly, sort]);

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

  function handleCartOpen(e: MouseEvent<HTMLButtonElement> | PointerEvent<HTMLButtonElement>) {
    e.preventDefault();
    e.stopPropagation();
    console.log("[store] cart button clicked, totalQty=", cart.totalQty);
    cart.openCart();
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
          <div className="pointer-events-none flex min-w-0 flex-1 items-center justify-center gap-3">
            <div
              className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-xl text-white"
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
          <Button
            type="button"
            size="sm"
            variant="outline"
            onPointerUp={handleCartOpen}
            onClick={handleCartOpen}
            className="pointer-events-auto fixed left-4 top-[calc(env(safe-area-inset-top)+0.75rem)] z-[2147483647] shrink-0 touch-manipulation isolate gap-1.5 shadow-elegant transition-transform active:scale-95 sm:static sm:z-auto"
            aria-label="فتح السلة"
          >
            <ShoppingCart className="h-4 w-4" />
            {cart.totalQty > 0 && (
              <span className="absolute -top-1 -right-1 rounded-full bg-warning px-1 text-[10px] font-bold text-warning-foreground tabular-nums">
                {cart.totalQty}
              </span>
            )}
          </Button>
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
            <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="ابحث في منتجات هذا البائع..."
                  className="pr-9"
                />
              </div>
              {categories.length > 0 && (
                <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                  <SelectTrigger className="sm:w-44">
                    <SelectValue placeholder="الفئة" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">كل الفئات</SelectItem>
                    {categories.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              <Select value={sort} onValueChange={(v) => setSort(v as typeof sort)}>
                <SelectTrigger className="sm:w-44">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="new">الأحدث</SelectItem>
                  <SelectItem value="price_asc">السعر: من الأقل</SelectItem>
                  <SelectItem value="price_desc">السعر: من الأعلى</SelectItem>
                  <SelectItem value="name">الاسم (أبجدياً)</SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant={stockOnly ? "default" : "outline"}
                size="sm"
                onClick={() => setStockOnly((s) => !s)}
                className="shrink-0"
              >
                المتوفر فقط
              </Button>
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              {filtered.length} منتج
            </p>

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
                  {q || categoryFilter !== "all" || stockOnly
                    ? "لا توجد منتجات مطابقة لبحثك."
                    : "لم يضِف هذا البائع منتجات بعد."}
                </p>
              </Card>
            ) : (
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
                {filtered.map((p) => {
                  const display = p.rrp_price ?? p.pharmacy_price ?? p.price_mad;
                  const hasDiscount =
                    p.rrp_price !== null && p.rrp_price > p.price_mad;
                  const discountPct = hasDiscount
                    ? Math.round(((p.rrp_price! - p.price_mad) / p.rrp_price!) * 100)
                    : 0;
                  const outOfStock = p.stock === 0;
                  const lowStock =
                    typeof p.stock === "number" && p.stock > 0 && p.stock <= 5;
                  return (
                    <Card
                      key={p.id}
                      className={cn(
                        "group overflow-hidden transition-all hover:shadow-lg hover:-translate-y-0.5",
                        outOfStock && "opacity-75",
                      )}
                    >
                      <Link
                        to="/store/$slug/product/$id"
                        params={{ slug, id: p.id }}
                        className="block"
                      >
                        <div className="relative aspect-square overflow-hidden bg-muted">
                          {p.image_url ? (
                            <img
                              src={p.image_url}
                              alt={p.name_ar}
                              loading="lazy"
                              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
                            />
                          ) : (
                            <div className="flex h-full w-full items-center justify-center">
                              <Package className="h-8 w-8 text-muted-foreground" />
                            </div>
                          )}
                          {hasDiscount && (
                            <span className="absolute right-2 top-2 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-bold text-destructive-foreground shadow">
                              −{discountPct}%
                            </span>
                          )}
                          {outOfStock && (
                            <span className="absolute left-2 top-2 rounded-full bg-muted-foreground/90 px-2 py-0.5 text-[10px] font-bold text-background">
                              نفد
                            </span>
                          )}
                          {!outOfStock && lowStock && (
                            <span className="absolute left-2 top-2 rounded-full bg-warning px-2 py-0.5 text-[10px] font-bold text-warning-foreground shadow">
                              بقي {p.stock}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className="p-3">
                        <Link
                          to="/store/$slug/product/$id"
                          params={{ slug, id: p.id }}
                          className="line-clamp-2 min-h-[2.5rem] text-sm font-semibold leading-tight hover:text-primary"
                        >
                          {p.name_ar}
                        </Link>
                        {p.category && (
                          <Badge variant="secondary" className="mt-1 text-[10px]">
                            {p.category}
                          </Badge>
                        )}
                        <div className="mt-2 flex items-baseline gap-1.5">
                          <p className="text-base font-extrabold text-foreground">
                            {formatMAD(p.price_mad)}
                          </p>
                          {hasDiscount && (
                            <p className="text-[11px] text-muted-foreground line-through">
                              {formatMAD(p.rrp_price!)}
                            </p>
                          )}
                        </div>
                        {p.minimum_order > 1 && (
                          <p className="text-[10px] text-muted-foreground">
                            الحد الأدنى: {p.minimum_order}
                          </p>
                        )}
                        <Button
                          size="sm"
                          className="mt-2 w-full gap-1"
                          disabled={outOfStock || (!!session && !isClient)}
                          onClick={() => tryAdd(p)}
                          title={!!session && !isClient ? "حسابك ليس حساب عميل" : undefined}
                        >
                          <ShoppingCart className="h-3.5 w-3.5" />
                          {outOfStock
                            ? "غير متوفر"
                            : !!session && !isClient
                              ? "للعملاء فقط"
                              : "أضف للسلة"}
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
    </div>
  );
}
