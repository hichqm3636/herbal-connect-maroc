// Wholesale pricing engine.
// Pure functions only — safe to use on client and server.

export type PartnerType =
  | "pharmacy"
  | "parapharmacy"
  | "distributor"
  | "master_distributor";

export interface PriceTier {
  min_qty: number;
  price: number;
}

export interface PricedProduct {
  rrp_price: number | null;
  pharmacy_price: number | null;
  map_price: number | null;
  minimum_order: number;
  price_tiers: PriceTier[];
  /** Legacy fallback when wholesale fields are missing. */
  price_mad: number;
}

export const PARTNER_TYPE_LABELS: Record<PartnerType, string> = {
  pharmacy: "صيدلية",
  parapharmacy: "شبه صيدلية",
  distributor: "موزع",
  master_distributor: "موزع رئيسي",
};

const round = (n: number) => Math.round(n);

/**
 * Auto pricing engine driven by product cost.
 * Recommended multipliers:
 *   tier_24        = cost × 1.55
 *   tier_12        = cost × 1.70
 *   tier_6         = cost × 1.85   (also used as base distributor price)
 *   pharmacy_price = cost × 2.00
 *   rrp_price      = cost × 2.80
 *   map_price      = rrp × 0.90
 */
export function deriveFromCost(cost: number) {
  const tier6 = cost * 1.85;
  const tier12 = cost * 1.7;
  const tier24 = cost * 1.55;
  const pharmacy = cost * 2;
  const rrp = cost * 2.8;
  const map = rrp * 0.9;
  return {
    distributor_price: round(tier6),
    pharmacy_price: round(pharmacy),
    rrp_price: round(rrp),
    map_price: round(map),
    price_tiers: [
      { min_qty: 6, price: round(tier6) },
      { min_qty: 12, price: round(tier12) },
      { min_qty: 24, price: round(tier24) },
    ] as PriceTier[],
  };
}

/**
 * Default wholesale prices derived from RRP. Admin can override any field.
 */
export function deriveWholesaleFromRRP(rrp: number) {
  return {
    pharmacy_price: round(rrp * 0.7),
    map_price: round(rrp * 0.9),
    price_tiers: [
      { min_qty: 6, price: round(rrp * 0.68) },
      { min_qty: 12, price: round(rrp * 0.65) },
      { min_qty: 24, price: round(rrp * 0.6) },
    ] as PriceTier[],
  };
}

function sortedTiers(tiers: PriceTier[]): PriceTier[] {
  return [...tiers].sort((a, b) => a.min_qty - b.min_qty);
}

/**
 * The deepest tier price (used for master_distributor).
 * Falls back to the first tier or RRP-based 0.6 if none.
 */
function deepestTierPrice(product: PricedProduct): number | null {
  const tiers = sortedTiers(product.price_tiers);
  if (tiers.length === 0) return null;
  return tiers[tiers.length - 1].price;
}

/**
 * Return the tier whose `min_qty` is the largest value still <= qty.
 * If qty is below the smallest tier, returns null (no wholesale tier applies yet).
 */
function tierForQty(tiers: PriceTier[], qty: number): PriceTier | null {
  const sorted = sortedTiers(tiers);
  let match: PriceTier | null = null;
  for (const t of sorted) {
    if (qty >= t.min_qty) match = t;
  }
  return match;
}

export interface UnitPriceResult {
  unitPrice: number;
  /** Human label of which pricing rule was applied. */
  source:
    | "pharmacy"
    | "tier"
    | "deepest_tier"
    | "rrp_fallback"
    | "below_min_tier";
  /** The tier that was applied, when source = "tier" or "deepest_tier". */
  tier?: PriceTier;
}

/**
 * Compute the effective unit price for the given partner + quantity.
 * This is a price quote — it does NOT enforce minimum_order / MAP.
 * Use `validateLine` for blocking checks.
 */
export function getUnitPrice(
  product: PricedProduct,
  partnerType: PartnerType,
  qty: number,
): UnitPriceResult {
  const fallbackRrp =
    product.rrp_price ?? product.price_mad ?? 0;

  // Pharmacy / parapharmacy → flat pharmacy_price
  if (partnerType === "pharmacy" || partnerType === "parapharmacy") {
    const flat = product.pharmacy_price ?? round(fallbackRrp * 0.7);
    return { unitPrice: flat, source: "pharmacy" };
  }

  // Master distributor → always the deepest tier
  if (partnerType === "master_distributor") {
    const deepest = deepestTierPrice(product);
    if (deepest != null) {
      const tier = sortedTiers(product.price_tiers).slice(-1)[0];
      return { unitPrice: deepest, source: "deepest_tier", tier };
    }
    return {
      unitPrice: round(fallbackRrp * 0.6),
      source: "rrp_fallback",
    };
  }

  // Distributor → quantity tiers
  const tier = tierForQty(product.price_tiers, qty);
  if (tier) {
    return { unitPrice: tier.price, source: "tier", tier };
  }

  // Below the smallest tier: charge the smallest-tier price as the floor,
  // or RRP if no tiers configured. This will usually be paired with a
  // minimum_order block, so the price shown is informational.
  const sorted = sortedTiers(product.price_tiers);
  if (sorted.length > 0) {
    return {
      unitPrice: sorted[0].price,
      source: "below_min_tier",
      tier: sorted[0],
    };
  }
  return { unitPrice: fallbackRrp, source: "rrp_fallback" };
}

export interface LineValidation {
  ok: boolean;
  /** Localized message (Arabic) suitable for toast display. */
  message?: string;
  reason?: "min_order" | "map_violation";
}

/**
 * Validate a cart line against minimum order quantity and MAP rules.
 * MAP is only enforced for pharmacy / parapharmacy partners (resellers).
 */
export function validateLine(
  product: PricedProduct,
  partnerType: PartnerType,
  qty: number,
  unitPrice: number,
  productName?: string,
): LineValidation {
  const label = productName ? ` (${productName})` : "";

  if (qty < product.minimum_order) {
    return {
      ok: false,
      reason: "min_order",
      message: `الحد الأدنى للطلب${label}: ${product.minimum_order} وحدة`,
    };
  }

  if (
    (partnerType === "pharmacy" || partnerType === "parapharmacy") &&
    product.map_price != null &&
    unitPrice < product.map_price
  ) {
    return {
      ok: false,
      reason: "map_violation",
      message: `لا يمكن البيع تحت السعر الأدنى المعلن${label}`,
    };
  }

  return { ok: true };
}

/**
 * Coerce a raw products row into PricedProduct shape, parsing the JSON tier array.
 */
export function parseTiers(raw: unknown): PriceTier[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((t) => {
      if (!t || typeof t !== "object") return null;
      const obj = t as Record<string, unknown>;
      const min_qty = Number(obj.min_qty);
      const price = Number(obj.price);
      if (!Number.isFinite(min_qty) || !Number.isFinite(price)) return null;
      return { min_qty, price };
    })
    .filter((t): t is PriceTier => t !== null);
}
