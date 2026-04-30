import { useEffect, useState } from "react";
import { Loader2, Send, Star } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { StarRating } from "@/components/StarRating";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { z } from "zod";

interface ReviewDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  kind: "product" | "vendor";
  productId?: string;
  productName?: string;
  companyId: string;
  companyName: string;
  orderId?: string;
  onSubmitted?: () => void;
}

const productSchema = z.object({
  rating: z.number().int().min(1).max(5),
  title: z.string().trim().max(120).optional().or(z.literal("")),
  body: z.string().trim().max(2000).optional().or(z.literal("")),
});
const vendorSchema = z.object({
  rating: z.number().int().min(1).max(5),
  body: z.string().trim().max(2000).optional().or(z.literal("")),
});

export function ReviewDialog(props: ReviewDialogProps) {
  const { user } = useAuth();
  const {
    open,
    onOpenChange,
    kind,
    productId,
    productName,
    companyId,
    companyName,
    orderId,
    onSubmitted,
  } = props;

  const [rating, setRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [existingId, setExistingId] = useState<string | null>(null);
  const [existingStatus, setExistingStatus] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Load existing review (if any)
  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      setLoading(true);
      if (kind === "product" && productId) {
        const { data } = await supabase
          .from("product_reviews")
          .select("id, rating, title, body, status")
          .eq("user_id", user.id)
          .eq("product_id", productId)
          .maybeSingle();
        if (data) {
          setExistingId(data.id);
          setExistingStatus(data.status);
          setRating(data.rating);
          setTitle(data.title ?? "");
          setBody(data.body ?? "");
        } else {
          setExistingId(null);
          setExistingStatus(null);
          setRating(0);
          setTitle("");
          setBody("");
        }
      } else if (kind === "vendor") {
        const { data } = await supabase
          .from("vendor_reviews")
          .select("id, rating, body, status")
          .eq("user_id", user.id)
          .eq("company_id", companyId)
          .maybeSingle();
        if (data) {
          setExistingId(data.id);
          setExistingStatus(data.status);
          setRating(data.rating);
          setBody(data.body ?? "");
        } else {
          setExistingId(null);
          setExistingStatus(null);
          setRating(0);
          setBody("");
        }
      }
      setLoading(false);
    })();
  }, [open, user, kind, productId, companyId]);

  const submit = async () => {
    if (!user) return;
    if (rating < 1) {
      toast.error("اختر تقييماً بالنجوم");
      return;
    }
    setBusy(true);

    if (kind === "product" && productId) {
      const parsed = productSchema.safeParse({ rating, title, body });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
        setBusy(false);
        return;
      }
      if (existingId) {
        const { error } = await supabase
          .from("product_reviews")
          .update({ rating, title, body })
          .eq("id", existingId);
        if (error) {
          toast.error("تعذّر التحديث");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.from("product_reviews").insert({
          user_id: user.id,
          product_id: productId,
          company_id: companyId,
          order_id: orderId ?? null,
          rating,
          title,
          body,
        });
        if (error) {
          toast.error("تعذّر الإرسال: " + error.message);
          setBusy(false);
          return;
        }
      }
    } else {
      const parsed = vendorSchema.safeParse({ rating, body });
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? "بيانات غير صالحة");
        setBusy(false);
        return;
      }
      if (existingId) {
        const { error } = await supabase
          .from("vendor_reviews")
          .update({ rating, body })
          .eq("id", existingId);
        if (error) {
          toast.error("تعذّر التحديث");
          setBusy(false);
          return;
        }
      } else {
        const { error } = await supabase.from("vendor_reviews").insert({
          user_id: user.id,
          company_id: companyId,
          order_id: orderId ?? null,
          rating,
          body,
        });
        if (error) {
          toast.error("تعذّر الإرسال: " + error.message);
          setBusy(false);
          return;
        }
      }
    }

    setBusy(false);
    toast.success(
      existingId
        ? "تم تحديث المراجعة. ستظهر بعد موافقة المورد."
        : "شكراً! ستظهر مراجعتك بعد موافقة المورد.",
    );
    onSubmitted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent dir="rtl" className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {kind === "product" ? "تقييم المنتج" : "تقييم المتجر"}
          </DialogTitle>
          <DialogDescription>
            {kind === "product" ? productName : companyName}
            {existingStatus === "pending" && (
              <span className="mt-1 block text-xs text-warning-foreground">
                مراجعتك السابقة قيد المراجعة من المورد.
              </span>
            )}
            {existingStatus === "approved" && (
              <span className="mt-1 block text-xs text-success">
                مراجعتك السابقة منشورة. التعديل سيعيدها لقائمة الانتظار.
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-2 rounded-lg bg-muted/40 p-4">
              <p className="text-xs text-muted-foreground">تقييمك</p>
              <StarRating value={rating} onChange={setRating} size="lg" />
            </div>

            {kind === "product" && (
              <div>
                <Label htmlFor="rev-title" className="mb-1.5">
                  عنوان المراجعة (اختياري)
                </Label>
                <Input
                  id="rev-title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="منتج رائع وسريع التوصيل"
                  maxLength={120}
                />
              </div>
            )}

            <div>
              <Label htmlFor="rev-body" className="mb-1.5">
                تجربتك (اختياري)
              </Label>
              <Textarea
                id="rev-body"
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder={
                  kind === "product"
                    ? "ما الذي أعجبك أو لم يعجبك؟"
                    : "كيف كانت تجربتك مع هذا المتجر؟"
                }
                rows={4}
                maxLength={2000}
              />
              <p className="mt-1 text-[10px] text-muted-foreground">
                {body.length} / 2000
              </p>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            إلغاء
          </Button>
          <Button onClick={submit} disabled={busy || loading} className="gap-2">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {existingId ? "تحديث" : "إرسال"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
