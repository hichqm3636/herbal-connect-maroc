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
/**
 * Distinct tones per status so operators can scan the list at a glance.
 * - pending    → amber (action needed)
 * - confirmed  → blue (acknowledged)
 * - preparing  → orange (in progress)
 * - shipped    → indigo/purple (in transit)
 * - delivered  → green (done)
 * - cancelled  → red
 */
const ORDER_STATUS_TONE: Record<OrderStatus, string> = {
  pending:
    "border-yellow-500/30 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  confirmed:
    "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  preparing:
    "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  processing:
    "border-orange-500/30 bg-orange-500/15 text-orange-700 dark:text-orange-300",
  shipped:
    "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300",
  delivered:
    "border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300",
  cancelled:
    "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
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
