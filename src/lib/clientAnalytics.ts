/**
 * Client-dashboard growth events.
 *
 * Forwards to window.dataLayer / window.analytics (GTM-compatible) AND
 * persists to the `analytics_events` table so dashboards can measure impact.
 * Safe — never throws.
 */

import { supabase } from "@/integrations/supabase/client";

type DashboardEvent =
  | "client_dashboard_view"
  | "reorder_click"
  | "recommendation_click"
  | "quick_action_click";

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
  analytics?: { track?: (event: string, payload: Record<string, unknown>) => void };
}

function persistToDb(event: DashboardEvent, payload: Record<string, unknown>): void {
  try {
    const { product_id, vendor_id, user_id, price, ...rest } = payload as {
      product_id?: string | null;
      vendor_id?: string | null;
      user_id?: string | null;
      price?: number | null;
      [k: string]: unknown;
    };
    void supabase
      .from("analytics_events")
      .insert([
        {
          event_name: event,
          product_id: (product_id as string) ?? null,
          vendor_id: (vendor_id as string) ?? null,
          user_id: (user_id as string) ?? null,
          price:
            typeof price === "number" && Number.isFinite(price) ? price : null,
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

export function trackClient(
  event: DashboardEvent,
  payload: Record<string, unknown> = {},
): void {
  try {
    if (typeof window !== "undefined") {
      const enriched = { event, ts: Date.now(), ...payload };
      const w = window as unknown as DataLayerWindow;
      if (Array.isArray(w.dataLayer)) w.dataLayer.push(enriched);
      if (w.analytics?.track) w.analytics.track(event, enriched);
      if (import.meta.env.DEV) {
        // eslint-disable-next-line no-console
        console.debug("[client-analytics]", event, enriched);
      }
    }
    persistToDb(event, payload);
  } catch {
    /* never break UI */
  }
}
