import { useState } from "react";
import { Loader2, Wand2 } from "lucide-react";
import { Button } from "@/components/ui/button";
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
import { supabase } from "@/integrations/supabase/client";
import {
  expectedDistributorUnitPrice,
  isPriceDrift,
} from "@/lib/distributorPricing";
import { toast } from "sonner";

interface Props {
  /** Restrict recompute to this company. Required for safety. */
  companyId: string;
  /** Called after a successful recompute so the parent can refresh. */
  onComplete?: () => void;
}

interface RecomputeReport {
  ordersScanned: number;
  itemsScanned: number;
  itemsUpdated: number;
  ordersTotalUpdated: number;
  itemsSkippedNoTier: number;
  errors: string[];
}

/**
 * Admin maintenance tool: rewrites historical `order_items.unit_price_mad`
 * (and the parent `orders.total_mad`) using the canonical
 * `base_price * (1 - tier_discount)` formula.
 *
 * Each order is recomputed using the distributor's CURRENT pricing tier
 * assignment for the order's company. Orders whose distributor has no tier
 * assigned are skipped and reported.
 */
export function RecomputeDistributorPricesButton({ companyId, onComplete }: Props) {
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [report, setReport] = useState<RecomputeReport | null>(null);

  const run = async () => {
    setRunning(true);
    setReport(null);
    const out: RecomputeReport = {
      ordersScanned: 0,
      itemsScanned: 0,
      itemsUpdated: 0,
      ordersTotalUpdated: 0,
      itemsSkippedNoTier: 0,
      errors: [],
    };

    try {
      // 1. Pull all orders + items for this company.
      const { data: orders, error: oErr } = await supabase
        .from("orders")
        .select(
          "id, distributor_id, total_mad, order_items(id, quantity, unit_price_mad, products(id, rrp_price, price_mad))",
        )
        .eq("company_id", companyId);
      if (oErr) throw oErr;

      // 2. Resolve every distributor's tier discount in one query.
      const distributorIds = Array.from(
        new Set((orders ?? []).map((o) => (o as { distributor_id: string }).distributor_id)),
      );
      const { data: cdpRows } = distributorIds.length
        ? await supabase
            .from("company_distributor_pricing")
            .select(
              "distributor_id, custom_discount_percent, pricing_tiers(base_discount_percent)",
            )
            .eq("company_id", companyId)
            .in("distributor_id", distributorIds)
        : { data: [] as unknown[] };

      const discountMap = new Map<string, number>();
      for (const row of (cdpRows ?? []) as Array<{
        distributor_id: string;
        custom_discount_percent: number | null;
        pricing_tiers: { base_discount_percent: number } | null;
      }>) {
        const base = row.pricing_tiers?.base_discount_percent ?? 0;
        const custom = row.custom_discount_percent;
        discountMap.set(
          row.distributor_id,
          custom != null ? Number(custom) : Number(base),
        );
      }

      for (const o of (orders ?? []) as Array<{
        id: string;
        distributor_id: string;
        total_mad: number;
        order_items: Array<{
          id: string;
          quantity: number;
          unit_price_mad: number;
          products: { id: string; rrp_price: number | null; price_mad: number } | null;
        }>;
      }>) {
        out.ordersScanned += 1;
        const discount = discountMap.get(o.distributor_id);
        if (discount == null) {
          out.itemsSkippedNoTier += o.order_items.length;
          continue;
        }
        let newOrderTotal = 0;
        for (const it of o.order_items) {
          out.itemsScanned += 1;
          if (!it.products) {
            // Product deleted — keep stored price as-is in the running total.
            newOrderTotal += Number(it.unit_price_mad) * it.quantity;
            continue;
          }
          const expected = expectedDistributorUnitPrice(it.products, discount);
          newOrderTotal += expected * it.quantity;
          if (isPriceDrift(it.unit_price_mad, expected)) {
            const { error: upErr } = await supabase
              .from("order_items")
              .update({ unit_price_mad: expected })
              .eq("id", it.id);
            if (upErr) {
              out.errors.push(`order_item ${it.id}: ${upErr.message}`);
            } else {
              out.itemsUpdated += 1;
            }
          }
        }
        // Round to 2 decimals to match storage precision.
        const rounded = Math.round(newOrderTotal * 100) / 100;
        if (Math.abs(Number(o.total_mad) - rounded) > 0.01) {
          const { error: tErr } = await supabase
            .from("orders")
            .update({ total_mad: rounded })
            .eq("id", o.id);
          if (tErr) {
            out.errors.push(`order ${o.id} total: ${tErr.message}`);
          } else {
            out.ordersTotalUpdated += 1;
          }
        }
      }

      setReport(out);
      if (out.errors.length === 0) {
        toast.success(
          `تم تحديث ${out.itemsUpdated} سطرًا و ${out.ordersTotalUpdated} طلبًا`,
        );
      } else {
        toast.error(`اكتمل مع ${out.errors.length} خطأ`);
      }
      onComplete?.();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      out.errors.push(msg);
      setReport(out);
      toast.error(`تعذر إعادة الحساب: ${msg}`);
    } finally {
      setRunning(false);
    }
  };

  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          setReport(null);
          setOpen(true);
        }}
      >
        <Wand2 className="h-4 w-4 mr-1" />
        إعادة حساب أسعار الموزع
      </Button>

      <AlertDialog open={open} onOpenChange={(o) => !running && setOpen(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>إعادة حساب أسعار الموزع للطلبات السابقة</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-right text-sm">
                <p>
                  ستتم إعادة حساب <span className="font-semibold">unit_price</span> لكل سطر
                  باستخدام الصيغة:
                </p>
                <p className="font-mono text-xs bg-muted/50 p-2 rounded">
                  unit_price = base_price × (1 − tier_discount)
                </p>
                <p>
                  يستخدم النظام الشريحة الحالية لكل موزع. الطلبات لموزعين بدون شريحة سيتم
                  تخطيها.
                </p>
                {report && (
                  <div className="mt-3 space-y-1 text-xs border-t pt-2">
                    <div>الطلبات الممسوحة: {report.ordersScanned}</div>
                    <div>الأسطر الممسوحة: {report.itemsScanned}</div>
                    <div className="text-success">
                      الأسطر المُحدَّثة: {report.itemsUpdated}
                    </div>
                    <div className="text-success">
                      الطلبات المُحدَّث إجماليها: {report.ordersTotalUpdated}
                    </div>
                    {report.itemsSkippedNoTier > 0 && (
                      <div className="text-amber-600">
                        أسطر تم تخطيها (بدون شريحة): {report.itemsSkippedNoTier}
                      </div>
                    )}
                    {report.errors.length > 0 && (
                      <div className="text-destructive">
                        الأخطاء: {report.errors.length}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={running}>إغلاق</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                run();
              }}
              disabled={running}
            >
              {running && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {report ? "إعادة التشغيل" : "بدء"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
