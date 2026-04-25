/**
 * Herbialife WooCommerce Integration (server-only) — multi-supplier.
 *
 * Architectural rules (STRICT):
 *  - Internal DB is the source of truth.
 *  - WooCommerce is an external sync layer; failures NEVER block internal flow.
 *  - All API calls are server-only — credentials never reach the browser.
 *  - Credentials are loaded per-supplier from `public.suppliers`. The legacy
 *    env-based credentials (`WOO_BASE_URL`, `WOOCOMMERCE_CONSUMER_KEY`,
 *    `WOOCOMMERCE_CONSUMER_SECRET`) are still used as a fallback ONLY for
 *    suppliers whose stored credentials look like the migration placeholder
 *    (`env://default`). This preserves backward compatibility with the
 *    pre-multi-supplier setup with zero downtime.
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

export interface WooVariation {
  id?: number;
  image?: WooImage;
}

export interface WooProduct {
  id?: number;
  sku?: string;
  name?: string;
  type?: string;
  description?: string;
  short_description?: string;
  price?: string;
  stock_quantity?: number | null;
  stock_status?: string;
  images?: WooImage[];
  image?: WooImage;
  variations?: WooVariation[] | number[];
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
  /** Map of supplier_id → external Woo order id (one per supplier batch). */
  externalIds?: Record<string, string>;
  /** Convenience: first external id for legacy callers/UIs. */
  externalId?: string;
  externalStatus?: string;
  error?: string;
  /** Per-supplier breakdown for diagnostics. */
  perSupplier?: { supplier_id: string; ok: boolean; externalId?: string; error?: string }[];
}

export interface SupplierRow {
  id: string;
  company_id: string;
  name: string;
  domain: string;
  consumer_key: string;
  consumer_secret: string;
  webhook_secret: string;
  is_active: boolean;
  is_default: boolean;
}

// ---------- Config ----------

const PER_PAGE = 100;
const MAX_PAGES = 1000;
const SOURCE = "herbialife" as const;

interface WooConfig {
  baseUrl: string;
  authHeader: string;
}

/** Marker stored during the migration backfill — means "use env fallback". */
function isPlaceholder(value: string | null | undefined): boolean {
  return !value || value === "env://default";
}

/**
 * Resolve runtime credentials for a supplier row.
 *
 * If the supplier was created via the backfill (placeholder values), we fall
 * back to the legacy env vars so the existing single-supplier deployment
 * keeps working without any manual reconfiguration.
 */
function configFromSupplier(s: SupplierRow): WooConfig | { error: string } {
  const domain = isPlaceholder(s.domain) ? (process.env.WOO_BASE_URL ?? "") : s.domain;
  const key = isPlaceholder(s.consumer_key)
    ? (process.env.WOOCOMMERCE_CONSUMER_KEY ?? "")
    : s.consumer_key;
  const secret = isPlaceholder(s.consumer_secret)
    ? (process.env.WOOCOMMERCE_CONSUMER_SECRET ?? "")
    : s.consumer_secret;

  if (!domain || !key || !secret) {
    return {
      error: `Supplier "${s.name}" is missing WooCommerce credentials.`,
    };
  }
  return {
    baseUrl: domain.replace(/\/+$/, ""),
    authHeader: "Basic " + btoa(`${key}:${secret}`),
  };
}

/** Load a supplier by id (server-only). */
export async function loadSupplier(supplierId: string): Promise<SupplierRow | null> {
  const { data, error } = await supabaseAdmin
    .from("suppliers" as never)
    .select(
      "id, company_id, name, domain, consumer_key, consumer_secret, webhook_secret, is_active, is_default",
    )
    .eq("id", supplierId)
    .maybeSingle();
  if (error) {
    console.warn("[woo] loadSupplier failed:", error.message);
    return null;
  }
  return (data as SupplierRow | null) ?? null;
}

/** Resolve the default supplier for a company (used as fallback). */
export async function loadDefaultSupplier(companyId: string): Promise<SupplierRow | null> {
  const { data } = await supabaseAdmin
    .from("suppliers" as never)
    .select(
      "id, company_id, name, domain, consumer_key, consumer_secret, webhook_secret, is_active, is_default",
    )
    .eq("company_id", companyId)
    .eq("is_default", true)
    .maybeSingle();
  return (data as SupplierRow | null) ?? null;
}

