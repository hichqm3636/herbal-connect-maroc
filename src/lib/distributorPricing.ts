// Single source of truth for the "distributor unit price" formula.
//
// A distributor's unit price is derived from the product's base price and the
// distributor's tier discount — NOT from the cart, the legacy price_tiers
// array, or any previously stored value. This guarantees that two orders
// placed by the same distributor for the same product always store the same
// unit_price_mad as long as the base price and tier discount are unchanged.
//
//   unit_price = round2( base_price * (1 - tier_discount_percent / 100) )
//
// `base_price` = products.rrp_price when present, otherwise products.price_mad.
// We prefer rrp_price because it is the catalog/RRP figure the discount is
// always quoted against in the admin UI ("إجمالي الخصم 40%").

export interface DistributorPriceProduct {
  rrp_price?: number | null;
  price_mad: number;
}

export function basePriceFor(product: DistributorPriceProduct): number {
  const rrp = product.rrp_price;
  if (rrp != null && Number.isFinite(Number(rrp)) && Number(rrp) > 0) {
    return Number(rrp);
  }
  return Number(product.price_mad) || 0;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Compute the expected distributor unit price.
 * Rounded to 2 decimals so it survives a JSON round-trip into numeric(.,2)
 * columns without accumulating floating-point noise.
 */
export function expectedDistributorUnitPrice(
  product: DistributorPriceProduct,
  tierDiscountPercent: number,
): number {
  const base = basePriceFor(product);
  const pct = Number.isFinite(tierDiscountPercent) ? tierDiscountPercent : 0;
  const clamped = Math.max(0, Math.min(100, pct));
  return round2(base * (1 - clamped / 100));
}

/** Drift tolerance: anything > 1 cent is considered a mismatch. */
export const PRICE_DRIFT_TOLERANCE = 0.01;

export function isPriceDrift(stored: number, expected: number): boolean {
  return Math.abs(Number(stored) - Number(expected)) > PRICE_DRIFT_TOLERANCE;
}
