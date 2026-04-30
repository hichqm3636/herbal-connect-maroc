import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Loader2,
  MessageSquare,
  Check,
  X,
  Reply,
  Package,
  Store,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { StarRating } from "@/components/StarRating";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { formatDateAr } from "@/lib/format";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

export const Route = createFileRoute("/_app/_vendor/vendor/reviews")({
  component: VendorReviewsPage,
  head: () => ({ meta: [{ title: "المراجعات — لوحة المورد" }] }),
});

type Status = "pending" | "approved" | "rejected";

interface ProductReview {
  id: string;
  rating: number;
  title: string | null;
  body: string | null;
  status: Status;
  created_at: string;
  user_id: string;
  product_id: string;
  vendor_response: string | null;
  vendor_responded_at: string | null;
  products: { id: string; name_ar: string; image_url: string | null } | null;
}

interface VendorReview {
  id: string;
  rating: number;
  body: string | null;
  status: Status;
  created_at: string;
  user_id: string;
  vendor_response: string | null;
  vendor_responded_at: string | null;
}

const STATUS_LABELS: Record<Status, string> = {
  pending: "بانتظار الموافقة",
  approved: "منشورة",
  rejected: "مرفوضة",
};
const STATUS_CLASSES: Record<Status, string> = {
  pending: "bg-warning/15 text-warning-foreground border-warning/30",
  approved: "bg-success/15 text-success border-success/30",
  rejected: "bg-destructive/15 text-destructive border-destructive/30",
};

