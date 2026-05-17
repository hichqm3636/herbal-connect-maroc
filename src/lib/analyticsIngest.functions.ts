/**
 * Secure analytics ingestion.
 *
 * Replaces direct client INSERTs into `analytics_events`. The browser now calls
 * this server function, which:
 *   - validates payload shape + size with zod
 *   - whitelists `event_name`
 *   - resolves `vendor_id` server-side from `product_id` (never trusts client)
 *   - rate-limits per IP + per user (in-memory token bucket, best-effort)
 *   - deduplicates identical events inside a short window (Postgres-backed)
 *   - logs every rejection to `analytics_rejections` for audit
 *
 * Inserts are performed with the service-role client because the table has no
 * INSERT RLS policy (intentional — only this path may write).
 */
import { createServerFn } from "@tanstack/react-start";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// Mirror of the CHECK constraint on analytics_events.event_name
const ALLOWED_EVENTS = [
  "product_view","add_to_cart","buy_now","whatsapp_click",
  "checkout_view","checkout_completed","checkout_whatsapp_fallback",
  "checkout_field_focus","checkout_payment_selected","checkout_validation_failed",
  "time_on_product","scroll_depth_25","scroll_depth_50","scroll_depth_75","scroll_depth_100",
  "exit_before_add_to_cart","ab_assignment",
  "client_dashboard_view","reorder_click","recommendation_click","quick_action_click",
  "landing_view","landing_cta_click","landing_category_click","landing_vendor_click","landing_nav_click",
  "signup_view","signup_started","signup_completed","signup_failed","vendor_onboarded",
  "vendors_directory_view","vendor_store_view",
  "pricing_view","pricing_plan_click","subscription_simulated","subscription_upgraded","billing_view",
] as const;

export const EventSchema = z.object({
  event_name: z.enum(ALLOWED_EVENTS as unknown as [string, ...string[]]),
  product_id: z.string().uuid().nullable().optional(),
  price: z.number().finite().min(0).max(1_000_000).nullable().optional(),
  // Metadata: small, flat-ish JSON. Reject oversize.
  metadata: z
    .record(z.string().max(64), z.unknown())
    .optional()
    .refine((m) => !m || JSON.stringify(m).length <= 2_000, {
      message: "metadata too large",
    }),
});

export type AnalyticsEventInput = z.infer<typeof EventSchema>;

const InputSchema = z.object({
  events: z.array(EventSchema).min(1).max(20),
});

// ---------- Rate limiting (per-isolate, best-effort) ----------
// Token-bucket per key. Workers create multiple isolates so this is NOT a
// global limiter — defense in depth on top of the dedup query below.
interface Bucket { tokens: number; updated: number }
const buckets = new Map<string, Bucket>();
const RATE_CAPACITY = 60;       // burst
const RATE_REFILL_PER_SEC = 5;  // sustained
const BUCKET_GC_MAX = 5000;

function takeToken(key: string): boolean {
  const now = Date.now();
  let b = buckets.get(key);
  if (!b) {
    if (buckets.size > BUCKET_GC_MAX) {
      // crude GC — drop oldest
      const cutoff = now - 60_000;
      for (const [k, v] of buckets) if (v.updated < cutoff) buckets.delete(k);
    }
    b = { tokens: RATE_CAPACITY, updated: now };
    buckets.set(key, b);
  }
  const elapsed = (now - b.updated) / 1000;
  b.tokens = Math.min(RATE_CAPACITY, b.tokens + elapsed * RATE_REFILL_PER_SEC);
  b.updated = now;
  if (b.tokens < 1) return false;
  b.tokens -= 1;
  return true;
}

