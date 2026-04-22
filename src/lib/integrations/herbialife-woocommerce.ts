/**
 * Herbialife WooCommerce Integration (server-only).
 *
 * Architectural rules (STRICT):
 *  - Internal DB is the source of truth.
 *  - WooCommerce is an external sync layer; failures NEVER block internal flow.
 *  - All API calls are server-only — credentials never reach the browser.
 *  - This module is decoupled (no UI / no React imports) so suppliers can be
 *    swapped or added later without touching call sites.
 */

import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------- Types ----------

export interface WooImage {
  src?: string;
}

export interface WooCategory {
  id?: number;
  name?: string;
  slug?: string;
}

export interface WooProduct {
  id?: number;
  sku?: string;
  name?: string;
  description?: string;
  price?: string;
  stock_quantity?: number | null;
  images?: WooImage[];
  categories?: WooCategory[];
}

export interface WooOrderLineItem {
  product_id: number;
  quantity: number;
}

export interface WooOrderPayload {
  payment_method: string;
  payment_method_title?: string;
  set_paid: boolean;
  line_items: WooOrderLineItem[];
  customer_note?: string;
  meta_data?: { key: string; value: string }[];
}

export interface WooOrderResponse {
  id: number;
  status: string;
  number?: string;
}

export interface SyncProductsResult {
  ok: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
  message?: string;
}

export interface SendOrderResult {
  ok: boolean;
  externalId?: string;
  externalStatus?: string;
  error?: string;
}

// ---------- Config ----------

const PER_PAGE = 50;
const MAX_PAGES = 100; // safety cap
const SOURCE = "herbialife" as const;

interface WooConfig {
  baseUrl: string;
  authHeader: string;
}

function getWooConfig(): WooConfig | { error: string } {
  // Reuse existing WOOCOMMERCE_* secrets, plus the new WOO_BASE_URL.
  const baseUrlRaw = process.env.WOO_BASE_URL ?? "";
  const key = process.env.WOOCOMMERCE_CONSUMER_KEY ?? "";
  const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET ?? "";

  if (!baseUrlRaw || !key || !secret) {
    return {
      error:
        "WooCommerce credentials are not fully configured. Set WOO_BASE_URL, WOOCOMMERCE_CONSUMER_KEY, WOOCOMMERCE_CONSUMER_SECRET.",
    };
  }
  // Normalize: drop trailing slash.
  const baseUrl = baseUrlRaw.replace(/\/+$/, "");
  const authHeader = "Basic " + btoa(`${key}:${secret}`);
  return { baseUrl, authHeader };
}

// ---------- Mappers ----------

/** Map a WooCommerce product → internal `products` row payload. */
export function mapWooProductToInternal(wp: WooProduct): {
  external_id: string;
  source: string;
  sku: string | null;
  name_ar: string;
  description_ar: string;
  price_mad: number;
  image_url: string | null;
  stock: number;
  category: string | null;
} | null {
  if (wp.id == null) return null;
  const name = (wp.name ?? "").trim();
  const price = Number(wp.price);
  if (!name || !Number.isFinite(price)) return null;

  return {
    external_id: String(wp.id),
    source: SOURCE,
    sku: (wp.sku ?? "").trim() || null,
    name_ar: name,
    description_ar: (wp.description ?? "").trim(),
    price_mad: price,
    image_url: wp.images?.[0]?.src?.trim() || null,
    stock: Number.isFinite(wp.stock_quantity) ? Number(wp.stock_quantity) : 0,
    category: wp.categories?.[0]?.name?.trim() || null,
  };
}

/** Build the WooCommerce order payload from internal items. */
export function mapInternalOrderToWoo(args: {
  lineItems: { external_id: string; quantity: number }[];
  paymentMethod?: string;
  notes?: string | null;
  internalOrderNumber: string;
}): WooOrderPayload {
  return {
    payment_method: args.paymentMethod ?? "bacs",
    payment_method_title: args.paymentMethod ?? "Bank transfer",
    set_paid: false,
    line_items: args.lineItems.map((li) => ({
      product_id: Number(li.external_id),
      quantity: li.quantity,
    })),
    customer_note: args.notes ?? undefined,
    meta_data: [{ key: "internal_order_number", value: args.internalOrderNumber }],
  };
}

