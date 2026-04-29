/**
 * WhatsApp Quick Contact helpers (marketplace).
 *
 * Manual contact shortcut only — does NOT use the WhatsApp Business API.
 * Generates a `wa.me` deep link that opens WhatsApp Web on desktop and
 * the WhatsApp app on mobile.
 */

/**
 * Normalize a Moroccan phone number to international wa.me format (212XXXXXXXXX).
 *
 * Rules:
 * - Strip all non-digit characters (spaces, dashes, parentheses, leading `+`).
 * - If the number starts with `0`, remove that leading zero (local trunk prefix).
 * - If the number does not already start with `212`, prepend it.
 */
export function normalizeWhatsappPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  let p = phone.replace(/\D+/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = p.substring(2);
  if (p.startsWith("0")) p = p.substring(1);
  if (!p.startsWith("212")) p = "212" + p;
  return p;
}

/** Public alias matching the spec name. */
export function formatPhoneMA(phone: string | null | undefined): string {
  return normalizeWhatsappPhone(phone);
}

/**
 * Build a wa.me link with a URL-encoded message body.
 * Returns an empty string when the phone number is missing/invalid so
 * callers can simply hide the button.
 */
export function buildWhatsappLink(
  phone: string | null | undefined,
  message: string,
): string {
  const normalized = normalizeWhatsappPhone(phone);
  if (!normalized) return "";
  return `https://wa.me/${normalized}?text=${encodeURIComponent(message)}`;
}

function formatTotal(total: number): string {
  return new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total);
}

export interface WhatsappOrderItem {
  name: string;
  qty: number;
}

export interface WhatsappOrderSummary {
  items: WhatsappOrderItem[];
  total: number;
  city: string;
  phone: string;
  /** Optional human-readable order number (e.g. "ORD-2026-0142"). */
  orderNumber?: string;
  /** Optional ISO timestamp or Date for when the order was created. */
  createdAt?: string | Date;
}

function formatOrderDateAr(value: string | Date): string {
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("ar-MA", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

/**
 * Build a customer-facing order summary message in Arabic.
 * Used for quick "new order" notifications via WhatsApp.
 */
export function buildWhatsAppMessage(order: WhatsappOrderSummary): string {
  const lines = order.items.map((i) => `- ${i.name} ×${i.qty}`);
  const header: string[] = ["🛒 طلب جديد"];
  if (order.orderNumber) header.push(`🧾 رقم الطلب: ${order.orderNumber}`);
  if (order.createdAt) {
    const formatted = formatOrderDateAr(order.createdAt);
    if (formatted) header.push(`🗓️ التاريخ: ${formatted}`);
  }
  return `
${header.join("\n")}

📦 المنتجات:
${lines.join("\n")}

💰 المجموع: ${formatTotal(order.total)} درهم
📍 المدينة: ${order.city}
📞 الهاتف: ${order.phone}

شكراً لك 🙏
`.trim();
}
