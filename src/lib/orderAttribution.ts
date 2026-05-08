/**
 * Order attribution — tracks what drove a checkout (reorder, recommendation, …).
 *
 * Stored in localStorage so it survives the navigation between the dashboard
 * (where the user clicks reorder/recommendation) and /checkout (where the
 * order is actually created). Cleared right after the order is placed.
 */

export type OrderSource = "reorder" | "recommendation" | "direct";

const KEY = "order_source";

export function setOrderSource(source: OrderSource): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.setItem(KEY, source);
  } catch {
    /* ignore */
  }
}

export function getOrderSource(): OrderSource {
  try {
    if (typeof window === "undefined") return "direct";
    const v = localStorage.getItem(KEY);
    if (v === "reorder" || v === "recommendation") return v;
    return "direct";
  } catch {
    return "direct";
  }
}

export function clearOrderSource(): void {
  try {
    if (typeof window === "undefined") return;
    localStorage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

const FAST_KEY = "order_fast_checkout";

/** Flag the next checkout as one-tap (auto-submits if profile complete). */
export function setFastCheckout(): void {
  try {
    if (typeof window === "undefined") return;
    sessionStorage.setItem(FAST_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function consumeFastCheckout(): boolean {
  try {
    if (typeof window === "undefined") return false;
    const v = sessionStorage.getItem(FAST_KEY);
    if (v) sessionStorage.removeItem(FAST_KEY);
    return v === "1";
  } catch {
    return false;
  }
}

