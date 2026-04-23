import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Plus,
  Minus,
  Trash2,
  ShoppingCart,
  Loader2,
  Sparkles,
  Flame,
  Search,
  CheckCircle2,
  MessageCircle,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { useCart, type CartProduct } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { getUnitPrice, parseTiers, type PriceTier } from "@/lib/pricing";
import { getHiddenProductIds } from "@/lib/productZones";
import { logActivity } from "@/lib/activityLog";
import {
  buildOrderWhatsappMessage,
  buildWhatsappLink,
} from "@/utils/whatsapp";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/shop")({
  component: ShopPage,
  head: () => ({
    meta: [
      { title: "المتجر — اطلب بسرعة" },
      {
        name: "description",
        content: "تصفح المنتجات الأكثر طلباً وأرسل طلبك في أقل من دقيقتين.",
      },
    ],
  }),
});

interface ShopProduct {
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
  order_count: number;
}

interface PlacedOrder {
  id: string;
  number: string;
  total: number;
  itemsCount: number;
}

function ShopPage() {
  const {
    items,
    totalQty,
    addItem,
    setQty,
    removeItem,
    clear,
  } = useCart();
  const { user, partnerType, companyId, territoryId, isAdmin } = useAuth();

  const [products, setProducts] = useState<ShopProduct[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [search, setSearch] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("all");
  const [cartOpen, setCartOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<PlacedOrder | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ---------------- Load catalog + order counts ----------------
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingProducts(true);
      const { data: prodRows } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name_ar");

      const rows = (prodRows ?? []).map((p) => ({
        ...p,
        price_tiers: parseTiers((p as { price_tiers?: unknown }).price_tiers),
      })) as Omit<ShopProduct, "order_count">[];

      // Compute "most ordered" via aggregation on order_items.
      // RLS scopes order_items by company through orders, so distributors
      // see only their own counts; admins see company-wide.
      const ids = rows.map((r) => r.id);
      const counts = new Map<string, number>();
      if (ids.length > 0) {
        const { data: itemRows } = await supabase
          .from("order_items")
          .select("product_id, quantity")
          .in("product_id", ids);
        for (const r of itemRows ?? []) {
          const pid = r.product_id as string;
          counts.set(pid, (counts.get(pid) ?? 0) + Number(r.quantity ?? 0));
        }
      }

      const visibleIds = isAdmin
        ? new Set(ids)
        : await (async () => {
            const hidden = await getHiddenProductIds(ids, territoryId);
            return new Set(ids.filter((i) => !hidden.has(i)));
          })();

      const enriched: ShopProduct[] = rows
        .filter((r) => visibleIds.has(r.id))
        .map((r) => ({ ...r, order_count: counts.get(r.id) ?? 0 }));

      if (!cancelled) {
        setProducts(enriched);
        setLoadingProducts(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [territoryId, isAdmin]);

  // ---------------- Filtering & buckets ----------------
  const categories = useMemo(() => {
    const set = new Set<string>();
    for (const p of products) {
      if (p.category && p.category.trim()) set.add(p.category.trim());
    }
    return Array.from(set).sort();
  }, [products]);

  const topSellersAll = useMemo(
    () =>
      [...products]
        .filter((p) => p.order_count > 0)
        .sort((a, b) => b.order_count - a.order_count),
    [products],
  );
  const topSellerIds = useMemo(
    () => new Set(topSellersAll.slice(0, 12).map((p) => p.id)),
    [topSellersAll],
  );

  const filtered = useMemo(() => {
    const q = search.trim();
    let list = products;
    if (activeCategory === "top") {
      list = list.filter((p) => topSellerIds.has(p.id));
    } else if (activeCategory === "new") {
      // newest first by created_at proxy → use last 12 by id order from DB
      list = [...list].slice(-12).reverse();
    } else if (activeCategory !== "all") {
      list = list.filter((p) => (p.category ?? "").trim() === activeCategory);
    }
    if (!q) return list;
    return list.filter(
      (p) =>
        p.name_ar.includes(q) ||
        (p.category ?? "").includes(q) ||
        p.description_ar.includes(q),
    );
  }, [products, search, activeCategory, topSellerIds]);

  const topSellers = topSellersAll.slice(0, 6);

  const heroProduct = topSellers[0] ?? products[0] ?? null;

  // ---------------- Smart suggestions ----------------
  const suggestions = useMemo(() => {
    if (items.length === 0) return [];
    const cartIds = new Set(items.map((i) => i.id));
    const cartCategories = new Set(
      items
        .map((i) => products.find((p) => p.id === i.id)?.category)
        .filter((c): c is string => !!c),
    );
    if (cartCategories.size === 0) return [];
    return products
      .filter(
        (p) =>
          !cartIds.has(p.id) &&
          p.category &&
          cartCategories.has(p.category),
      )
      .sort((a, b) => b.order_count - a.order_count)
      .slice(0, 4);
  }, [items, products]);

  // ---------------- Add to cart helpers ----------------
  const addProduct = (p: ShopProduct) => {
    const pack = Math.max(1, p.pack_size || 1);
    const qty = Math.max(pack, p.minimum_order || 1);
    const payload: CartProduct = {
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
    };
    addItem(payload, qty);
    toast.success("تمت الإضافة", { duration: 1200 });
  };

  // ---------------- Pricing for cart preview ----------------
  const priced = useMemo(
    () =>
      items.map((item) => {
        const pp = {
          rrp_price: item.rrp_price ?? null,
          pharmacy_price: item.pharmacy_price ?? null,
          map_price: item.map_price ?? null,
          minimum_order: item.minimum_order ?? 1,
          price_tiers: item.price_tiers ?? [],
          price_mad: item.price_mad,
        };
        const { unitPrice } = getUnitPrice(pp, partnerType, item.qty);
        return { item, unitPrice, lineTotal: unitPrice * item.qty };
      }),
    [items, partnerType],
  );
  const cartTotal = priced.reduce((s, l) => s + l.lineTotal, 0);

  // ---------------- Place order (DB first, WhatsApp optional) ----------------
  const placeOrder = async () => {
    if (!user) {
      toast.error("يجب تسجيل الدخول");
      return;
    }
    if (!companyId) {
      toast.error("لا توجد شركة نشطة");
      return;
    }
    if (priced.length === 0) return;

    setSubmitting(true);
    const total = cartTotal;
    const points = Math.floor(total / 100);
    const orderPayload = {
      distributor_id: user.id,
      company_id: companyId,
      total_mad: total,
      points_earned: points,
      status: "pending" as const,
      notes: null,
    };
    const { data: order, error } = await supabase
      .from("orders")
      .insert(orderPayload as never)
      .select("id, order_number, total_mad")
      .single();
    if (error || !order) {
      toast.error(`تعذر إنشاء الطلب: ${error?.message ?? "خطأ غير معروف"}`);
      setSubmitting(false);
      return;
    }

    // Snapshot cost for accurate historical profit
    const productIds = priced.map((l) => l.item.id);
    const { data: costRows } = await supabase
      .from("products")
      .select("id, cost_price")
      .in("id", productIds);
    const costMap = new Map<string, number | null>(
      (costRows ?? []).map((r) => [
        r.id as string,
        (r as { cost_price: number | null }).cost_price,
      ]),
    );

    const orderItems = priced.map((l) => ({
      order_id: order.id,
      product_id: l.item.id,
      quantity: l.item.qty,
      unit_price_mad: l.unitPrice,
      cost_snapshot: costMap.get(l.item.id) ?? null,
    }));
    const { error: itemsErr } = await supabase
      .from("order_items")
      .insert(orderItems);
    if (itemsErr) {
      await supabase.from("orders").delete().eq("id", order.id);
      toast.error(`تعذر حفظ عناصر الطلب: ${itemsErr.message}`);
      setSubmitting(false);
      return;
    }

    void logActivity({
      companyId,
      action: "order_created",
      entityType: "order",
      entityId: order.id,
      metadata: {
        total_mad: total,
        items_count: orderItems.length,
        points_earned: points,
        source: "shop",
      },
    });

    setPlaced({
      id: order.id,
      number: (order as { order_number: string }).order_number,
      total,
      itemsCount: orderItems.length,
    });
    clear();
    setCartOpen(false);
    setSubmitting(false);
  };

  // ---------------- WhatsApp (optional, after success) ----------------
  const buildWhatsAppHref = (o: PlacedOrder): string => {
    const message = buildOrderWhatsappMessage({
      distributorName: user?.email ?? "Distributor",
      orderNumber: o.number,
      orderTotalMad: o.total,
      orderId: o.id,
      appBaseUrl:
        typeof window !== "undefined" ? window.location.origin : undefined,
    });
    // Phone is unknown here; wa.me with no phone opens chooser. Fall back to share-text URL.
    return buildWhatsappLink("", message) || `https://wa.me/?text=${encodeURIComponent(message)}`;
  };

  // ---------------- Render ----------------
  return (
    <div className="space-y-6 pb-28" dir="rtl">
      {/* Hero */}
      {heroProduct && (
        <Card className="relative overflow-hidden border-0 shadow-elegant bg-gradient-primary text-primary-foreground">
          <div className="grid gap-4 p-6 md:p-8 md:grid-cols-[1fr_auto] md:items-center">
            <div className="space-y-3">
              <Badge className="bg-white/20 text-primary-foreground border-0 gap-1 backdrop-blur">
                <Flame className="h-3 w-3" /> الأكثر طلباً
              </Badge>
              <h1 className="text-2xl md:text-3xl font-bold leading-tight">
                {heroProduct.name_ar}
              </h1>
              <p className="text-sm opacity-90 line-clamp-2 max-w-xl">
                {heroProduct.description_ar ||
                  "أضفه للسلة بنقرة واحدة وأرسل طلبك في ثوانٍ."}
              </p>
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <Button
                  size="lg"
                  variant="secondary"
                  onClick={() => addProduct(heroProduct)}
                  className="gap-2 font-semibold shadow-lg"
                >
                  <Plus className="h-4 w-4" />
                  اطلب الآن
                </Button>
                <span className="text-sm opacity-90">
                  {formatMAD(
                    getUnitPrice(heroProduct, partnerType, heroProduct.minimum_order || 1)
                      .unitPrice,
                  )}
                </span>
              </div>
            </div>
            {heroProduct.image_url && (
              <img
                src={heroProduct.image_url}
                alt={heroProduct.name_ar}
                className="hidden md:block h-32 w-32 rounded-xl object-cover bg-white/10 shadow-lg"
              />
            )}
          </div>
        </Card>
      )}

      {/* Sticky search + category chips */}
      <div className="sticky top-0 z-30 -mx-4 px-4 py-3 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 border-b">
        <div className="relative">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="ابحث عن منتج…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pr-9 h-11"
          />
        </div>
        <div className="flex gap-2 overflow-x-auto mt-3 -mx-1 px-1 pb-1 snap-x">
          {[
            { key: "all", label: "الكل" },
            { key: "top", label: "الأكثر طلباً" },
            { key: "new", label: "جديد" },
            ...categories.map((c) => ({ key: c, label: c })),
          ].map((chip) => {
            const active = activeCategory === chip.key;
            return (
              <button
                key={chip.key}
                type="button"
                onClick={() => setActiveCategory(chip.key)}
                className={`snap-start shrink-0 px-3 h-8 rounded-full text-xs font-medium border transition-colors ${
                  active
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-card text-muted-foreground border-border hover:bg-muted"
                }`}
                aria-pressed={active}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Top sellers strip */}
      {topSellers.length > 0 && !search && (
        <section aria-labelledby="top-sellers" className="space-y-3">
          <h2 id="top-sellers" className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Flame className="h-4 w-4 text-warning" />
            الأكثر طلباً
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {topSellers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="snap-start shrink-0 w-40 text-right rounded-xl border bg-card p-3 hover:shadow-elegant transition-shadow"
              >
                <div className="aspect-square rounded-lg bg-muted overflow-hidden mb-2">
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name_ar}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="text-xs font-medium line-clamp-2 leading-snug">{p.name_ar}</p>
                <p className="text-sm font-bold text-primary mt-1">
                  {formatMAD(getUnitPrice(p, partnerType, p.minimum_order || 1).unitPrice)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Catalog */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {search ? "نتائج البحث" : "كل المنتجات"}
        </h2>
        {loadingProducts ? (
          <Card className="p-12 text-center text-muted-foreground">
            <Loader2 className="h-6 w-6 mx-auto animate-spin" />
          </Card>
        ) : filtered.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            لا توجد منتجات
          </Card>
        ) : (
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {filtered.map((p) => {
              const { unitPrice } = getUnitPrice(
                p,
                partnerType,
                Math.max(p.minimum_order || 1, 6),
              );
              const outOfStock = p.stock === 0;
              const isTop = topSellerIds.has(p.id);
              return (
                <Card
                  key={p.id}
                  className={`overflow-hidden flex flex-col shadow-soft hover:shadow-elegant transition-shadow ${
                    outOfStock ? "opacity-60" : ""
                  }`}
                >
                  <div className="relative aspect-square bg-muted overflow-hidden">
                    {p.image_url && (
                      <img
                        src={p.image_url}
                        alt={p.name_ar}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    )}
                    <div className="absolute top-2 right-2 flex flex-col gap-1 items-end">
                      {isTop && (
                        <Badge className="gap-1 bg-warning/90 text-warning-foreground border-0 text-[10px]">
                          <Flame className="h-2.5 w-2.5" /> الأكثر طلباً
                        </Badge>
                      )}
                      <Badge
                        variant="outline"
                        className={`text-[10px] border-0 ${
                          outOfStock
                            ? "bg-destructive/90 text-destructive-foreground"
                            : "bg-success/90 text-success-foreground"
                        }`}
                      >
                        {outOfStock ? "نفذ المخزون" : "متوفر"}
                      </Badge>
                    </div>
                  </div>
                  <div className="p-3 flex flex-col gap-2 flex-1">
                    <p className="text-sm font-semibold leading-snug line-clamp-2 flex-1">
                      {p.name_ar}
                    </p>
                    <div className="flex items-end justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-base font-bold text-primary leading-tight">
                          {formatMAD(unitPrice)}
                        </p>
                        {p.minimum_order > 1 && (
                          <span className="text-[10px] text-muted-foreground">
                            حد أدنى: {p.minimum_order}
                          </span>
                        )}
                      </div>
                      <Button
                        size="icon"
                        onClick={() => addProduct(p)}
                        disabled={outOfStock}
                        aria-label={`إضافة ${p.name_ar}`}
                        className="h-10 w-10 shrink-0 rounded-full shadow-md transition-transform active:scale-90"
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </section>

      {/* Smart suggestions */}
      {suggestions.length > 0 && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            يُطلب معه عادة
          </h2>
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x">
            {suggestions.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => addProduct(p)}
                className="snap-start shrink-0 w-40 text-right rounded-xl border bg-card p-3 hover:shadow-elegant transition-shadow"
              >
                <div className="aspect-square rounded-lg bg-muted overflow-hidden mb-2">
                  {p.image_url && (
                    <img
                      src={p.image_url}
                      alt={p.name_ar}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  )}
                </div>
                <p className="text-xs font-medium line-clamp-2 leading-snug">{p.name_ar}</p>
                <p className="text-sm font-bold text-primary mt-1">
                  {formatMAD(getUnitPrice(p, partnerType, p.minimum_order || 1).unitPrice)}
                </p>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* Sticky bottom cart bar */}
      {totalQty > 0 && !placed && (
        <div className="fixed bottom-0 inset-x-0 z-40 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80 shadow-[0_-8px_24px_-12px_rgba(0,0,0,0.15)]">
          <div className="container mx-auto max-w-5xl flex items-center gap-3 p-3">
            <Button
              variant="outline"
              size="icon"
              onClick={() => setCartOpen(true)}
              className="relative h-11 w-11 shrink-0"
              aria-label={`فتح السلة، ${totalQty} منتج`}
            >
              <ShoppingCart className="h-5 w-5" />
              <span className="absolute -top-1 -end-1 bg-warning text-warning-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                {totalQty}
              </span>
            </Button>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">الإجمالي</p>
              <p className="text-base font-bold tabular-nums">{formatMAD(cartTotal)}</p>
            </div>
            <Button
              size="lg"
              onClick={() => setCartOpen(true)}
              className="font-semibold gap-2"
            >
              متابعة
              <ShoppingCart className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      {/* Cart drawer */}
      <Sheet open={cartOpen} onOpenChange={setCartOpen}>
        <SheetContent side="left" className="flex flex-col">
          <SheetHeader>
            <SheetTitle>سلة الطلب ({totalQty})</SheetTitle>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto py-4 space-y-3">
            {priced.length === 0 ? (
              <div className="text-center text-sm text-muted-foreground py-12">
                السلة فارغة
              </div>
            ) : (
              priced.map(({ item, unitPrice, lineTotal }) => {
                const pack = Math.max(1, item.pack_size ?? 1);
                const minOrder = Math.max(1, item.minimum_order ?? 1);
                return (
                  <div
                    key={item.id}
                    className="flex gap-3 p-3 rounded-lg border bg-card"
                  >
                    <img
                      src={item.image_url ?? ""}
                      alt={item.name_ar}
                      className="h-16 w-16 rounded-md object-cover bg-muted"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{item.name_ar}</p>
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <span>{formatMAD(unitPrice)}</span>
                        <span>×</span>
                        <span>{item.qty}</span>
                        <span className="font-semibold text-foreground">
                          = {formatMAD(lineTotal)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 mt-2">
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => {
                            const next = item.qty - pack;
                            if (next < minOrder) removeItem(item.id);
                            else setQty(item.id, next);
                          }}
                          aria-label="إنقاص"
                        >
                          <Minus className="h-3 w-3" />
                        </Button>
                        <span className="text-sm font-medium w-8 text-center tabular-nums">
                          {item.qty}
                        </span>
                        <Button
                          size="icon"
                          variant="outline"
                          className="h-7 w-7"
                          onClick={() => setQty(item.id, item.qty + pack)}
                          aria-label="زيادة"
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 mr-auto text-destructive"
                          onClick={() => removeItem(item.id)}
                          aria-label="حذف"
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
          {priced.length > 0 && (
            <SheetFooter className="flex-col gap-3 sm:flex-col border-t pt-4">
              <div className="flex items-center justify-between w-full">
                <span className="text-muted-foreground">الإجمالي</span>
                <span className="text-lg font-bold">{formatMAD(cartTotal)}</span>
              </div>
              <Button
                onClick={placeOrder}
                disabled={submitting}
                size="lg"
                className="w-full font-semibold"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin ml-2" />}
                إرسال الطلب
              </Button>
            </SheetFooter>
          )}
        </SheetContent>
      </Sheet>

      {/* Success dialog with optional WhatsApp share */}
      <Dialog open={!!placed} onOpenChange={(o) => !o && setPlaced(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-success" />
              تم إرسال الطلب
            </DialogTitle>
            <DialogDescription>
              {placed && (
                <>
                  رقم الطلب:{" "}
                  <span className="font-semibold text-foreground">{placed.number}</span>
                  <br />
                  الإجمالي:{" "}
                  <span className="font-semibold text-foreground">
                    {formatMAD(placed.total)}
                  </span>{" "}
                  • {placed.itemsCount} منتج
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex-col sm:flex-row gap-2">
            {placed && (
              <Button
                asChild
                variant="outline"
                className="gap-2"
              >
                <a
                  href={buildWhatsAppHref(placed)}
                  target="_blank"
                  rel="noreferrer"
                >
                  <MessageCircle className="h-4 w-4" />
                  إشعار عبر واتساب
                </a>
              </Button>
            )}
            <Button onClick={() => setPlaced(null)}>متابعة التسوق</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
