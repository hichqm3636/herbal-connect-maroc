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
import { useOrderRules } from "@/hooks/useOrderRules";
import { formatMAD } from "@/lib/format";
import { getUnitPrice, validateLine } from "@/lib/pricing";
import {
  expectedDistributorUnitPrice,
  isPriceDrift,
} from "@/lib/distributorPricing";
import { evaluateRules } from "@/lib/orderRules";
import { logActivity } from "@/lib/activityLog";
import { AUTHZ_MESSAGES_AR, type AuthzReason } from "@/lib/authzMessages";
import { createOrder } from "@/server/orders";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";

export function CartButton() {
  const { totalQty, openCart } = useCart();
  const label =
    totalQty > 0 ? `فتح السلة، ${totalQty} عنصر` : "فتح السلة، فارغة";
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="relative"
      onClick={openCart}
      aria-label={label}
      aria-haspopup="dialog"
    >
      <ShoppingCart className="h-5 w-5" aria-hidden="true" />
      {totalQty > 0 && (
        <span
          className="absolute -top-1 -end-1 bg-warning text-warning-foreground text-[10px] font-bold rounded-full h-5 min-w-5 px-1 flex items-center justify-center"
          aria-hidden="true"
        >
          {totalQty}
        </span>
      )}
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {totalQty} عنصر في السلة
      </span>
    </Button>
  );
}

interface PricedLine {
  item: CartItem;
  unitPrice: number;
  lineTotal: number;
  blocked: boolean;
  message?: string;
  reason?: "min_order" | "map_violation";
}

