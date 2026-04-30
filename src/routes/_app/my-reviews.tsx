import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MessageSquare, Edit2, Trash2, Store, Package } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { StarRating } from "@/components/StarRating";
import { ReviewDialog } from "@/components/ReviewDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateAr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/my-reviews")({
  component: MyReviewsPage,
  head: () => ({ meta: [{ title: "مراجعاتي — Nexora" }] }),
});

interface ProductReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  vendor_response: string | null;
  product_id: string;
  company_id: string;
  products: { id: string; name_ar: string; image_url: string | null } | null;
  companies: { id: string; name: string; display_name: string | null; slug: string } | null;
}

interface VendorReview {
  id: string;
  rating: number;
  body: string | null;
  status: "pending" | "approved" | "rejected";
  created_at: string;
  vendor_response: string | null;
  company_id: string;
  companies: { id: string; name: string; display_name: string | null; slug: string; logo_url: string | null } | null;
}

const STATUS_LABELS: Record<string, string> = {
  pending: "قيد المراجعة",
  approved: "منشورة",
  rejected: "مرفوضة",
};
const STATUS_CLASSES: Record<string, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

function MyReviewsPage() {
  const { user } = useAuth();
  const [products, setProducts] = useState<ProductReview[]>([]);
  const [vendors, setVendors] = useState<VendorReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<
    | null
    | {
        kind: "product";
        productId: string;
        productName: string;
        companyId: string;
        companyName: string;
      }
    | { kind: "vendor"; companyId: string; companyName: string }
  >(null);

  const load = async () => {
    if (!user) return;
    setLoading(true);
    const [pRes, vRes] = await Promise.all([
      supabase
        .from("product_reviews")
        .select(
          `id, rating, title, body, status, created_at, vendor_response, product_id, company_id,
           products:product_id ( id, name_ar, image_url ),
           companies:company_id ( id, name, display_name, slug )`,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_reviews")
        .select(
          `id, rating, body, status, created_at, vendor_response, company_id,
           companies:company_id ( id, name, display_name, slug, logo_url )`,
        )
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
    ]);
    setProducts((pRes.data ?? []) as unknown as ProductReview[]);
    setVendors((vRes.data ?? []) as unknown as VendorReview[]);
    setLoading(false);
  };

  useEffect(() => {
    if (user) load();
  }, [user]);

  const removeProduct = async (id: string) => {
    if (!confirm("حذف هذه المراجعة؟")) return;
    const { error } = await supabase.from("product_reviews").delete().eq("id", id);
    if (error) toast.error("تعذّر الحذف");
    else {
      setProducts((p) => p.filter((r) => r.id !== id));
      toast.success("تم الحذف");
    }
  };
  const removeVendor = async (id: string) => {
    if (!confirm("حذف هذه المراجعة؟")) return;
    const { error } = await supabase.from("vendor_reviews").delete().eq("id", id);
    if (error) toast.error("تعذّر الحذف");
    else {
      setVendors((p) => p.filter((r) => r.id !== id));
      toast.success("تم الحذف");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const total = products.length + vendors.length;

  return (
    <div className="space-y-6" dir="rtl">
      <header className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold">
            <MessageSquare className="h-6 w-6 text-primary" />
            مراجعاتي
          </h1>
          <p className="text-sm text-muted-foreground">
            تتبّع مراجعاتك للمنتجات والمتاجر وحالة كلٍّ منها.
          </p>
        </div>
        {total > 0 && <Badge variant="secondary">{total} مراجعة</Badge>}
      </header>

      {total === 0 && (
        <Card className="flex flex-col items-center gap-3 p-10 text-center">
          <MessageSquare className="h-10 w-10 text-muted-foreground" />
          <div>
            <p className="font-semibold">لا توجد مراجعات بعد</p>
            <p className="mt-1 text-sm text-muted-foreground">
              من صفحة <Link to="/orders" className="text-primary underline">طلباتي</Link> يمكنك تقييم المنتجات والمتاجر.
            </p>
          </div>
        </Card>
      )}

      {products.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Package className="h-4 w-4" />
            مراجعات المنتجات ({products.length})
          </h2>
          <ul className="space-y-3">
            {products.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  {r.products?.image_url ? (
                    <img
                      src={r.products.image_url}
                      alt=""
                      className="h-14 w-14 shrink-0 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <Package className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">{r.products?.name_ar ?? "منتج"}</p>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", STATUS_CLASSES[r.status])}
                      >
                        {STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StarRating value={r.rating} readOnly size="sm" />
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateAr(r.created_at)}
                      </span>
                    </div>
                    {r.title && <p className="mt-2 text-sm font-medium">{r.title}</p>}
                    {r.body && (
                      <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">
                        {r.body}
                      </p>
                    )}
                    {r.vendor_response && (
                      <div className="mt-3 rounded-md border-r-2 border-primary bg-primary/5 p-2 text-xs">
                        <p className="font-semibold text-primary">رد المورد</p>
                        <p className="mt-1 whitespace-pre-line text-muted-foreground">
                          {r.vendor_response}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() =>
                        setEditing({
                          kind: "product",
                          productId: r.product_id,
                          productName: r.products?.name_ar ?? "",
                          companyId: r.company_id,
                          companyName: r.companies?.display_name ?? r.companies?.name ?? "",
                        })
                      }
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      تعديل
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive"
                    onClick={() => removeProduct(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </Button>
                  {r.companies?.slug && (
                    <Button asChild size="sm" variant="ghost" className="ms-auto gap-1">
                      <Link to="/store/$slug" params={{ slug: r.companies.slug }}>
                        <Store className="h-3.5 w-3.5" />
                        المتجر
                      </Link>
                    </Button>
                  )}
                </div>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {vendors.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-2 text-sm font-bold">
            <Store className="h-4 w-4" />
            مراجعات المتاجر ({vendors.length})
          </h2>
          <ul className="space-y-3">
            {vendors.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-start gap-3">
                  {r.companies?.logo_url ? (
                    <img
                      src={r.companies.logo_url}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border"
                    />
                  ) : (
                    <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <Store className="h-5 w-5" />
                    </div>
                  )}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-sm font-semibold">
                        {r.companies?.display_name ?? r.companies?.name ?? "متجر"}
                      </p>
                      <Badge
                        variant="outline"
                        className={cn("text-[10px]", STATUS_CLASSES[r.status])}
                      >
                        {STATUS_LABELS[r.status]}
                      </Badge>
                    </div>
                    <div className="mt-1 flex items-center gap-2">
                      <StarRating value={r.rating} readOnly size="sm" />
                      <span className="text-[11px] text-muted-foreground">
                        {formatDateAr(r.created_at)}
                      </span>
                    </div>
                    {r.body && (
                      <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">
                        {r.body}
                      </p>
                    )}
                    {r.vendor_response && (
                      <div className="mt-3 rounded-md border-r-2 border-primary bg-primary/5 p-2 text-xs">
                        <p className="font-semibold text-primary">رد المورد</p>
                        <p className="mt-1 whitespace-pre-line text-muted-foreground">
                          {r.vendor_response}
                        </p>
                      </div>
                    )}
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-2 border-t pt-3">
                  {r.status === "pending" && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1"
                      onClick={() =>
                        setEditing({
                          kind: "vendor",
                          companyId: r.company_id,
                          companyName: r.companies?.display_name ?? r.companies?.name ?? "",
                        })
                      }
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                      تعديل
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="gap-1 text-destructive"
                    onClick={() => removeVendor(r.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    حذف
                  </Button>
                </div>
              </Card>
            ))}
          </ul>
        </section>
      )}

      {editing && editing.kind === "product" && (
        <ReviewDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          kind="product"
          productId={editing.productId}
          productName={editing.productName}
          companyId={editing.companyId}
          companyName={editing.companyName}
          onSubmitted={load}
        />
      )}
      {editing && editing.kind === "vendor" && (
        <ReviewDialog
          open
          onOpenChange={(o) => !o && setEditing(null)}
          kind="vendor"
          companyId={editing.companyId}
          companyName={editing.companyName}
          onSubmitted={load}
        />
      )}
    </div>
  );
}