/** Resolve supplier by webhook secret (used by the public webhook route). */
export async function loadSupplierByWebhookSecret(
  secret: string,
): Promise<SupplierRow | null> {
  const { data } = await supabaseAdmin
    .from("suppliers" as never)
    .select(
      "id, company_id, name, domain, consumer_key, consumer_secret, webhook_secret, is_active, is_default",
    )
    .eq("webhook_secret", secret)
    .maybeSingle();
  return (data as SupplierRow | null) ?? null;
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
  stock: number | null;
  category: string | null;
} | null {
  if (!wp?.id) return null;
  const stripHtml = (s: string) =>
    s.replace(/<[^>]*>?/gm, "").replace(/\s+/g, " ").trim();
  const isValidUrl = (url: string) =>
    url.startsWith("http://") || url.startsWith("https://");

  const name = stripHtml(wp.name ?? "");
  if (!name) return null;

  const rawPrice = Number(wp.price);
  const price_mad = Number.isFinite(rawPrice) ? rawPrice : 0;

  const variationImage =
    Array.isArray(wp.variations) && wp.variations.length > 0
      ? typeof wp.variations[0] === "object"
        ? (wp.variations[0] as WooVariation).image?.src
        : undefined
      : undefined;

  const imageRaw =
    wp.images?.[0]?.src?.trim() ||
    variationImage?.trim() ||
    wp.image?.src?.trim() ||
    "";
  const image_url = imageRaw && isValidUrl(imageRaw) ? imageRaw : null;

  const stock: number | null =
    wp.stock_quantity !== null && Number.isFinite(wp.stock_quantity)
      ? Number(wp.stock_quantity)
      : wp.stock_status === "instock"
        ? null
        : 0;

  return {
    external_id: String(wp.id),
    source: SOURCE,
    sku: wp.sku?.trim() || null,
    name_ar: name,
    description_ar: stripHtml(wp.description || wp.short_description || ""),
    price_mad,
    image_url,
    stock,
    category:
      wp.categories?.[0]?.name?.trim().toLowerCase() || "uncategorized",
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
 * Pull every product from a given supplier and upsert into the internal
 * `products` table by `(company_id, supplier_id, external_id)`. Each
 * supplier owns its own product rows — we never overwrite another
 * supplier's row even if SKUs/external_ids collide.
 *
 * If `supplierId` is omitted, we fall back to the company's default
 * supplier — which preserves the previous single-supplier flow.
 */
export async function fetchAndSyncWooProducts(
  companyId: string,
  supplierId?: string,
): Promise<SyncProductsResult> {
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

  const supplier = supplierId
    ? await loadSupplier(supplierId)
    : await loadDefaultSupplier(companyId);

  if (!supplier) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      message: "No supplier configured for this company.",
    };
  }
  if (!supplier.is_active) {
    return {
      ok: false,
      created: 0,
      updated: 0,
      failed: 0,
      errors: [],
      message: `Supplier "${supplier.name}" is disabled.`,
    };
  }

  const cfg = configFromSupplier(supplier);
  if ("error" in cfg) {
    return { ok: false, created: 0, updated: 0, failed: 0, errors: [], message: cfg.error };
  }

  const errors: string[] = [];
  let created = 0;
  let updated = 0;
  let failed = 0;
  let totalFetched = 0;
  let totalPagesHeader: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${cfg.baseUrl}/wp-json/wc/v3/products?per_page=${PER_PAGE}&page=${page}`;
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
      if (res.status === 400 && page > 1) break;
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

    if (totalPagesHeader === null) {
      const hdr = res.headers.get("x-wp-totalpages");
      const parsed = hdr ? Number(hdr) : NaN;
      if (Number.isFinite(parsed) && parsed > 0) totalPagesHeader = parsed;
    }

    const products = (await res.json()) as WooProduct[];
    if (!Array.isArray(products) || products.length === 0) break;
    totalFetched += products.length;

    const externalIds = products
      .map((p) => (p.id != null ? String(p.id) : ""))
      .filter(Boolean);

    // Scope existing-row lookup by (company_id, supplier_id) so we never
    // overwrite another supplier's product even if external_ids collide.
    const existingByExternal = new Map<string, string>();
    if (externalIds.length > 0) {
      const { data: existing, error: fetchErr } = await supabaseAdmin
        .from("products")
        .select("id, external_id")
        .eq("company_id", companyId)
        .eq("supplier_id" as never, supplier.id as never)
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
        // STRICT: external sync is READ-ONLY for internal pricing.
        // We update ONLY: name, description, retail price (price_mad),
        // image, stock, category, sku, source. We NEVER touch:
        //   pharmacy_price, map_price, price_tiers, cost_price,
        //   rrp_price, points_per_unit, minimum_order, pack_size, active.
        // These are internal/manual fields owned by the tenant company.
        const { error } = await supabaseAdmin
          .from("products")
          .update({
            name_ar: mapped.name_ar,
            description_ar: mapped.description_ar,
            price_mad: mapped.price_mad, // retail price from Woo
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
          supplier_id: supplier.id,
        } as never);
        if (error) {
          failed++;
          errors.push(`external_id ${mapped.external_id}: ${error.message}`);
        } else {
          created++;
        }
      }
    }

    if (totalPagesHeader !== null && page >= totalPagesHeader) break;
    if (products.length < PER_PAGE) break;
  }

  console.log(
    `Woo sync (${supplier.name}): fetched ${totalFetched} products (created=${created}, updated=${updated}, failed=${failed})`,
  );

  return { ok: true, created, updated, failed, errors: errors.slice(0, 20) };
}

// ---------- Webhook upsert (single product) ----------

/**
 * Upsert a single Woo product (received via webhook) into the internal
 * catalog, scoped to the supplier that issued the webhook. Used by the
 * `/api/public/woo-webhook` route.
 */
export async function upsertWooProductFromWebhook(
  supplier: SupplierRow,
  wp: WooProduct,
  opts: { softDelete?: boolean } = {},
): Promise<{ ok: boolean; action: "created" | "updated" | "deactivated" | "skipped"; error?: string }> {
  const mapped = mapWooProductToInternal(wp);
  if (!mapped) return { ok: false, action: "skipped", error: "invalid product mapping" };

  // Find existing scoped to this supplier
  const { data: existing } = await supabaseAdmin
    .from("products")
    .select("id")
    .eq("company_id", supplier.company_id)
    .eq("supplier_id" as never, supplier.id as never)
    .eq("external_id", mapped.external_id)
    .maybeSingle();

  if (opts.softDelete) {
    if (!existing?.id) return { ok: true, action: "skipped" };
    const { error } = await supabaseAdmin
      .from("products")
      .update({ active: false })
      .eq("id", existing.id);
    if (error) return { ok: false, action: "skipped", error: error.message };
    return { ok: true, action: "deactivated" };
  }

  if (existing?.id) {
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
      .eq("id", existing.id);
    if (error) return { ok: false, action: "skipped", error: error.message };
    return { ok: true, action: "updated" };
  }

  const { error } = await supabaseAdmin.from("products").insert({
    ...mapped,
    active: true,
    company_id: supplier.company_id,
    supplier_id: supplier.id,
  } as never);
  if (error) return { ok: false, action: "skipped", error: error.message };
  return { ok: true, action: "created" };
}

// ---------- Send order (multi-supplier routing) ----------

interface InternalOrderItemRow {
  quantity: number;
  products: {
    external_id: string | null;
    name_ar: string;
    supplier_id: string | null;
  } | null;
}

interface InternalOrderRow {
  id: string;
  company_id: string;
  order_number: string;
  notes: string | null;
  payment_method: string | null;
  external_id: string | null;
  order_items: InternalOrderItemRow[];
}

/**
 * Push an internal order to one or more WooCommerce suppliers.
 *
 * Behaviour:
 *  - Items are grouped by `products.supplier_id`. Items missing a supplier
 *    fall back to the company's default supplier.
 *  - One Woo order is created per supplier. The internal order keeps a single
 *    row; the resulting external IDs are stored as a JSON map in `external_id`
 *    (e.g. `{"<supplier_id>":"123","<supplier_id_2>":"456"}`) so legacy code
 *    that only reads `external_id` still sees a non-empty value.
 *  - If ANY item is missing a Woo `external_id`, the whole order is rejected
 *    with a sync_error — same behaviour as before.
 *  - Idempotent: if `external_id` already contains a JSON map, we skip.
 */
export async function sendOrderToWoo(orderId: string): Promise<SendOrderResult> {
  const { data, error } = await supabaseAdmin
    .from("orders")
    .select(
      "id, company_id, order_number, notes, payment_method, external_id, order_items(quantity, products(external_id, name_ar, supplier_id))",
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

  // Idempotency: if anything is already stored, skip.
  if (order.external_id) {
    return { ok: true, externalId: order.external_id };
  }

  // Validate items + group by supplier
  const missing: string[] = [];
  const grouped = new Map<string | null, { external_id: string; quantity: number }[]>();
  for (const it of order.order_items ?? []) {
    const ext = it.products?.external_id;
    if (!ext) {
      missing.push(it.products?.name_ar ?? "(منتج بدون اسم)");
      continue;
    }
    if (!Number.isFinite(it.quantity) || it.quantity <= 0) continue;
    const key = it.products?.supplier_id ?? null;
    const list = grouped.get(key) ?? [];
    list.push({ external_id: ext, quantity: it.quantity });
    grouped.set(key, list);
  }

  if (missing.length > 0) {
    const msg = `Cannot send to supplier: products missing external_id: ${missing.join(", ")}`;
    await persistSyncError(order.id, msg);
    return { ok: false, error: msg };
  }
  if (grouped.size === 0) {
    const msg = "Order has no sendable items";
    await persistSyncError(order.id, msg);
    return { ok: false, error: msg };
  }

  // Resolve default supplier once for items with no supplier_id (legacy rows).
  const defaultSupplier = await loadDefaultSupplier(order.company_id);

  const externalIds: Record<string, string> = {};
  const perSupplier: { supplier_id: string; ok: boolean; externalId?: string; error?: string }[] = [];
  let firstStatus: string | undefined;

  for (const [supplierKey, items] of grouped) {
    const supplier =
      (supplierKey ? await loadSupplier(supplierKey) : null) ?? defaultSupplier;
    if (!supplier) {
      const msg = "No supplier resolved for one or more items";
      await persistSyncError(order.id, msg);
      return { ok: false, error: msg, perSupplier };
    }
    if (!supplier.is_active) {
      const msg = `Supplier "${supplier.name}" is disabled`;
      await persistSyncError(order.id, msg);
      perSupplier.push({ supplier_id: supplier.id, ok: false, error: msg });
      return { ok: false, error: msg, perSupplier };
    }
    const cfg = configFromSupplier(supplier);
    if ("error" in cfg) {
      await persistSyncError(order.id, cfg.error);
      perSupplier.push({ supplier_id: supplier.id, ok: false, error: cfg.error });
      return { ok: false, error: cfg.error, perSupplier };
    }

    const payload = mapInternalOrderToWoo({
      lineItems: items,
      paymentMethod: order.payment_method ?? "bacs",
      notes: order.notes,
      internalOrderNumber: `${order.order_number}/${supplier.name}`,
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
      const msg = `Network error to ${supplier.name}: ${(e as Error).message}`;
      await persistSyncError(order.id, msg);
      perSupplier.push({ supplier_id: supplier.id, ok: false, error: msg });
      return { ok: false, error: msg, perSupplier };
    }

    if (!res.ok) {
      const body = await res.text().catch(() => "");
      const msg = `${supplier.name} API ${res.status}: ${body.slice(0, 300)}`;
      await persistSyncError(order.id, msg);
      perSupplier.push({ supplier_id: supplier.id, ok: false, error: msg });
      return { ok: false, error: msg, perSupplier };
    }

    const wooOrder = (await res.json()) as WooOrderResponse;
    const externalId = String(wooOrder.id);
    externalIds[supplier.id] = externalId;
    if (!firstStatus) firstStatus = String(wooOrder.status ?? "");
    perSupplier.push({ supplier_id: supplier.id, ok: true, externalId });
    console.log(
      `[woo] order ${order.order_number} → supplier ${supplier.name} (#${externalId})`,
    );
  }

  // Persist all external IDs as a JSON-encoded map. Legacy callers that read
  // `external_id` see a truthy value (the JSON string), which keeps the
  // idempotency check above working without schema changes.
  const encoded = JSON.stringify(externalIds);
  const { error: updErr } = await supabaseAdmin
    .from("orders")
    .update({
      external_id: encoded,
      external_status: firstStatus ?? "",
      sync_error: null,
    })
    .eq("id", order.id);

  if (updErr) {
    console.warn("[woo] persisted send result failed:", updErr.message);
  }

  // Pick first id for legacy single-supplier callers/UIs
  const firstId = Object.values(externalIds)[0];
  return {
    ok: true,
    externalIds,
    externalId: firstId,
    externalStatus: firstStatus,
    perSupplier,
  };
}

/** Retry helper — same behaviour as sendOrderToWoo but explicit. */
export async function retrySendOrderToWoo(orderId: string): Promise<SendOrderResult> {
  await supabaseAdmin
    .from("orders")
    .update({ sync_error: null, external_id: null })
    .eq("id", orderId);
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
