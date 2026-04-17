import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Plus, PackageSearch } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useCart } from "@/hooks/useCart";
import { formatMAD } from "@/lib/format";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/products")({
  component: ProductsPage,
  head: () => ({ meta: [{ title: "المنتجات — بوابة هيرباليفي" }] }),
});

interface Product {
  id: string;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  image_url: string | null;
  category: string | null;
  stock: number;
}

function ProductsPage() {
  const { addItem } = useCart();
  const [products, setProducts] = useState<Product[]>([]);
  const [search, setSearch] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("products")
        .select("*")
        .eq("active", true)
        .order("name_ar");
      setProducts(data ?? []);
    })();
  }, []);

  const filtered = useMemo(
    () =>
      products.filter(
        (p) =>
          p.name_ar.includes(search) ||
          (p.category ?? "").includes(search) ||
          p.description_ar.includes(search),
      ),
    [products, search],
  );

  const addToCart = (p: Product) => {
    addItem(
      { id: p.id, name_ar: p.name_ar, price_mad: p.price_mad, image_url: p.image_url, stock: p.stock },
      1,
    );
    toast.success("تمت إضافة المنتج إلى السلة");
  };

  const placeOrder = async () => {
    if (!user || cart.length === 0) return;
    setSubmitting(true);
    const points = Math.floor(total / 100);
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        distributor_id: user.id,
        total_mad: total,
        points_earned: points,
        status: "pending",
      })
      .select("id")
      .single();
    if (error || !order) {
      toast.error("تعذر إنشاء الطلب");
      setSubmitting(false);
      return;
    }
    const items = cart.map((i) => ({
      order_id: order.id,
      product_id: i.id,
      quantity: i.qty,
      unit_price_mad: i.price_mad,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(items);
    if (itemsErr) {
      toast.error("تعذر حفظ عناصر الطلب");
      setSubmitting(false);
      return;
    }
    toast.success(`تم إرسال الطلب بنجاح • +${points} نقطة`);
    clear();
    setOpen(false);
    setSubmitting(false);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold tracking-tight">كتالوج المنتجات</h1>
          <p className="text-sm text-muted-foreground mt-1">اختر المنتجات وأضفها للسلة</p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            placeholder="ابحث عن منتج..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full sm:w-64"
          />
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button className="relative gap-2">
                <ShoppingCart className="h-4 w-4" />
                السلة
                {totalQty > 0 && (
                  <span className="absolute -top-2 -right-2 bg-warning text-warning-foreground text-xs font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
                    {totalQty}
                  </span>
                )}
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="flex flex-col">
              <SheetHeader>
                <SheetTitle>سلة الطلب</SheetTitle>
                <SheetDescription>راجع منتجاتك قبل إرسال الطلب</SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto py-4 space-y-3">
                {cart.length === 0 ? (
                  <div className="text-center text-sm text-muted-foreground py-12">
                    السلة فارغة
                  </div>
                ) : (
                  cart.map((item) => (
                    <div key={item.id} className="flex gap-3 p-3 rounded-lg border bg-card">
                      <img
                        src={item.image_url ?? ""}
                        alt={item.name_ar}
                        className="h-16 w-16 rounded-md object-cover bg-muted"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-sm truncate">{item.name_ar}</p>
                        <p className="text-xs text-muted-foreground">{formatMAD(item.price_mad)}</p>
                        <div className="flex items-center gap-2 mt-2">
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, -1)}>
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="text-sm font-medium w-6 text-center">{item.qty}</span>
                          <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(item.id, 1)}>
                            <Plus className="h-3 w-3" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7 mr-auto text-destructive" onClick={() => removeItem(item.id)}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
              {cart.length > 0 && (
                <SheetFooter className="flex-col gap-3 sm:flex-col border-t pt-4">
                  <div className="flex items-center justify-between w-full">
                    <span className="text-muted-foreground">الإجمالي</span>
                    <span className="text-lg font-bold">{formatMAD(total)}</span>
                  </div>
                  <Button onClick={placeOrder} disabled={submitting} className="w-full" size="lg">
                    {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                    تأكيد الطلب
                  </Button>
                </SheetFooter>
              )}
            </SheetContent>
          </Sheet>
        </div>
      </div>

      {filtered.length === 0 ? (
        <Card className="p-12 text-center text-muted-foreground">
          <PackageSearch className="h-10 w-10 mx-auto mb-3 opacity-50" />
          لا توجد منتجات مطابقة
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {filtered.map((p) => (
            <Card key={p.id} className="overflow-hidden flex flex-col shadow-soft hover:shadow-elegant transition-shadow group">
              <Link
                to="/products/$productId"
                params={{ productId: p.id }}
                className="aspect-square bg-muted overflow-hidden block"
              >
                <img
                  src={p.image_url ?? ""}
                  alt={p.name_ar}
                  loading="lazy"
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                />
              </Link>
              <div className="p-4 flex flex-col flex-1 gap-2">
                {p.category && (
                  <Badge variant="secondary" className="w-fit text-xs">{p.category}</Badge>
                )}
                <Link
                  to="/products/$productId"
                  params={{ productId: p.id }}
                  className="font-semibold leading-snug line-clamp-2 hover:text-primary transition-colors"
                >
                  {p.name_ar}
                </Link>
                <p className="text-xs text-muted-foreground line-clamp-2 flex-1">{p.description_ar}</p>
                <div className="flex items-center justify-between mt-2">
                  <span className="text-lg font-bold text-primary">{formatMAD(p.price_mad)}</span>
                  <Button size="sm" onClick={() => addToCart(p)} className="gap-1">
                    <Plus className="h-3.5 w-3.5" />
                    إضافة
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
