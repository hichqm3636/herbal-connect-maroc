/**
 * Lightweight, fail-safe analytics dispatcher.
 *
 * - Never throws (wraps everything in try/catch)
 * - Forwards to window.dataLayer (GTM-compatible) and any window.analytics.track
 *   sink if present
 * - Persists every event to the `analytics_events` table for in-app dashboards
 */

import { supabase } from "@/integrations/supabase/client";

export type AnalyticsEvent =
  | "product_view"
  | "add_to_cart"
  | "buy_now"
  | "whatsapp_click"
  | "checkout_view"
  | "checkout_completed"
  | "checkout_whatsapp_fallback";

export interface ProductEventPayload {
  product_id?: string | null;
  vendor_id?: string | null;
  price?: number | null;
  user_id?: string | null;
  [key: string]: unknown;
}

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
  analytics?: { track?: (event: string, payload: Record<string, unknown>) => void };
}

function persistToDb(event: AnalyticsEvent, payload: ProductEventPayload): void {
  // Fire and forget — never await, never surface errors.
  try {
    const { product_id, vendor_id, price, user_id, ...rest } = payload;
    void supabase
      .from("analytics_events")
      .insert([
        {
          event_name: event,
          product_id: product_id ?? null,
          vendor_id: vendor_id ?? null,
          user_id: user_id ?? null,
          price: typeof price === "number" && Number.isFinite(price) ? price : null,
          metadata: (rest ?? {}) as never,
        },
      ])
      .then(() => {
        /* swallow */
      });
  } catch {
    /* never break UI */
  }
}

export function track(event: AnalyticsEvent, payload: ProductEventPayload = {}): void {
  try {
    const enriched = { event, ts: Date.now(), ...payload };

    if (typeof window !== "undefined") {
      const w = window as unknown as DataLayerWindow;
      if (Array.isArray(w.dataLayer)) w.dataLayer.push(enriched);
      if (w.analytics?.track) w.analytics.track(event, enriched);

      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[analytics]", event, enriched);
      }
    }

    persistToDb(event, payload);
  } catch {
    // Never let analytics break the UI
  }
}
