/**
 * Lightweight, fail-safe analytics dispatcher.
 *
 * - Never throws (wraps everything in try/catch)
 * - Forwards to window.dataLayer (GTM-compatible) and any window.analytics.track
 *   sink if present, otherwise console.debug in dev only
 * - Strongly-typed event names + payloads to keep call sites consistent
 */

export type AnalyticsEvent =
  | "product_view"
  | "add_to_cart"
  | "buy_now"
  | "whatsapp_click";

export interface ProductEventPayload {
  product_id: string;
  vendor_id: string;
  price: number;
  user_id?: string | null;
  [key: string]: unknown;
}

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
  analytics?: { track?: (event: string, payload: Record<string, unknown>) => void };
}

export function track(event: AnalyticsEvent, payload: ProductEventPayload): void {
  try {
    const enriched = {
      event,
      ts: Date.now(),
      ...payload,
    };

    if (typeof window === "undefined") return;
    const w = window as unknown as DataLayerWindow;

    // GTM / dataLayer
    if (Array.isArray(w.dataLayer)) {
      w.dataLayer.push(enriched);
    }

    // Segment-style sink, if any
    if (w.analytics?.track) {
      w.analytics.track(event, enriched);
    }

    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[analytics]", event, enriched);
    }
  } catch {
    // Never let analytics break the UI
  }
}
