export function formatMAD(value: number | string | null | undefined): string {
  const n = typeof value === "string" ? Number(value) : (value ?? 0);
  return new Intl.NumberFormat("ar-MA", {
    style: "currency",
    currency: "MAD",
    maximumFractionDigits: 2,
  }).format(Number.isFinite(n) ? n : 0);
}

export function formatDateAr(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ar-MA", {
    dateStyle: "medium",
  }).format(d);
}

export function formatDateTimeAr(value: string | Date): string {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("ar-MA", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(d);
}

export const LEVEL_LABELS: Record<string, string> = {
  distributor: "موزع",
  senior_consultant: "استشاري أول",
  success_builder: "باني النجاح",
  supervisor: "مشرف",
  world_team: "الفريق العالمي",
};

export const STATUS_LABELS: Record<string, string> = {
  pending: "قيد الانتظار",
  confirmed: "مؤكد",
  preparing: "قيد التحضير",
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

export const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "outline",
  confirmed: "outline",
  preparing: "outline",
  shipped: "outline",
  delivered: "outline",
  cancelled: "outline",
};

// Color-coded status classes. Applied on top of Badge variant="outline".
export const STATUS_CLASSES: Record<string, string> = {
  pending:
    "border-yellow-500/30 bg-yellow-500/15 text-yellow-700 dark:text-yellow-300",
  confirmed:
    "border-sky-500/30 bg-sky-500/15 text-sky-700 dark:text-sky-300",
  preparing:
    "border-blue-500/30 bg-blue-500/15 text-blue-700 dark:text-blue-300",
  shipped:
    "border-purple-500/30 bg-purple-500/15 text-purple-700 dark:text-purple-300",
  delivered:
    "border-green-500/30 bg-green-500/15 text-green-700 dark:text-green-300",
  cancelled:
    "border-red-500/30 bg-red-500/15 text-red-700 dark:text-red-300",
};

export const ORDER_STATUSES = [
  "pending",
  "confirmed",
  "preparing",
  "shipped",
  "delivered",
  "cancelled",
] as const;
