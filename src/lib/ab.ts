/**
 * Lightweight A/B testing — variant assigned once per visitor and persisted
 * in localStorage. First assignment is logged via the `ab_assignment` event.
 */
import { track } from "@/lib/analytics";

export const AB_EXPERIMENTS = {
  cta_label: ["add_to_cart", "buy_now"] as const,
  price_display: ["plain", "highlight"] as const,
  trust_badges: ["with", "without"] as const,
} as const;

export type ExperimentName = keyof typeof AB_EXPERIMENTS;
export type Variant<E extends ExperimentName> = (typeof AB_EXPERIMENTS)[E][number];

const STORAGE_KEY = "ab_variants_v1";

function readStore(): Record<string, string> {
  if (typeof window === "undefined") return {};
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function writeStore(s: Record<string, string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s));
  } catch {
    /* ignore */
  }
}

/**
 * Get (or assign) the variant for an experiment. Stable per visitor.
 * Logs an `ab_assignment` event the first time a variant is chosen.
 */
export function getVariant<E extends ExperimentName>(
  experiment: E,
  context?: { product_id?: string | null; vendor_id?: string | null; user_id?: string | null },
): Variant<E> {
  const variants = AB_EXPERIMENTS[experiment] as readonly string[];
  if (typeof window === "undefined") return variants[0] as Variant<E>;

  const store = readStore();
  const existing = store[experiment];
  if (existing && variants.includes(existing)) {
    return existing as Variant<E>;
  }

  const chosen = variants[Math.floor(Math.random() * variants.length)] as Variant<E>;
  store[experiment] = chosen;
  writeStore(store);

  track("ab_assignment", {
    experiment,
    variant: chosen,
    product_id: context?.product_id ?? null,
    vendor_id: context?.vendor_id ?? null,
    user_id: context?.user_id ?? null,
  });

  return chosen;
}

/**
 * Snapshot of all assigned variants. Useful to attach to conversion events
 * (e.g. checkout_completed) so we can attribute conversions to variants.
 */
export function getAllVariants(): Record<string, string> {
  return readStore();
}
