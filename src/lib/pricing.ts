// Minimal stub kept for back-compat imports during marketplace migration.
// Legacy distributor pricing logic was removed. New marketplace flow uses
// products.price_mad directly.

export type PartnerType = "client" | "vendor";

export interface PriceTier {
  min_quantity: number;
  unit_price_mad: number;
}

/**
 * Safely parse a `price_tiers` JSON value coming from the database.
 * Legacy column may be null, an array, or an arbitrary JSON shape — return [].
 */
export function parseTiers(value: unknown): PriceTier[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter(
      (t): t is { min_quantity: number; unit_price_mad: number } =>
        !!t &&
        typeof t === "object" &&
        typeof (t as { min_quantity?: unknown }).min_quantity === "number" &&
        typeof (t as { unit_price_mad?: unknown }).unit_price_mad === "number",
    )
    .map((t) => ({
      min_quantity: t.min_quantity,
      unit_price_mad: t.unit_price_mad,
    }));
}
