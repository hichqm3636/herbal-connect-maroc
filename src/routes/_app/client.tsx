import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Sparkles, Store } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { ClientForbidden } from "@/components/ClientForbidden";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { trackClient } from "@/lib/clientAnalytics";
import { ClientHero } from "@/components/client/ClientHero";
import { QuickActions, type ReorderableItem } from "@/components/client/QuickActions";
import {
  Recommendations,
  type RecommendedProduct,
} from "@/components/client/Recommendations";
import {
  OrdersPreview,
  type PreviewOrder,
} from "@/components/client/OrdersPreview";
import {
  ReorderSection,
  type ReorderProduct,
} from "@/components/client/ReorderSection";
import { AlertsBanner, type ClientAlert } from "@/components/client/AlertsBanner";
import { ClientOnboarding } from "@/components/client/ClientOnboarding";
import { LoyaltyCard } from "@/components/client/LoyaltyCard";
import { SampleVendors } from "@/components/client/SampleVendors";
import type { CartProduct } from "@/hooks/useCart";

export const Route = createFileRoute("/_app/client")({
  component: ClientDashboard,
  head: () => ({
    meta: [
      { title: "حسابي — Nexora" },
      {
        name: "description",
        content:
          "لوحة تحكم العميل: أعد طلباتك بسرعة، تابع طلباتك الجارية، واكتشف منتجات مقترحة.",
      },
    ],
  }),
});

const IN_FLIGHT_STATUSES = new Set(["pending", "confirmed", "processing", "shipped"]);

interface OrderRow {
  id: string;
  order_number: string;
  status: string;
  total_mad: number;
  created_at: string;
  company_id: string;
  companies: {
    id: string;
    name: string;
    display_name: string | null;
    logo_url: string | null;
    slug: string;
  } | null;
  order_items: {
    quantity: number;
    unit_price_mad: number;
    products: {
      id: string;
      name_ar: string;
      image_url: string | null;
      stock: number | null;
      price_mad: number;
      minimum_order: number | null;
      pack_size: number | null;
    } | null;
  }[];
}

interface DashboardData {
  firstName: string;
  recentOrders: PreviewOrder[];
  trackableOrderId: string | null;
  lastOrderItems: ReorderableItem[];
  reorderProducts: ReorderProduct[];
  recommendations: RecommendedProduct[];
  alerts: ClientAlert[];
}

