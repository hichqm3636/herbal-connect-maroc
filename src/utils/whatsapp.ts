/**
 * WhatsApp Quick Contact helpers.
 *
 * Manual contact shortcut only — does NOT use the WhatsApp Business API.
 * Generates a `wa.me` deep link that opens WhatsApp Web on desktop and
 * the WhatsApp app on mobile.
 */

/**
 * Strip everything that isn't a digit. wa.me requires a phone number in
 * international format with no `+`, spaces, or dashes.
 */
export function normalizeWhatsappPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  return phone.replace(/\D+/g, "");
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
