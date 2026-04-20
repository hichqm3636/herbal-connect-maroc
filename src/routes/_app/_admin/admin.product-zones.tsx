import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { Loader2, MapPin, Package, Save } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_admin/admin/product-zones")({
  component: AdminProductZones,
  head: () => ({ meta: [{ title: "تقييد المنتجات بالمناطق — DistribHub" }] }),
});

interface ProductLite {
  id: string;
  name_ar: string;
  sku: string | null;
}
interface ZoneLite {
  id: string;
  name: string;
}

function AdminProductZones() {
  const { companyId } = useAuth();
  const [products, setProducts] = useState<ProductLite[]>([]);
  const [zones, setZones] = useState<ZoneLite[]>([]);
  const [search, setSearch] = useState("");
  const [selectedProductId, setSelectedProductId] = useState<string>("");
  const [allowedZoneIds, setAllowedZoneIds] = useState<Set<string>>(new Set());
  const [originalIds, setOriginalIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [loadingProduct, setLoadingProduct] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!companyId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: prods }, { data: zs }] = await Promise.all([
        supabase
          .from("products")
          .select("id, name_ar, sku")
          .eq("company_id", companyId)
          .order("name_ar"),
        supabase
          .from("territories")
          .select("id, name")
          .eq("company_id", companyId)
          .order("name"),
      ]);
      if (cancelled) return;
      setProducts((prods ?? []) as ProductLite[]);
      setZones((zs ?? []) as ZoneLite[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const loadProductZones = useCallback(
    async (productId: string) => {
      if (!productId) return;
      setLoadingProduct(true);
      const { data } = await supabase
        .from("product_zones")
        .select("zone_id")
        .eq("product_id", productId);
      const ids = new Set((data ?? []).map((r) => r.zone_id));
      setAllowedZoneIds(ids);
      setOriginalIds(new Set(ids));
      setLoadingProduct(false);
    },
    [],
  );

  useEffect(() => {
    if (selectedProductId) void loadProductZones(selectedProductId);
    else {
      setAllowedZoneIds(new Set());
      setOriginalIds(new Set());
    }
  }, [selectedProductId, loadProductZones]);

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return products;
    return products.filter(
      (p) =>
        p.name_ar.toLowerCase().includes(q) ||
        (p.sku ?? "").toLowerCase().includes(q),
    );
  }, [products, search]);

  const toggleZone = (zoneId: string) => {
    setAllowedZoneIds((prev) => {
      const next = new Set(prev);
      if (next.has(zoneId)) next.delete(zoneId);
      else next.add(zoneId);
      return next;
    });
  };

  const dirty = useMemo(() => {
    if (allowedZoneIds.size !== originalIds.size) return true;
    for (const id of allowedZoneIds) if (!originalIds.has(id)) return true;
    return false;
  }, [allowedZoneIds, originalIds]);

  const save = async () => {
    if (!companyId || !selectedProductId) return;
    setSaving(true);
    const toAdd = [...allowedZoneIds].filter((id) => !originalIds.has(id));
    const toRemove = [...originalIds].filter((id) => !allowedZoneIds.has(id));

    if (toRemove.length > 0) {
      const { error } = await supabase
        .from("product_zones")
        .delete()
        .eq("product_id", selectedProductId)
        .in("zone_id", toRemove);
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    if (toAdd.length > 0) {
      const { error } = await supabase.from("product_zones").insert(
        toAdd.map((zone_id) => ({
          product_id: selectedProductId,
          zone_id,
          company_id: companyId,
        })),
      );
      if (error) {
        setSaving(false);
        toast.error(error.message);
        return;
      }
    }
    setOriginalIds(new Set(allowedZoneIds));
    setSaving(false);
    toast.success("تم حفظ التقييد");
  };

  const selectedProduct = products.find((p) => p.id === selectedProductId);
  const noRestriction = selectedProductId && allowedZoneIds.size === 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl md:text-3xl font-bold tracking-tight flex items-center gap-2">
          <Package className="h-6 w-6 text-primary" />
          تقييد المنتجات بالمناطق
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          اختر المنتج ثم حدّد المناطق المسموح بيعه فيها. إذا لم تحدّد أي منطقة فالمنتج متاح في
          كل المناطق.
        </p>
      </div>

      <Card className="p-4 shadow-soft space-y-3">
        <div className="space-y-2">
          <Label>اختر المنتج</Label>
          {loading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              <Input
                placeholder="ابحث بالاسم أو SKU..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
              <Select value={selectedProductId} onValueChange={setSelectedProductId}>
                <SelectTrigger>
                  <SelectValue placeholder="اختر منتجاً" />
                </SelectTrigger>
                <SelectContent>
                  {filteredProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name_ar}
                      {p.sku ? ` · ${p.sku}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
        </div>
      </Card>

      {selectedProduct && (
        <Card className="p-4 shadow-soft space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold truncate">{selectedProduct.name_ar}</p>
              {selectedProduct.sku && (
                <p className="text-xs text-muted-foreground" dir="ltr">
                  {selectedProduct.sku}
                </p>
              )}
            </div>
            {noRestriction && (
              <Badge variant="outline" className="shrink-0">
                متاح في كل المناطق
              </Badge>
            )}
          </div>

          {loadingProduct ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : zones.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              لا توجد مناطق. أنشئ مناطق أولاً من صفحة إدارة المناطق.
            </p>
          ) : (
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {zones.map((z) => {
                const checked = allowedZoneIds.has(z.id);
                return (
                  <li key={z.id}>
                    <label
                      className="flex items-center gap-3 rounded-md border p-3 cursor-pointer hover:bg-accent/40 transition-colors"
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggleZone(z.id)}
                      />
                      <MapPin className="h-4 w-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{z.name}</span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}

          <div className="flex justify-end">
            <Button onClick={save} disabled={!dirty || saving} className="gap-2">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              حفظ التقييد
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