async function loadDashboard(userId: string): Promise<DashboardData> {
  // Profile (display name)
  const profilePromise = supabase
    .from("profiles")
    .select("full_name")
    .eq("id", userId)
    .maybeSingle();

  // All orders for this buyer (RLS scopes to buyer_id = auth.uid())
  const ordersPromise = supabase
    .from("orders")
    .select(
      `id, order_number, status, total_mad, created_at, company_id,
       companies:company_id ( id, name, display_name, logo_url, slug ),
       order_items (
         quantity, unit_price_mad,
         products:product_id (
           id, name_ar, image_url, stock, price_mad, minimum_order, pack_size
         )
       )`,
    )
    .eq("buyer_id", userId)
    .order("created_at", { ascending: false })
    .limit(20);

  const [{ data: profile }, { data: orderData }] = await Promise.all([
    profilePromise,
    ordersPromise,
  ]);

  const fullName = (profile as { full_name?: string | null } | null)?.full_name?.trim() || "";
  const firstName = fullName ? fullName.split(/\s+/)[0] : "عزيزي العميل";

  const orders = (orderData ?? []) as unknown as OrderRow[];

  // ---- Recent orders snapshot (last 3)
  const recentOrders: PreviewOrder[] = orders.slice(0, 3).map((o) => ({
    id: o.id,
    order_number: o.order_number,
    status: o.status,
    total_mad: Number(o.total_mad ?? 0),
    created_at: o.created_at,
    vendor_name:
      o.companies?.display_name || o.companies?.name || "بائع",
    vendor_logo: o.companies?.logo_url ?? null,
  }));

  // ---- In-flight order to track
  const trackable = orders.find((o) => IN_FLIGHT_STATUSES.has(o.status));
  const trackableOrderId = trackable?.id ?? null;

  // ---- Last order items (for "إعادة آخر طلب")
  const lastOrder = orders[0];
  const lastOrderItems: ReorderableItem[] = (lastOrder?.order_items ?? [])
    .filter((it) => it.products && (it.products.stock ?? 1) !== 0)
    .map((it) => {
      const p = it.products!;
      const product: CartProduct = {
        id: p.id,
        name_ar: p.name_ar,
        price_mad: Number(p.price_mad ?? it.unit_price_mad),
        image_url: p.image_url,
        stock: p.stock,
        vendor_id: lastOrder!.company_id,
        vendor_slug: lastOrder!.companies?.slug,
        vendor_name:
          lastOrder!.companies?.display_name ||
          lastOrder!.companies?.name ||
          undefined,
        minimum_order: p.minimum_order ?? 1,
        pack_size: p.pack_size ?? 1,
      };
      return { product, qty: it.quantity };
    });

  // ---- Reorder cards: most-ordered products across history (top 4)
  const productAgg = new Map<
    string,
    { qty: number; product: CartProduct; last_qty: number }
  >();
  for (const o of orders) {
    for (const it of o.order_items ?? []) {
      const p = it.products;
      if (!p || (p.stock ?? 1) === 0) continue;
      const existing = productAgg.get(p.id);
      const cartProduct: CartProduct = {
        id: p.id,
        name_ar: p.name_ar,
        price_mad: Number(p.price_mad ?? it.unit_price_mad),
        image_url: p.image_url,
        stock: p.stock,
        vendor_id: o.company_id,
        vendor_slug: o.companies?.slug,
        vendor_name:
          o.companies?.display_name || o.companies?.name || undefined,
        minimum_order: p.minimum_order ?? 1,
        pack_size: p.pack_size ?? 1,
      };
      if (existing) {
        existing.qty += it.quantity;
      } else {
        productAgg.set(p.id, {
          qty: it.quantity,
          product: cartProduct,
          last_qty: it.quantity,
        });
      }
    }
  }
  const reorderProducts: ReorderProduct[] = Array.from(productAgg.values())
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 4)
    .map((x) => ({ ...x.product, last_qty: x.last_qty }));

  // ---- Smart recommendations: top sellers from the last vendor the user
  // bought from, excluding products already in reorderProducts.
  let recommendations: RecommendedProduct[] = [];
  if (lastOrder?.companies?.slug) {
    const excludeIds = new Set(reorderProducts.map((p) => p.id));
    const { data: topRows } = await supabase
      .from("products")
      .select(
        "id, name_ar, image_url, stock, price_mad, minimum_order, pack_size, company_id",
      )
      .eq("company_id", lastOrder.company_id)
      .eq("active", true)
      .order("created_at", { ascending: false })
      .limit(12);

    const slug = lastOrder.companies.slug;
    const vendorName =
      lastOrder.companies.display_name || lastOrder.companies.name;
    recommendations = (topRows ?? [])
      .filter((p) => !excludeIds.has(p.id) && (p.stock ?? 1) !== 0)
      .slice(0, 8)
      .map((p) => ({
        id: p.id,
        name_ar: p.name_ar,
        price_mad: Number(p.price_mad),
        image_url: p.image_url,
        stock: p.stock,
        vendor_id: p.company_id,
        vendor_slug: slug,
        vendor_name: vendorName,
        minimum_order: p.minimum_order ?? 1,
        pack_size: p.pack_size ?? 1,
        source: "top_seller" as const,
      }));
  }

  // ---- Alerts derived from in-flight orders
  const alerts: ClientAlert[] = [];
  for (const o of orders.slice(0, 5)) {
    const vendor =
      o.companies?.display_name || o.companies?.name || "البائع";
    if (o.status === "processing" || o.status === "confirmed") {
      alerts.push({
        id: `proc-${o.id}`,
        kind: "processing",
        title: "طلبك قيد المعالجة",
        body: `طلب #${o.order_number} لدى ${vendor}`,
        href: `/client/orders?focus=${o.id}`,
      });
    } else if (o.status === "shipped") {
      alerts.push({
        id: `ship-${o.id}`,
        kind: "shipped",
        title: "طلبك تم شحنه 🚚",
        body: `طلب #${o.order_number} في الطريق إليك`,
        href: `/client/orders?focus=${o.id}`,
      });
    }
  }

  return {
    firstName,
    recentOrders,
    trackableOrderId,
    lastOrderItems,
    reorderProducts,
    recommendations,
    alerts,
  };
}

function ClientDashboard() {
  const { user, loading: authLoading, session, isClient, marketplaceRole } = useAuth();

  // Non-client logged-in users land here from the sidebar link → show inline
  // forbidden panel instead of fetching client-only data.
  if (!authLoading && session && !isClient) {
    return <ClientForbidden role={marketplaceRole} />;
  }

  const { data, isLoading, isError } = useQuery({
    queryKey: ["client-dashboard", user?.id],
    queryFn: () => loadDashboard(user!.id),
    enabled: !!user && !authLoading && isClient,
    staleTime: 30_000,
  });

  // Track dashboard view exactly once per user/session.
  useEffect(() => {
    if (user?.id) {
      trackClient("client_dashboard_view", { user_id: user.id });
    }
  }, [user?.id]);

  if (authLoading || isLoading || !data) {
    return (
      <div className="space-y-6" dir="rtl">
        <Skeleton className="h-40 w-full rounded-3xl" />
        <div className="grid grid-cols-3 gap-3">
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
          <Skeleton className="h-24 rounded-xl" />
        </div>
        <Skeleton className="h-48 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full rounded-2xl" />
        {!data && !isLoading && (
          <div className="flex justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-16 text-center" dir="rtl">
        <p className="text-sm text-muted-foreground">
          تعذّر تحميل لوحة التحكم. حاول مرة أخرى.
        </p>
        <Button asChild>
          <Link to="/vendors">
            <Store className="h-4 w-4" />
            تصفّح البائعين
          </Link>
        </Button>
      </div>
    );
  }

  const hasNoOrders = data.recentOrders.length === 0;

  return (
    <div className="space-y-6 pb-8" dir="rtl">
      <ClientHero firstName={data.firstName} />

      {data.alerts.length > 0 && <AlertsBanner alerts={data.alerts} />}

      <QuickActions
        lastOrderItems={data.lastOrderItems}
        trackableOrderId={data.trackableOrderId}
      />

      {hasNoOrders ? (
        <>
          <ClientOnboarding />
          <SampleVendors />
        </>
      ) : (
        <>
          <LoyaltyCard userId={user!.id} />
          <Recommendations items={data.recommendations} />
          <OrdersPreview orders={data.recentOrders} />
          <ReorderSection products={data.reorderProducts} />
        </>
      )}
    </div>
  );
}
