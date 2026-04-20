import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, Loader2, Minus, Plus, ShoppingCart, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatMAD } from "@/lib/format";
import { getUnitPrice, parseTiers, type PartnerType, PARTNER_TYPE_LABELS } from "@/lib/pricing";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/create-order/$clientId")({
  component: CreateOrderForClient,
  head: () => ({ meta: [{ title: "إنشاء طلب — DistribHub" }] }),
});

interface ClientLite {
  id: string;
  full_name: string;
  account_type: PartnerType;
  company_id: string | null;
  territory_id: string | null;
}

interface ProductLite {
  id: string;
  name_ar: string;
  sku: string | null;
  price_mad: number;
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  minimum_order: number;
  stock: number;
  price_tiers: ReturnType<typeof parseTiers>;
  cost_price: number | null;
}

function CreateOrderForClient() {
  const { clientId } = Route.useParams();
  const navigate = useNavigate();
  const { companyId, isSuperAdmin } = useAuth();

  const [client, setClient] = useState<ClientLite | null>(null);
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data: c } = await supabase
        .from("profiles")
        .select("id, full_name, account_type, company_id, territory_id")
        .eq("id", clientId)
        .maybeSingle();
      if (!c) {
        setClient(null);
        setLoading(false);
        return;
      }
      const cli = c as unknown as ClientLite;
      setClient(cli);
      const targetCompany = cli.company_id;
      if (!targetCompany) {
        setLoading(false);
        return;
      }
      const { data: prods } = await supabase
        .from("products")
        .select(
          "id, name_ar, sku, price_mad, rrp_price, pharmacy_price, map_price, minimum_order, stock, price_tiers, cost_price, active",
        )
        .eq("company_id", targetCompany)
        .eq("active", true)
        .order("name_ar");
      const list = (prods ?? []).map((p) => ({
        ...(p as unknown as Omit<ProductLite, "price_tiers">),
        price_tiers: parseTiers((p as { price_tiers: unknown }).price_tiers),
      })) as ProductLite[];
      setProducts(list);
      setLoading(false);
    })();
  }, [clientId]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name_ar.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const cartLines = useMemo(() => {
    if (!client) return [];
    return Object.entries(qty)
      .filter(([, q]) => q > 0)
      .map(([pid, q]) => {
        const p = products.find((x) => x.id === pid);
        if (!p) return null;
        const { unitPrice } = getUnitPrice(p, client.account_type, q);
        return { product: p, qty: q, unitPrice, lineTotal: unitPrice * q };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
  }, [qty, products, client]);

  const total = cartLines.reduce((s, l) => s + l.lineTotal, 0);

  const setItemQty = (id: string, n: number) => {
    setQty((prev) => {
      const next = { ...prev };
      if (n <= 0) delete next[id];
      else next[id] = n;
      return next;
    });
  };

  const submit = async () => {
    if (!client || cartLines.length === 0) return;
    if (!client.company_id) {
      toast.error("العميل غير مرتبط بشركة");
      return;
    }
    if (!isSuperAdmin && companyId && companyId !== client.company_id) {
      toast.error("لا يمكنك إنشاء طلب لعميل من شركة أخرى");
      return;
    }
    setSubmitting(true);
    const { data: created, error } = await supabase
      .from("orders")
      .insert([
        {
          distributor_id: client.id,
          company_id: client.company_id,
          total_mad: total,
          status: "pending",
          notes: "أُنشئ من قبل الإدارة نيابةً عن العميل",
          // order_number is auto-assigned by the set_order_number trigger when NULL
          order_number: null as unknown as string,
        },
      ])
      .select("id, order_number")
      .single();
    if (error || !created) {
      setSubmitting(false);
      toast.error(error?.message ?? "تعذر إنشاء الطلب");
      return;
    }
    const itemsPayload = cartLines.map((l) => ({
      order_id: created.id,
      product_id: l.product.id,
      quantity: l.qty,
      unit_price_mad: l.unitPrice,
      cost_snapshot: l.product.cost_price,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
    setSubmitting(false);
    if (itemsErr) {
      toast.error(itemsErr.message);
      return;
    }
    toast.success("تم إنشاء الطلب");
    navigate({ to: "/admin/orders/$orderId", params: { orderId: created.id } });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!client) {
    return (
      <Card className="p-8 text-center" dir="rtl">
        <p className="text-muted-foreground">لم يُعثر على العميل.</p>
      </Card>
    );
  }

  return (
    <div className="space-y-6 pb-32" dir="rtl">
      <div>
        <Link
          to="/admin/distributors/$id"
          params={{ id: client.id }}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-3.5 w-3.5" />
          العودة إلى ملف العميل
        </Link>
        <h1 className="mt-2 text-2xl md:text-3xl font-bold tracking-tight">
          إنشاء طلب لـ {client.full_name}
        </h1>
        <Badge variant="outline" className="mt-2">
          {PARTNER_TYPE_LABELS[client.account_type] ?? client.account_type}
        </Badge>
      </div>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">المنتجات</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Input
            placeholder="بحث بالاسم أو SKU…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="divide-y">
            {filteredProducts.map((p) => {
              const cur = qty[p.id] ?? 0;
              const { unitPrice } = getUnitPrice(p, client.account_type, Math.max(cur, 1));
              return (
                <div key={p.id} className="flex items-center gap-3 py-2.5">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{p.name_ar}</p>
                    <p className="text-[11px] text-muted-foreground" dir="ltr">
                      {p.sku ?? "—"} · {formatMAD(unitPrice)}/وحدة · مخزون: {p.stock}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => setItemQty(p.id, Math.max(0, cur - 1))}
                      disabled={cur === 0}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <Input
                      type="number"
                      min={0}
                      max={p.stock}
                      value={cur}
                      onChange={(e) => setItemQty(p.id, Math.max(0, Math.min(p.stock, Number(e.target.value) || 0)))}
                      className="w-14 h-7 text-center text-sm"
                    />
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => setItemQty(p.id, Math.min(p.stock, cur + 1))}
                      disabled={cur >= p.stock}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </div>
              );
            })}
            {filteredProducts.length === 0 && (
              <p className="text-center text-sm text-muted-foreground py-6">
                لا توجد منتجات مطابقة
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {cartLines.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">ملخص الطلب</CardTitle>
          </CardHeader>
          <CardContent className="divide-y">
            {cartLines.map((l) => (
              <div key={l.product.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                <span className="truncate flex-1">{l.product.name_ar}</span>
                <span className="text-muted-foreground whitespace-nowrap">
                  {l.qty} × {formatMAD(l.unitPrice)}
                </span>
                <span className="font-semibold whitespace-nowrap">{formatMAD(l.lineTotal)}</span>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-6 w-6"
                  onClick={() => setItemQty(l.product.id, 0)}
                >
                  <Trash2 className="h-3 w-3" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between pt-3">
              <span className="font-semibold">الإجمالي</span>
              <span className="text-xl font-bold text-primary">{formatMAD(total)}</span>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="fixed bottom-0 inset-x-0 z-30 border-t bg-background/95 backdrop-blur p-3 shadow-lg">
        <div className="container mx-auto flex items-center justify-between gap-3">
          <div>
            <p className="text-xs text-muted-foreground">الإجمالي</p>
            <p className="font-bold text-lg">{formatMAD(total)}</p>
          </div>
          <Button onClick={submit} disabled={submitting || cartLines.length === 0} className="gap-2">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShoppingCart className="h-4 w-4" />}
            إنشاء الطلب
          </Button>
        </div>
      </div>
    </div>
  );
}
