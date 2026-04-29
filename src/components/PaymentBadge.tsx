import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type PaymentStatus =
  | "pending"
  | "awaiting_confirmation"
  | "paid"
  | "failed"
  | "refunded";

export const PAYMENT_STATUS_LABELS: Record<PaymentStatus, string> = {
  pending: "بانتظار الدفع",
  awaiting_confirmation: "بانتظار التأكيد",
  paid: "مدفوع",
  failed: "فشل الدفع",
  refunded: "مُسترد",
};

const PAYMENT_STATUS_TONE: Record<PaymentStatus, string> = {
  pending: "border-border bg-muted text-muted-foreground",
  awaiting_confirmation: "border-warning/40 bg-warning/15 text-warning-foreground",
  paid: "border-success/40 bg-success/15 text-success",
  failed: "border-destructive/40 bg-destructive/15 text-destructive",
  refunded: "border-border bg-muted text-muted-foreground",
};

export const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cod: "الدفع عند الاستلام",
  bank_transfer: "تحويل بنكي",
  manual: "تواصل مع البائع",
  card: "بطاقة بنكية",
  stripe: "Stripe",
  cash: "نقداً",
};

export function PaymentBadge({
  status,
  className,
}: {
  status: string;
  className?: string;
}) {
  const s = (status as PaymentStatus) ?? "pending";
  const label = PAYMENT_STATUS_LABELS[s] ?? status;
  const tone = PAYMENT_STATUS_TONE[s] ?? "";
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", tone, className)}>
      {label}
    </Badge>
  );
}
