import { supabase } from "@/integrations/supabase/client";

/**
 * Returns the set of product IDs (from the given list) that should be HIDDEN
 * for a distributor in a specific territory because of `product_zones` restrictions.
 *
 * Rule: a product with no rows in product_zones is available everywhere.
 * If it has any rows, the distributor's territory must appear in them.
 *
 * Returns an empty set when there is nothing to hide (no territory, no products,
 * or no restrictions match the given products).
 */
export async function getHiddenProductIds(
  productIds: string[],
  territoryId: string | null,
): Promise<Set<string>> {
  if (!productIds.length) return new Set();
  // No territory assigned → hide every restricted product (safer default).
  const { data, error } = await supabase
    .from("product_zones")
    .select("product_id, zone_id")
    .in("product_id", productIds);
  if (error || !data) return new Set();

  const byProduct = new Map<string, Set<string>>();
  for (const row of data) {
    const set = byProduct.get(row.product_id) ?? new Set<string>();
    set.add(row.zone_id);
    byProduct.set(row.product_id, set);
  }
  const hidden = new Set<string>();
  for (const [productId, zones] of byProduct) {
    if (!territoryId || !zones.has(territoryId)) hidden.add(productId);
  }
  return hidden;
}
