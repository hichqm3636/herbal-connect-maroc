/**
 * WhatsApp Quick Contact helpers.
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
 *
 * Examples:
 *   "0702208550"      -> "212702208550"
 *   "702208550"       -> "212702208550"
 *   "+212 702 208550" -> "212702208550"
 *   "212702208550"    -> "212702208550"
 */
export function normalizeWhatsappPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  let p = phone.replace(/\D+/g, "");
  if (!p) return "";
  if (p.startsWith("00")) p = p.substring(2); // 0021260... -> 21260...
  if (p.startsWith("0")) p = p.substring(1);
  if (!p.startsWith("212")) p = "212" + p;
  return p;
}

/**
 * Public alias matching the spec name. Returns the same Morocco-normalized
 * phone string used to build wa.me links.
 */
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

export interface OrderNotificationContext {
  distributorName: string;
  orderNumber: string;
  orderTotalMad: number;
  orderId: string;
  appBaseUrl?: string;
}

const DEFAULT_APP_BASE_URL = "https://app.nexora.so";

function formatTotal(total: number): string {
  return new Intl.NumberFormat("fr-MA", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(total);
}

/**
 * Build the default order notification message used by the
 * "Notify via WhatsApp" button on the order details page.
 */
export function buildOrderWhatsappMessage(ctx: OrderNotificationContext): string {
  const baseUrl = ctx.appBaseUrl?.replace(/\/$/, "") ?? DEFAULT_APP_BASE_URL;
  return [
    "📦 New Order",
    "",
    `Distributor: ${ctx.distributorName}`,
    `Order #: ${ctx.orderNumber}`,
    `Total: ${formatTotal(ctx.orderTotalMad)} MAD`,
    "",
    "View order:",
    `${baseUrl}/orders/${ctx.orderId}`,
  ].join("\n");
}

/**
 * Generic greeting for partner/supplier contact buttons (no order context).
 */
export function buildPartnerGreetingMessage(partnerName: string): string {
  return `مرحبا ${partnerName}، نتواصل معك من فريق Nexora.`;
}

export interface SupplierOrderItem {
  name: string;
  quantity: number;
}

export interface SupplierOrderContext extends OrderNotificationContext {
  itemsCount: number;
  items: SupplierOrderItem[];
}

/**
 * Build the "Send to Supplier" message — full order summary with product list,
 * sent to the upstream supplier so they can prepare/ship.
 */
export function buildSupplierOrderMessage(ctx: SupplierOrderContext): string {
  const baseUrl = ctx.appBaseUrl?.replace(/\/$/, "") ?? DEFAULT_APP_BASE_URL;
  const productLines = ctx.items.length
    ? ctx.items.map((it) => `- ${it.name} × ${it.quantity}`).join("\n")
    : "- (no items)";
  return [
    "📦 New Order",
    "",
    `Distributor: ${ctx.distributorName}`,
    `Order #: ${ctx.orderNumber}`,
    `Items: ${ctx.itemsCount}`,
    `Total: ${formatTotal(ctx.orderTotalMad)} MAD`,
    "",
    "Products:",
    productLines,
    "",
    "View order:",
    `${baseUrl}/orders/${ctx.orderId}`,
    "",
    "Please confirm availability.",
  ].join("\n");
}

/**
 * Build the "Confirm Order" message — short confirmation request with
 * suggested reply options.
 */
export function buildSupplierConfirmationMessage(ctx: OrderNotificationContext): string {
  const baseUrl = ctx.appBaseUrl?.replace(/\/$/, "") ?? DEFAULT_APP_BASE_URL;
  return [
    "Hello,",
    "",
    "Please confirm this order:",
    "",
    `Order #: ${ctx.orderNumber}`,
    `Distributor: ${ctx.distributorName}`,
    `Total: ${formatTotal(ctx.orderTotalMad)} MAD`,
    "",
    "Reply with:",
    "✅ Confirmed",
    "❌ Not Available",
    "⏳ Checking Stock",
    "",
    "Order link:",
    `${baseUrl}/orders/${ctx.orderId}`,
  ].join("\n");
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
}

/**
 * Build a customer-facing order summary message in Arabic.
 * Used for quick "new order" notifications via WhatsApp.
 */
export function buildWhatsAppMessage(order: WhatsappOrderSummary): string {
  const lines = order.items.map((i) => `- ${i.name} ×${i.qty}`);
  return `
🛒 طلب جديد

📦 المنتجات:
${lines.join("\n")}

💰 المجموع: ${formatTotal(order.total)} درهم
📍 المدينة: ${order.city}
📞 الهاتف: ${order.phone}

شكراً لك 🙏
`.trim();
}

export interface DistributorCredentialsContext {
  distributorName: string;
  /** Raw phone — will be normalized for display in the message body. */
  phone: string;
  password: string;
  /** Login URL shown in the message. Defaults to the public app URL. */
  loginUrl?: string;
}

const DEFAULT_LOGIN_URL = "https://herbialife-maroc.lovable.app";

/**
 * Welcome / credentials message sent to a freshly-created distributor.
 * Matches the spec template exactly (Arabic, with login URL + phone + password).
 */
export function buildDistributorCredentialsMessage(
  ctx: DistributorCredentialsContext,
): string {
  const loginUrl = (ctx.loginUrl ?? DEFAULT_LOGIN_URL).replace(/\/$/, "");
  const displayPhone = normalizeWhatsappPhone(ctx.phone) || ctx.phone;
  return [
    `السلام عليكم ${ctx.distributorName}،`,
    "",
    "تم إنشاء حسابك في منصة Herbialife Partner Hub.",
    "",
    `🔗 رابط الدخول: ${loginUrl}`,
    `📱 رقم الدخول: ${displayPhone}`,
    `🔐 كلمة المرور: ${ctx.password}`,
    "",
    "يرجى تغيير كلمة المرور بعد أول دخول.",
    "",
    "مرحبا بك معنا 🤝",
  ].join("\n");
}