// ---------- Fetch products (paginated sync) ----------

/**
 * Pull every published, in-stock product from WooCommerce and upsert into
 * the internal `products` table by `external_id` (within `companyId`).
 *
 * IMPORTANT: We never touch internal-only pricing fields (cost_price, tier
 * pricing, rrp/map, points, pack rules). Only the core fields required to
 * keep the catalog in sync are written.
 */
export async function fetchAndSyncWooProducts(
  companyId: string,
): Promise<SyncProductsResult> {
  const cfg = getWooConfig();
  if ("error" in cfg) {
    return { ok: false, created: 0, updated: 0, failed: 0, errors: [], message: cfg.error };
  }
  if (!companyId) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      message: "Missing companyId.",
    };
  }

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${cfg.baseUrl}/wp-json/wc/v3/products?status=publish&stock_status=instock&per_page=${PER_PAGE}&page=${page}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { Authorization: cfg.authHeader } });
    } catch (e) {
      return {
        ok: false,
        created,
        updated,
        failed,
        errors: [...errors, `Network error: ${(e as Error).message}`],
        message: "Failed to reach WooCommerce API.",
      };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      return {
        ok: false,
        created,
        updated,
        failed,
        errors: [...errors, `WooCommerce API ${res.status}: ${body.slice(0, 200)}`],
        message: `WooCommerce request failed (${res.status}).`,
      };
    }

    const products = (await res.json()) as WooProduct[];
    if (!Array.isArray(products) || products.length === 0) break;

    // Resolve which external_ids already exist for this company (for upsert routing).
    const externalIds = products
      .map((p) => (p.id != null ? String(p.id) : ""))
      .filter(Boolean);

    const existingByExternal = new Map<string, string>();
    if (externalIds.length > 0) {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from("products")
        .select("id, external_id")
        .eq("company_id", companyId)
        .in("external_id", externalIds);
      if (fetchErr) {
        return {
          ok: false,
          created,
          updated,
          failed,
          errors: [...errors, `DB read error: ${fetchErr.message}`],
        };
      }
      for (const p of (existing ?? []) as { id: string; external_id: string | null }[]) {
        if (p.external_id) existingByExternal.set(p.external_id, p.id);
      }
    }

    for (const wp of products) {
      const mapped = mapWooProductToInternal(wp);
      if (!mapped) {
        failed++;
        errors.push(`Skipped Woo product "${wp.name ?? wp.id ?? "?"}": invalid mapping`);
        continue;
      }

      const existingId = existingByExternal.get(mapped.external_id);
      if (existingId) {
        // Update only core sync fields. Never overwrite internal pricing extras.
        const { error } = await supabaseAdmin
          .from("products")
          .update({
            name_ar: mapped.name_ar,
            description_ar: mapped.description_ar,
            price_mad: mapped.price_mad,
            image_url: mapped.image_url,
            stock: mapped.stock,
            category: mapped.category,
            sku: mapped.sku,
            source: mapped.source,
          })
          .eq("id", existingId);
        if (error) {
          failed++;
          errors.push(`external_id ${mapped.external_id}: ${error.message}`);
        } else {
          updated++;
        }
      } else {
        const { error } = await supabaseAdmin.from("products").insert({
          ...mapped,
          active: true,
          company_id: companyId,
        });
        if (error) {
          failed++;
          errors.push(`external_id ${mapped.external_id}: ${error.message}`);
        } else {
          created++;
        }
      }
    }

    if (products.length < PER_PAGE) break;
  }

  return { ok: true, created, updated, failed, errors: errors.slice(0, 20) };
}

// ---------- Send order ----------

interface InternalOrderRow {
  id: string;
  order_number: string;
  notes: string | null;
  payment_method: string | null;
  external_id: string | null;
  order_items: {
    quantity: number;
    products: { external_id: string | null; name_ar: string } | null;
  }[];
}