function VendorReviewsPage() {
  const { companyId } = useAuth();
  const [productReviews, setProductReviews] = useState<ProductReview[]>([]);
  const [vendorReviews, setVendorReviews] = useState<VendorReview[]>([]);
  const [authors, setAuthors] = useState<Record<string, { full_name: string | null }>>({});
  const [loading, setLoading] = useState(true);
  const [responseDraft, setResponseDraft] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    const [pRes, vRes] = await Promise.all([
      supabase
        .from("product_reviews")
        .select(
          `id, rating, title, body, status, created_at, user_id, product_id, vendor_response, vendor_responded_at,
           products:product_id ( id, name_ar, image_url )`,
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
      supabase
        .from("vendor_reviews")
        .select(
          "id, rating, body, status, created_at, user_id, vendor_response, vendor_responded_at",
        )
        .eq("company_id", companyId)
        .order("created_at", { ascending: false }),
    ]);
    const pList = (pRes.data ?? []) as unknown as ProductReview[];
    const vList = (vRes.data ?? []) as unknown as VendorReview[];
    setProductReviews(pList);
    setVendorReviews(vList);

    const ids = Array.from(
      new Set([...pList.map((r) => r.user_id), ...vList.map((r) => r.user_id)]),
    );
    if (ids.length) {
      const { data: profiles } = await supabase
        .from("profiles")
        .select("id, full_name")
        .in("id", ids);
      const map: Record<string, { full_name: string | null }> = {};
      (profiles ?? []).forEach((p) => {
        map[p.id] = { full_name: p.full_name };
      });
      setAuthors(map);
    }
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, [companyId]);

  const setStatus = async (
    table: "product_reviews" | "vendor_reviews",
    id: string,
    status: Status,
  ) => {
    setBusyId(id);
    const { error } = await supabase.from(table).update({ status }).eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("تعذّر التحديث: " + error.message);
      return;
    }
    toast.success(status === "approved" ? "تم النشر" : status === "rejected" ? "تم الرفض" : "تم");
    load();
  };

  const sendResponse = async (table: "product_reviews" | "vendor_reviews", id: string) => {
    const text = (responseDraft[id] ?? "").trim();
    if (!text) {
      toast.error("اكتب رداً قبل الإرسال");
      return;
    }
    setBusyId(id);
    const { error } = await supabase
      .from(table)
      .update({
        vendor_response: text,
        vendor_responded_at: new Date().toISOString(),
      })
      .eq("id", id);
    setBusyId(null);
    if (error) {
      toast.error("تعذّر إرسال الرد");
      return;
    }
    toast.success("تم نشر الرد");
    setResponseDraft((p) => ({ ...p, [id]: "" }));
    load();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const pendingCount =
    productReviews.filter((r) => r.status === "pending").length +
    vendorReviews.filter((r) => r.status === "pending").length;

  const renderProduct = (r: ProductReview) => {
    const author = authors[r.user_id]?.full_name?.trim() || "عميل";
    return (
      <Card key={r.id} className="p-4">
        <div className="flex items-start gap-3">
          {r.products?.image_url ? (
            <img
              src={r.products.image_url}
              alt=""
              className="h-12 w-12 shrink-0 rounded-lg object-cover ring-1 ring-border"
            />
          ) : (
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Package className="h-5 w-5 text-muted-foreground" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">{r.products?.name_ar ?? "منتج"}</p>
              <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASSES[r.status])}>
                {STATUS_LABELS[r.status]}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px]">
                  {author[0]?.toUpperCase()}
                </AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground">{author}</span>
              <span>·</span>
              <StarRating value={r.rating} readOnly size="sm" />
              <span>·</span>
              <span>{formatDateAr(r.created_at)}</span>
            </div>
            {r.title && <p className="mt-2 text-sm font-medium">{r.title}</p>}
            {r.body && (
              <p className="mt-1 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>
            )}
            {r.vendor_response && (
              <div className="mt-3 rounded-md border-r-2 border-primary bg-primary/5 p-2 text-xs">
                <p className="font-semibold text-primary">ردك</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {r.vendor_response}
                </p>
              </div>
            )}
          </div>
        </div>
        <ReviewActions
          status={r.status}
          busy={busyId === r.id}
          response={responseDraft[r.id] ?? ""}
          onResponseChange={(v) => setResponseDraft((p) => ({ ...p, [r.id]: v }))}
          onApprove={() => setStatus("product_reviews", r.id, "approved")}
          onReject={() => setStatus("product_reviews", r.id, "rejected")}
          onReply={() => sendResponse("product_reviews", r.id)}
        />
      </Card>
    );
  };

  const renderVendor = (r: VendorReview) => {
    const author = authors[r.user_id]?.full_name?.trim() || "عميل";
    return (
      <Card key={r.id} className="p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Store className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">تقييم المتجر</p>
              <Badge variant="outline" className={cn("text-[10px]", STATUS_CLASSES[r.status])}>
                {STATUS_LABELS[r.status]}
              </Badge>
            </div>
            <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
              <Avatar className="h-5 w-5">
                <AvatarFallback className="text-[9px]">{author[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
              <span className="font-medium text-foreground">{author}</span>
              <span>·</span>
              <StarRating value={r.rating} readOnly size="sm" />
              <span>·</span>
              <span>{formatDateAr(r.created_at)}</span>
            </div>
            {r.body && (
              <p className="mt-2 whitespace-pre-line text-sm text-muted-foreground">{r.body}</p>
            )}
            {r.vendor_response && (
              <div className="mt-3 rounded-md border-r-2 border-primary bg-primary/5 p-2 text-xs">
                <p className="font-semibold text-primary">ردك</p>
                <p className="mt-1 whitespace-pre-line text-muted-foreground">
                  {r.vendor_response}
                </p>
              </div>
            )}
          </div>
        </div>
        <ReviewActions
          status={r.status}
          busy={busyId === r.id}
          response={responseDraft[r.id] ?? ""}
          onResponseChange={(v) => setResponseDraft((p) => ({ ...p, [r.id]: v }))}
          onApprove={() => setStatus("vendor_reviews", r.id, "approved")}
          onReject={() => setStatus("vendor_reviews", r.id, "rejected")}
          onReply={() => sendResponse("vendor_reviews", r.id)}
        />
      </Card>
    );
  };

  const empty = (
    <Card className="flex flex-col items-center gap-2 p-10 text-center">
      <MessageSquare className="h-8 w-8 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">لا توجد مراجعات في هذه القائمة.</p>
    </Card>
  );

  return (
    <div className="space-y-6" dir="rtl">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          <MessageSquare className="h-6 w-6 text-primary" />
          المراجعات والتقييمات
        </h1>
        <p className="text-sm text-muted-foreground">
          راجع تقييمات العملاء واعتمدها للنشر، وأضف ردك حين يلزم.
          {pendingCount > 0 && (
            <Badge variant="outline" className="ms-2 bg-warning/15 text-warning-foreground border-warning/30">
              {pendingCount} بانتظار الموافقة
            </Badge>
          )}
        </p>
      </header>

      <Tabs defaultValue="products">
        <TabsList>
          <TabsTrigger value="products">
            المنتجات ({productReviews.length})
          </TabsTrigger>
          <TabsTrigger value="vendor">
            المتجر ({vendorReviews.length})
          </TabsTrigger>
        </TabsList>

        <TabsContent value="products" className="space-y-3 mt-4">
          {productReviews.length === 0 ? empty : productReviews.map(renderProduct)}
        </TabsContent>
        <TabsContent value="vendor" className="space-y-3 mt-4">
          {vendorReviews.length === 0 ? empty : vendorReviews.map(renderVendor)}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ReviewActions({
  status,
  busy,
  response,
  onResponseChange,
  onApprove,
  onReject,
  onReply,
}: {
  status: Status;
  busy: boolean;
  response: string;
  onResponseChange: (v: string) => void;
  onApprove: () => void;
  onReject: () => void;
  onReply: () => void;
}) {
  return (
    <div className="mt-3 space-y-2 border-t pt-3">
      <div className="flex flex-wrap items-center gap-2">
        {status !== "approved" && (
          <Button size="sm" onClick={onApprove} disabled={busy} className="gap-1 bg-success text-success-foreground hover:bg-success/90">
            <Check className="h-3.5 w-3.5" />
            اعتماد ونشر
          </Button>
        )}
        {status !== "rejected" && (
          <Button size="sm" variant="outline" onClick={onReject} disabled={busy} className="gap-1 text-destructive">
            <X className="h-3.5 w-3.5" />
            رفض
          </Button>
        )}
      </div>
      <div className="flex items-start gap-2">
        <Textarea
          value={response}
          onChange={(e) => onResponseChange(e.target.value)}
          placeholder="اكتب رداً مهنياً للعميل..."
          rows={2}
          maxLength={1000}
          className="text-sm"
        />
        <Button size="sm" variant="outline" onClick={onReply} disabled={busy} className="gap-1 shrink-0">
          <Reply className="h-3.5 w-3.5" />
          إرسال
        </Button>
      </div>
    </div>
  );
}