function hashIp(ip: string | undefined): string {
  if (!ip) return "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

async function resolveUserId(): Promise<string | null> {
  const auth = getRequestHeader("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const { data } = await supabaseAdmin.auth.getUser(auth.slice(7));
    return data.user?.id ?? null;
  } catch {
    return null;
  }
}

async function logRejection(
  reason: string,
  ev: { event_name?: string; user_id?: string | null; ip_hash: string; payload: unknown },
): Promise<void> {
  try {
    await supabaseAdmin.from("analytics_rejections").insert({
      reason,
      event_name: ev.event_name ?? null,
      user_id: ev.user_id ?? null,
      ip_hash: ev.ip_hash,
      payload: (ev.payload ?? {}) as never,
    });
  } catch {
    /* swallow — never break ingestion path */
  }
}

const DEDUP_WINDOW_SECONDS = 5;

export const ingestAnalytics = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    // Reject oversized payloads early
    const size = JSON.stringify(input ?? {}).length;
    if (size > 10_000) {
      throw new Error("payload too large");
    }
    return InputSchema.parse(input);
  })
  .handler(async ({ data }) => {
    const ip = getRequestIP({ xForwardedFor: true });
    const ipHash = hashIp(ip);
    const userId = await resolveUserId();

    // Rate-limit per IP and (if signed in) per user
    if (!takeToken(`ip:${ipHash}`)) {
      await logRejection("rate_limited_ip", {
        ip_hash: ipHash, user_id: userId, payload: { count: data.events.length },
      });
      return { accepted: 0, rejected: data.events.length, reason: "rate_limited" as const };
    }
    if (userId && !takeToken(`u:${userId}`)) {
      await logRejection("rate_limited_user", {
        ip_hash: ipHash, user_id: userId, payload: { count: data.events.length },
      });
      return { accepted: 0, rejected: data.events.length, reason: "rate_limited" as const };
    }

    // Resolve vendor_id server-side from any product_id we see
    const productIds = Array.from(
      new Set(data.events.map((e) => e.product_id).filter((x): x is string => !!x)),
    );
    const productVendor = new Map<string, string>();
    if (productIds.length > 0) {
      const { data: rows } = await supabaseAdmin
        .from("products")
        .select("id, company_id")
        .in("id", productIds);
      for (const r of rows ?? []) {
        if (r.company_id) productVendor.set(r.id, r.company_id);
      }
    }

    type AnalyticsRow = {
      event_name: string;
      product_id: string | null;
      vendor_id: string | null;
      user_id: string | null;
      price: number | null;
      metadata: never;
    };
    const rows: AnalyticsRow[] = [];
    let rejected = 0;

    for (const ev of data.events) {
      // Server-resolved vendor id; never from client input.
      const vendorId = ev.product_id ? productVendor.get(ev.product_id) ?? null : null;

      // Dedup: same event_name + user/ip + product within window
      const dedupKey = createHash("sha256")
        .update(
          [
            ev.event_name,
            userId ?? `ip:${ipHash}`,
            ev.product_id ?? "",
            vendorId ?? "",
          ].join("|"),
        )
        .digest("hex");

      const sinceIso = new Date(Date.now() - DEDUP_WINDOW_SECONDS * 1000).toISOString();
      const { data: recent } = await supabaseAdmin
        .from("analytics_events")
        .select("id")
        .eq("event_name", ev.event_name)
        .gte("created_at", sinceIso)
        .eq(userId ? "user_id" : "metadata->>__dk", userId ?? dedupKey)
        .limit(1);

      if (recent && recent.length > 0) {
        rejected += 1;
        await logRejection("duplicate", {
          event_name: ev.event_name, ip_hash: ipHash, user_id: userId, payload: ev,
        });
        continue;
      }

      rows.push({
        event_name: ev.event_name,
        product_id: ev.product_id ?? null,
        vendor_id: vendorId,           // server-resolved
        user_id: userId,               // server-resolved
        price: ev.price ?? null,
        metadata: { ...(ev.metadata ?? {}), __dk: dedupKey, ip_hash: ipHash } as never,
      });
    }

    if (rows.length === 0) {
      return { accepted: 0, rejected, reason: "duplicate" as const };
    }

    const { error } = await supabaseAdmin.from("analytics_events").insert(rows);
    if (error) {
      await logRejection(`insert_error:${error.code ?? "unknown"}`, {
        ip_hash: ipHash, user_id: userId, payload: { count: rows.length, msg: error.message },
      });
      return { accepted: 0, rejected: rows.length + rejected, reason: "insert_error" as const };
    }

    return { accepted: rows.length, rejected, reason: "ok" as const };
  });
