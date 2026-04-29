import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * V3 locked order lifecycle:
 *   pending → confirmed → preparing → shipped → delivered  (+ cancelled)
 *
 * `processing` is kept as a back-compat alias of `preparing` for any rows
 * that may still carry the old enum value, but UI always speaks the V3 set.
 */
export type OrderStatus =
  | "pending"
  | "confirmed"
  | "preparing"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pending: "بانتظار التأكيد",
  confirmed: "مؤكَّد",
  preparing: "قيد التحضير",
  processing: "قيد التحضير",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغى",
};

/**
 * Semantic tone tokens. Same status → same color across every screen.
 * - warning  → pending
 * - info     → confirmed / preparing / shipped
 * - success  → delivered
 * - destructive → cancelled
 */
const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending: "border-warning/40 bg-warning/15 text-warning-foreground",
  confirmed: "border-info/40 bg-info/15 text-info-foreground",
  preparing: "border-info/40 bg-info/15 text-info-foreground",
  processing: "border-info/40 bg-info/15 text-info-foreground",
  shipped: "border-info/40 bg-info/15 text-info-foreground",
  delivered: "border-success/40 bg-success/15 text-success",
  cancelled: "border-destructive/40 bg-destructive/15 text-destructive",
};

interface StatusBadgeProps {
  status: string;
  className?: string;
}

export function StatusBadge({ status, className }: StatusBadgeProps) {
  const s = (status as OrderStatus) ?? "pending";
  const label = ORDER_STATUS_LABELS[s] ?? status;
  const tone = ORDER_STATUS_TONE[s] ?? "";
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", tone, className)}>
      {label}
    </Badge>
  );
}
