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
  shipped: "تم الشحن",
  delivered: "تم التسليم",
  cancelled: "ملغي",
};

export const STATUS_VARIANTS: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  pending: "secondary",
  confirmed: "outline",
  shipped: "default",
  delivered: "default",
  cancelled: "destructive",
};