/**
 * Push an internal order to WooCommerce as a new Woo order.
 *
 * Behaviour (per spec):
 *  - Only sends items whose product has a Woo `external_id`. If ANY item is
 *    missing one, we record `sync_error` and do NOT send a partial order.
 *  - On success: persists `external_id` + `external_status` + clears `sync_error`.
 *  - On failure: persists `sync_error`, NEVER throws to the caller, NEVER
 *    rolls back the internal order.
 *  - Idempotent: if the order already has an `external_id`, returns success
 *    without re-sending.
 */
export async function sendOrderToWoo(orderId: string): Promise<SendOrderResult> {
  const cfg = getWooConfig();
  if ("error" in cfg) {
    await persistSyncError(orderId, cfg.error);
    return { ok: false, error: cfg.error };
  }

  // 1. Load order + items.
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, order_number, notes, payment_method, external_id, order_items(quantity, products(external_id, name_ar))",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (error) {
    const msg = `DB read error: ${error.message}`;
    await persistSyncError(orderId, msg);
    return { ok: false, error: msg };
  }
  const order = data as unknown as InternalOrderRow | null;
  if (!order) {
    return { ok: false, error: "Order not found" };
  }

  // 2. Idempotency.
  if (order.external_id) {
    return { ok: true, externalId: order.external_id };
  }

  // 3. Validate items mapping.
  const items: { external_id: string; quantity: number }[] = [];
  const missing: string[] = [];
  for (const it of order.order_items ?? []) {
    const ext = it.products?.external_id;
    if (!ext) {
      missing.push(it.products?.name_ar ?? "(منتج بدون اسم)");
      continue;
    }
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) continue;
    items.push({ external_id: ext, quantity: it.quantity });
  }

  if (missing.length > 0) {
    const msg = `Cannot send to supplier: products missing external_id: ${missing.join(", ")}`;
    await persistSyncError(order.id, msg);
    return { ok: false, error: msg };
  }
  if (items.length === 0) {
    const msg = "Order has no sendable items";
    await persistSyncError(order.id, msg);
    return { ok: false, error: msg };
  }

  // 4. Build + send.
  const payload = mapInternalOrderToWoo({
    lineItems: items,
    paymentMethod: order.payment_method ?? "bacs",
    notes: order.notes,
    internalOrderNumber: order.order_number,
  });

  let res: Response;
  try {
    res = await fetch(`${cfg.baseUrl}/wp-json/wc/v3/orders`, {
      method: "POST",
      headers: {
        Authorization: cfg.authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    const msg = `Network error: ${(e as Error).message}`;
    await persistSyncError(order.id, msg);
    return { ok: false, error: msg };
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const msg = `WooCommerce API ${res.status}: ${body.slice(0, 300)}`;
    await persistSyncError(order.id, msg);
    return { ok: false, error: msg };
  }

  const wooOrder = (await res.json()) as WooOrderResponse;
  const externalId = String(wooOrder.id);
  const externalStatus = String(wooOrder.status ?? "");

  // 5. Persist success.
  const { error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      external_id: externalId,
      external_status: externalStatus,
      sync_error: null,
    })
    .eq("id", order.id);

  if (updErr) {
    // The order WAS sent; we just failed to persist. Surface for retry/monitoring
    // but do not consider this a sync failure for the user.
    console.warn("[woo] persisted send result failed:", updErr.message);
  }

  return { ok: true, externalId, externalStatus };
}

/** Retry helper — same behaviour as sendOrderToWoo but explicit. */
export async function retrySendOrderToWoo(orderId: string): Promise<SendOrderResult> {
  // Clear previous error so the UI updates immediately on retry, then send.
  await supabaseAdmin.from("orders").update({ sync_error: null }).eq("id", orderId);
  return sendOrderToWoo(orderId);
}

async function persistSyncError(orderId: string, message: string): Promise<void> {
  try {
    await supabaseAdmin
      .from("orders")
      .update({ sync_error: message.slice(0, 1000) })
      .eq("id", orderId);
  } catch (e) {
    console.warn("[woo] failed to persist sync_error:", (e as Error).message);
  }
}
