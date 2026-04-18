import { ShoppingCart, Plus, Minus, Trash2, Loader2, AlertTriangle } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { useCart, type CartItem } from "@/hooks/useCart";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { formatMAD } from "@/lib/format";
import { getUnitPrice, validateLine } from "@/lib/pricing";
import { toast } from "sonner";

export function CartButton() {
  const { totalQty, openCart } = useCart();
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative"
      onClick={openCart}
      aria-label="فتح السلة"
    >
      <ShoppingCart className="h-5 w-5" />
      {totalQty > 0 && (
        <span className="absolute -top-1 -right-1 bg-warning text-warning-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center">
          {totalQty}
        </span>
      )}
    </Button>
  );
}

interface PricedLine {
  item: CartItem;
  unitPrice: number;
  lineTotal: number;
  blocked: boolean;
  message?: string;
}

export function CartSheet() {
  const { items, isOpen, setOpen, updateQty, removeItem, clear } = useCart();
  const { user, partnerType, companyId, pricingTierDiscount } = useAuth();
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);

  const priced: PricedLine[] = useMemo(
    () =>
      items.map((item) => {
        // Reconstruct PricedProduct shape from cart item
        const pp = {
          rrp_price: item.rrp_price ?? null,
          pharmacy_price: item.pharmacy_price ?? null,
          map_price: item.map_price ?? null,
          minimum_order: item.minimum_order ?? 1,
          price_tiers: item.price_tiers ?? [],
          price_mad: item.price_mad,
        };
        const { unitPrice: base } = getUnitPrice(pp, partnerType, item.qty);
        const factor = 1 - (pricingTierDiscount ?? 0) / 100;
        const unitPrice = Math.round(base * factor);
        const v = validateLine(pp, partnerType, item.qty, unitPrice, item.name_ar);
        return {
          item,
          unitPrice,
          lineTotal: unitPrice * item.qty,
          blocked: !v.ok,
          message: v.message,
        };
      }),
    [items, partnerType, pricingTierDiscount],
  );

  const total = priced.reduce((s, l) => s + l.lineTotal, 0);
  const blockedLines = priced.filter((l) => l.blocked);
  const canCheckout = items.length > 0 && blockedLines.length === 0;

  const placeOrder = async () => {
    if (!user || items.length === 0) return;
    if (!companyId) {
      toast.error("لا توجد شركة نشطة");
      return;
    }
    if (!canCheckout) {
      toast.error(blockedLines[0]?.message ?? "تعذر إتمام الطلب");
      return;
    }
    setSubmitting(true);
    const points = Math.floor(total / 100);
    const trimmedNotes = notes.trim();
    const { data: order, error } = await supabase
      .from("orders")
      .insert({
        distributor_id: user.id,
        company_id: companyId,
        total_mad: total,
        points_earned: points,
        status: "pending",
        notes: trimmedNotes ? trimmedNotes : null,
        order_number: `ORD-${Date.now().toString().slice(-8)}`,
      } as never)
      .select("id")
      .single();
    if (error || !order) {
      toast.error("تعذر إنشاء الطلب");
      setSubmitting(false);
      return;
    }
    const orderItems = priced.map((l) => ({
      order_id: order.id,
      product_id: l.item.id,
      quantity: l.item.qty,
      unit_price_mad: l.unitPrice,
    }));
    const { error: itemsErr } = await supabase.from("order_items").insert(orderItems);
    if (itemsErr) {
      toast.error("تعذر حفظ عناصر الطلب");
      setSubmitting(false);
      return;
    }
    toast.success(`تم إرسال الطلب بنجاح • +${points} نقطة`);
    clear();
    setNotes("");
    setConfirmOpen(false);
    setOpen(false);
    setSubmitting(false);
  };

  return (
    <Sheet open={isOpen} onOpenChange={setOpen}>
      <SheetContent side="left" className="flex flex-col">
        <SheetHeader>
          <SheetTitle>سلة الطلب</SheetTitle>
          <SheetDescription>راجع منتجاتك قبل إرسال الطلب</SheetDescription>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto py-4 space-y-3">
          {priced.length === 0 ? (
            <div className="text-center text-sm text-muted-foreground py-12">
              السلة فارغة
            </div>
          ) : (
            <>
              {priced.map(({ item, unitPrice, lineTotal, blocked, message }) => (
                <div
                  key={item.id}
                  className={`flex gap-3 p-3 rounded-lg border bg-card ${
                    blocked ? "border-destructive/60" : ""
                  }`}
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
                    {blocked && message && (
                      <p className="text-[11px] text-destructive flex items-center gap-1 mt-1">
                        <AlertTriangle className="h-3 w-3" />
                        {message}
                      </p>
                    )}
                    <div className="flex items-center gap-2 mt-2">
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.id, -1)}
                      >
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="text-sm font-medium w-6 text-center">
                        {item.qty}
                      </span>
                      <Button
                        size="icon"
                        variant="outline"
                        className="h-7 w-7"
                        onClick={() => updateQty(item.id, 1)}
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-7 w-7 mr-auto text-destructive"
                        onClick={() => removeItem(item.id)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
              <div className="space-y-2 pt-2">
                <Label htmlFor="delivery-notes" className="text-sm">
                  ملاحظات التوصيل (اختياري)
                </Label>
                <Textarea
                  id="delivery-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="العنوان، وقت التوصيل المفضل، أو أي تعليمات أخرى"
                  rows={3}
                  maxLength={500}
                />
                <p className="text-xs text-muted-foreground text-left">
                  {notes.length}/500
                </p>
              </div>
            </>
          )}
        </div>
        {priced.length > 0 && (
          <SheetFooter className="flex-col gap-3 sm:flex-col border-t pt-4">
            {blockedLines.length > 0 && (
              <div className="text-xs text-destructive flex items-center gap-1.5 w-full">
                <AlertTriangle className="h-3.5 w-3.5" />
                صحّح المنتجات المظللة قبل إرسال الطلب
              </div>
            )}
            <div className="flex items-center justify-between w-full">
              <span className="text-muted-foreground">الإجمالي</span>
              <span className="text-lg font-bold">{formatMAD(total)}</span>
            </div>
            <Button
              onClick={() => setConfirmOpen(true)}
              disabled={submitting || !canCheckout}
              className="w-full"
              size="lg"
            >
              متابعة الطلب
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
      <AlertDialog open={confirmOpen} onOpenChange={(o) => !submitting && setConfirmOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>تأكيد الطلب</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right">
                <div>
                  عدد المنتجات:{" "}
                  <span className="font-medium text-foreground">{items.length}</span>
                </div>
                <div>
                  الإجمالي:{" "}
                  <span className="font-medium text-foreground">{formatMAD(total)}</span>
                </div>
                {notes.trim() && (
                  <div>
                    ملاحظات:{" "}
                    <span className="text-foreground whitespace-pre-wrap">{notes.trim()}</span>
                  </div>
                )}
                <div className="pt-2">هل تريد تأكيد إرسال الطلب؟</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={submitting}>إلغاء</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                placeOrder();
              }}
              disabled={submitting}
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              تأكيد
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}
