/**
 * Stock display & validation helpers.
 *
 * Semantics of `stock` field on a product:
 *   - `null`  → available, but exact quantity is unknown (e.g. WooCommerce
 *               returned `stock_status: "instock"` with no `stock_quantity`).
 *               Treated as "in stock" but never shows a number.
 *   - `0`     → out of stock. Cannot be added to cart / ordered.
 *   - `> 0`   → exact tracked quantity.
 */

export type Stock = number | null;

/** Default fallback when admin hasn't uploaded a real product image yet. */
export const DEFAULT_PRODUCT_IMAGE =
  "https://jarlejsbrxtrusfjklkg.supabase.co/storage/v1/object/public/product-images/default-product.jpg";

/** Is the product orderable right now? */
export function isInStock(stock: Stock): boolean {
  return stock === null || stock > 0;
}

/** Is the product strictly out of stock? */
export function isOutOfStock(stock: Stock): boolean {
  return stock === 0;
}

/** Low-stock = tracked quantity at or below threshold (default 10). */
export function isLowStock(stock: Stock, threshold = 10): boolean {
  return typeof stock === "number" && stock > 0 && stock <= threshold;
}

/** Arabic label suitable for badges / list rows. */
export function displayStockLabel(stock: Stock): string {
  if (stock === null) return "متوفر";
  if (stock === 0) return "نفد المخزون";
  if (stock <= 10) return `${stock} وحدة — كمية محدودة`;
  return `${stock} وحدة`;
}

/** Semantic color hint for badges (maps to design tokens at the call site). */
export type StockTone = "success" | "warning" | "destructive";
export function stockTone(stock: Stock): StockTone {
  if (stock === 0) return "destructive";
  if (typeof stock === "number" && stock <= 10) return "warning";
  return "success";
}

/**
 * Maximum quantity a user can add to cart.
 *  - null  → unlimited (we don't know, trust upstream)
 *  - 0     → 0 (cannot order)
 *  - n     → n
 */
export function maxOrderQty(stock: Stock): number {
  if (stock === null) return Number.POSITIVE_INFINITY;
  return stock;
}

/** True when the requested quantity exceeds known stock. Always false for null. */
export function exceedsStock(stock: Stock, qty: number): boolean {
  if (stock === null) return false;
  return qty > stock;
}
