/**
 * Client-dashboard growth events.
 *
 * Forwards to window.dataLayer / window.analytics (GTM-compatible) AND
 * persists via the secure `ingestAnalytics` server function. Direct client
 * INSERTs into `analytics_events` are no longer permitted. Safe — never throws.
 */

import { ingestAnalytics } from "@/lib/analyticsIngest.functions";

type DashboardEvent =
  | "client_dashboard_view"
  | "reorder_click"
  | "recommendation_click"
  | "quick_action_click";

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
  analytics?: { track?: (event: string, payload: Record<string, unknown>) => void };
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
    const { product_id, price, vendor_id: _v, user_id: _u, ...rest } =
      payload as {
        product_id?: string | null;
        vendor_id?: string | null;
        user_id?: string | null;
        price?: number | null;
        [k: string]: unknown;
      };
    void _v;
    void _u;
    void ingestAnalytics({
      data: {
        events: [
          {
            event_name: event,
            product_id: (product_id as string) ?? null,
            price:
              typeof price === "number" && Number.isFinite(price) ? price : null,
            metadata: rest as Record<string, unknown>,
          },
        ],
      },
    }).catch(() => {
      /* swallow */
    });
  } catch {
    /* never break UI */
  }
}