export function CartSheet() {
  const { items, isOpen, setOpen, updateQty, setQty, removeItem, clear } = useCart();
  const { user, partnerType, companyId, pricingTierId, pricingTierDiscount } = useAuth();
  const { rules: orderRules } = useOrderRules();
  const [submitting, setSubmitting] = useState(false);
  const [notes, setNotes] = useState("");
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<CartItem | null>(null);
  const createOrderFn = useServerFn(createOrder);

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
        const { unitPrice } = getUnitPrice(pp, partnerType, item.qty);
        const v = validateLine(pp, partnerType, item.qty, unitPrice, item.name_ar);
        return {
          item,
          unitPrice,
          lineTotal: unitPrice * item.qty,
          blocked: !v.ok,
          message: v.message,
          reason: v.reason,
        };
      }),
    [items, partnerType],
  );

  const total = priced.reduce((s, l) => s + l.lineTotal, 0);
  const blockedLines = priced.filter((l) => l.blocked);
  const unitsCount = items.reduce((s, i) => s + i.qty, 0);
  const pointsEarned = Math.floor(total / 100);
  const rulesResult = useMemo(
    () =>
      evaluateRules(
        orderRules,
        { total, points: pointsEarned, unitsCount },
        pricingTierId,
      ),
    [orderRules, total, pointsEarned, unitsCount, pricingTierId],
  );
  const canCheckout =
    items.length > 0 && blockedLines.length === 0 && rulesResult.ok;

  const placeOrder = async () => {
    if (!user || items.length === 0) return;
    if (!companyId) {
      toast.error("لا توجد شركة نشطة");
      return;
    }
    if (!canCheckout) {
      const msg =
        rulesResult.failures[0]?.message ??
        blockedLines[0]?.message ??
        "تعذر إتمام الطلب";
      toast.error(msg);
      return;
    }
    setSubmitting(true);

    // Pre-compute the authoritative tier-derived unit price for every line.
    // This is the SINGLE source of truth used for both `orders.total_mad`
    // and each `order_items.unit_price_mad` row.
    const expectedLines = priced.map((l) => {
      const product = {
        rrp_price: l.item.rrp_price ?? null,
        price_mad: l.item.price_mad,
      };
      const expected = expectedDistributorUnitPrice(product, pricingTierDiscount);
      if (isPriceDrift(l.unitPrice, expected)) {
        console.warn("[pricing_drift] cart vs tier mismatch", {
          product_id: l.item.id,
          name: l.item.name_ar,
          cart_unit_price: l.unitPrice,
          expected_distributor_price: expected,
          tier_discount_percent: pricingTierDiscount,
          base_price: product.rrp_price ?? product.price_mad,
        });
      }
      return { line: l, expected };
    });
    const orderTotal = expectedLines.reduce(
      (s, { line, expected }) => s + expected * line.item.qty,
      0,
    );
    const points = Math.floor(orderTotal / 100);
    const trimmedNotes = notes.trim();
    const itemsPayload = expectedLines.map(({ line, expected }) => ({
      product_id: line.item.id,
      quantity: line.item.qty,
      unit_price_mad: expected,
    }));

    console.log("[placeOrder] calling createOrder server fn", {
      total_mad: orderTotal,
      items_count: itemsPayload.length,
    });

    try {
      const result = await createOrderFn({
        data: {
          company_id: companyId,
          total_mad: orderTotal,
          points_earned: points,
          notes: trimmedNotes ? trimmedNotes : null,
          items: itemsPayload,
        },
      });

      void logActivity({
        companyId,
        action: "order_created",
        entityType: "order",
        entityId: result.order_id,
        metadata: {
          total_mad: orderTotal,
          items_count: itemsPayload.length,
          points_earned: points,
          source: "cart",
        },
      });
      toast.success(`تم إرسال الطلب بنجاح • +${points} نقطة`);
      clear();
      setNotes("");
      setConfirmOpen(false);
      setOpen(false);
    } catch (err) {
      // TanStack Start surfaces server errors as plain Error instances.
      // For 403 from `requireEnabledDistributorRole` the body JSON is
      // serialized into the message; try to parse it and map via
      // AUTHZ_MESSAGES_AR. Falls back to the raw server message.
      const raw = err instanceof Error ? err.message : String(err);
      console.error("[placeOrder] createOrder failed", { raw });
      let shown = raw || "تعذّر إنشاء الطلب";
      try {
        const parsed = JSON.parse(raw) as {
          reason?: string;
          message?: string;
          error?: string;
          product_id?: string;
        };
        if (parsed.error === "out_of_stock") {
          const name =
            items.find((i) => i.id === parsed.product_id)?.name_ar ?? "أحد المنتجات";
          shown = `${parsed.message ?? "الكمية المطلوبة غير متوفرة في المخزون"} (${name})`;
        } else if (parsed.reason && parsed.reason in AUTHZ_MESSAGES_AR) {
          shown = AUTHZ_MESSAGES_AR[parsed.reason as AuthzReason];
        } else if (parsed.message) {
          shown = parsed.message;
        }
      } catch {
        // Map a few well-known plain-text errors from RLS triggers.
        if (raw.includes("غير متاح في منطقة الموزع")) {
          shown = "هذا المنتج غير متاح في منطقتك";
        } else if (raw.includes("غير مُعيَّن لأي منطقة")) {
          shown = "لا يمكن إرسال الطلب: لم يتم تعيين منطقة لحسابك";
        } else if (raw.includes("الحد الأدنى للطلب")) {
          shown = raw;
        } else if (
          raw.toLowerCase().includes("forbidden") ||
          raw.includes("403")
        ) {
          shown = AUTHZ_MESSAGES_AR.distributor_role_disabled;
        }
      }
      toast.error(shown);
    } finally {
      setSubmitting(false);
    }
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
              {priced.map(({ item, unitPrice, lineTotal, blocked, message, reason }) => {
                const pack = Math.max(1, item.pack_size ?? 1);
                const minOrder = Math.max(1, item.minimum_order ?? 1);
                // Round up to nearest pack multiple so we respect pack_size too.
                const bumpTarget = Math.ceil(minOrder / pack) * pack;
                return (
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
                      <div className="mt-1 flex items-center gap-2 flex-wrap">
                        <p className="text-[11px] text-destructive flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />
                          {message}
                        </p>
                        {reason === "min_order" && item.qty < bumpTarget && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-6 px-2 text-[11px] border-warning/60 text-warning-foreground bg-warning/10 hover:bg-warning/20"
                            onClick={() => setQty(item.id, bumpTarget)}
                          >
                            ضبط على {bumpTarget}
                          </Button>
                        )}
                      </div>
                    )}
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
                        onClick={() => updateQty(item.id, pack)}
                        aria-label="زيادة"
                      >
                        <Plus className="h-3 w-3" />
                      </Button>
                      {pack > 1 && (
                        <span className="text-[10px] text-muted-foreground">
                          ×{pack}
                        </span>
                      )}
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
                );
              })}
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
            {rulesResult.evaluations.length > 0 && (
              <div className="w-full space-y-1.5">
                {rulesResult.evaluations.map((e) => (
                  <div
                    key={e.type}
                    className={`text-[11px] flex items-center gap-1.5 rounded-md px-2 py-1.5 border ${
                      e.ok
                        ? "border-success/40 bg-success/5 text-success-foreground"
                        : "border-warning/50 bg-warning/10 text-warning-foreground"
                    }`}
                  >
                    {!e.ok && <AlertTriangle className="h-3 w-3 shrink-0" />}
                    <span>{e.message}</span>
                  </div>
                ))}
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
