/**
 * Client-dashboard growth events.
 *
 * The `analytics_events` table has a strict CHECK constraint on event_name,
 * so dashboard-specific events (which aren't in that whitelist) are pushed
 * to window.dataLayer / window.analytics only. Safe, never throws.
 */

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
    if (typeof window === "undefined") return;
    const enriched = { event, ts: Date.now(), ...payload };
    const w = window as unknown as DataLayerWindow;
    if (Array.isArray(w.dataLayer)) w.dataLayer.push(enriched);
    if (w.analytics?.track) w.analytics.track(event, enriched);
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.debug("[client-analytics]", event, enriched);
    }
  } catch {
    /* never break UI */
  }
}
