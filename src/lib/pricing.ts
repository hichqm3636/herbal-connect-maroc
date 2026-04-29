// Minimal stub kept for back-compat imports during marketplace migration.
// Legacy distributor pricing logic was removed. New marketplace flow uses
// products.price_mad directly.

export type PartnerType = "client" | "vendor";

export interface PriceTier {
  min_quantity: number;
  unit_price_mad: number;
}
