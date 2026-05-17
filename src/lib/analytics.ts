/**
 * Lightweight, fail-safe analytics dispatcher.
 *
 * - Never throws (wraps everything in try/catch)
 * - Forwards to window.dataLayer (GTM-compatible) and any window.analytics.track
 *   sink if present
 * - Persists every event via the secure `ingestAnalytics` server function
 *   (server-side validation, rate limiting, dedup, tenant resolution).
 *   Direct client INSERTs into `analytics_events` are no longer permitted.
 */

import { ingestAnalytics } from "@/lib/analyticsIngest.functions";

export type AnalyticsEvent =
  | "product_view"
  | "add_to_cart"
  | "buy_now"
  | "whatsapp_click"
  | "checkout_view"
  | "checkout_completed"
  | "checkout_whatsapp_fallback"
  | "checkout_field_focus"
  | "checkout_payment_selected"
  | "checkout_validation_failed"
  | "time_on_product"
  | "scroll_depth_25"
  | "scroll_depth_50"
  | "scroll_depth_75"
  | "scroll_depth_100"
  | "exit_before_add_to_cart"
  | "ab_assignment"
  | "landing_view"
  | "landing_cta_click"
  | "landing_category_click"
  | "landing_vendor_click"
  | "landing_nav_click"
  | "vendors_directory_view"
  | "vendor_store_view"
  | "signup_view"
  | "signup_started"
  | "signup_completed"
  | "signup_failed"
  | "vendor_onboarded"
  | "pricing_view"
  | "pricing_plan_click"
  | "subscription_simulated"
  | "subscription_upgraded"
  | "billing_view";

export interface ProductEventPayload {
  product_id?: string | null;
  vendor_id?: string | null; // ignored by server (resolved from product_id)
  price?: number | null;
  user_id?: string | null;   // ignored by server (resolved from auth)
  [key: string]: unknown;
}

interface DataLayerWindow {
  dataLayer?: Array<Record<string, unknown>>;
  analytics?: { track?: (event: string, payload: Record<string, unknown>) => void };
}

// ---------- Client-side micro-batching + best-effort dedup ----------
interface QueuedEvent {
  event_name: string;
  product_id?: string | null;
  price?: number | null;
  metadata?: Record<string, unknown>;
}
const queue: QueuedEvent[] = [];
let flushTimer: ReturnType<typeof setTimeout> | null = null;
const lastSentAt = new Map<string, number>(); // client-side dedup hint
const CLIENT_DEDUP_MS = 1500;

function scheduleFlush() {
  if (flushTimer || typeof window === "undefined") return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    const batch = queue.splice(0, queue.length);
    if (batch.length === 0) return;
    try {
      void ingestAnalytics({ data: { events: batch } }).catch(() => {
        /* swallow */
      });
    } catch {
      /* swallow */
    }
  }, 400);
}

function enqueue(ev: QueuedEvent) {
  const key = `${ev.event_name}|${ev.product_id ?? ""}`;
  const now = Date.now();
  const last = lastSentAt.get(key) ?? 0;
  if (now - last < CLIENT_DEDUP_MS) return;
  lastSentAt.set(key, now);
  queue.push(ev);
  scheduleFlush();
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

    // Strip server-controlled fields before sending.
    const { product_id, price, vendor_id: _v, user_id: _u, ...rest } = payload;
    void _v;
    void _u;
    enqueue({
      event_name: event,
      product_id: product_id ?? null,
      price: typeof price === "number" && Number.isFinite(price) ? price : null,
      metadata: rest as Record<string, unknown>,
    });
  } catch {
    // Never let analytics break the UI
  }
}
