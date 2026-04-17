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
