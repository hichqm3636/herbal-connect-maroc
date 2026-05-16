/**
 * Public WooCommerce webhook endpoint (per-supplier).
 *
 * URL pattern (configure in each WooCommerce site):
 *   POST https://<your-app>/api/public/woo-webhook?supplier_id=<UUID>
 *
 * Security:
 *  - The supplier_id query param identifies WHICH supplier the webhook is
 *    coming from.
 *  - The `x-wc-webhook-signature` header (base64 HMAC-SHA256 of the raw
 *    body using the supplier's `webhook_secret`) is verified before any
 *    payload processing.
 *  - We reject unknown suppliers, inactive suppliers, and bad signatures
 *    with 401 — leaking nothing about which case it was.
 *
 * Idempotency:
 *  - WooCommerce retries deliveries on failure. We use the
 *    `x-wc-webhook-delivery-id` header (or a hash of the body as fallback)
 *    and a UNIQUE index on `(supplier_id, delivery_id)` to skip duplicates.
 *
 * Supported topics:
 *  - product.created / product.updated → upsert into internal catalog
 *  - product.deleted                   → soft-disable (active = false)
 */

import { createFileRoute } from "@tanstack/react-router";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  loadSupplier,
  upsertWooProductFromWebhook,
  type WooProduct,
} from "@/lib/integrations/herbialife-woocommerce.server";

function verifySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false;
  const expected = createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
  try {
    const a = Buffer.from(signature);
    const b = Buffer.from(expected);
    if (a.length !== b.length) return false;
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

export const Route = createFileRoute("/api/public/woo-webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const url = new URL(request.url);
        const supplierId = url.searchParams.get("supplier_id");
        if (!supplierId) {
          return new Response("Missing supplier_id", { status: 400 });
        }

        const rawBody = await request.text();
        const signature = request.headers.get("x-wc-webhook-signature");
        const topic = request.headers.get("x-wc-webhook-topic") ?? "";
        const deliveryId =
          request.headers.get("x-wc-webhook-delivery-id") ??
          createHash("sha256").update(rawBody).digest("hex");

        const supplier = await loadSupplier(supplierId);
        if (!supplier || !supplier.is_active) {
          // Same status as bad signature → don't leak which suppliers exist
          return new Response("Unauthorized", { status: 401 });
        }

        if (!verifySignature(rawBody, signature, supplier.webhook_secret)) {
          console.warn("[woo-webhook] bad signature", { supplierId, topic, deliveryId });
          return new Response("Unauthorized", { status: 401 });
        }

        // Idempotency: short-circuit on duplicate delivery id
        const { data: existingDelivery } = await supabaseAdmin
          .from("woo_webhook_deliveries" as never)
          .select("id, status")
          .eq("supplier_id", supplier.id)
          .eq("delivery_id", deliveryId)
          .maybeSingle();
        if (existingDelivery) {
          console.log("[woo-webhook] duplicate delivery skipped", { supplierId, deliveryId });
          return new Response(JSON.stringify({ ok: true, duplicate: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        let payload: WooProduct | null = null;
        try {
          payload = JSON.parse(rawBody) as WooProduct;
        } catch (e) {
          console.warn("[woo-webhook] invalid JSON body", e);
        }

        const resourceId = payload?.id != null ? String(payload.id) : null;

        // Insert the delivery record up-front so concurrent retries collide on
        // the unique index instead of racing to upsert the product twice.
        const { error: insErr } = await supabaseAdmin
          .from("woo_webhook_deliveries" as never)
          .insert({
            supplier_id: supplier.id,
            delivery_id: deliveryId,
            topic,
            resource_id: resourceId,
            payload_hash: createHash("sha256").update(rawBody).digest("hex"),
            status: "received",
          } as never);
        if (insErr && !/duplicate key/i.test(insErr.message ?? "")) {
          console.warn("[woo-webhook] failed to record delivery", insErr.message);
        }
        if (insErr && /duplicate key/i.test(insErr.message ?? "")) {
          // Another concurrent retry won
          return new Response(JSON.stringify({ ok: true, duplicate: true }), {
            status: 200,
            headers: { "content-type": "application/json" },
          });
        }

        // Process by topic
        let action: string = "ignored";
        let errorMsg: string | null = null;
        try {
          if (!payload) {
            errorMsg = "Empty or invalid payload";
          } else if (topic === "product.deleted") {
            const r = await upsertWooProductFromWebhook(supplier, payload, { softDelete: true });
            action = r.action;
            if (!r.ok) errorMsg = r.error ?? "soft delete failed";
          } else if (
            topic === "product.created" ||
            topic === "product.updated" ||
            topic === "product.restored"
          ) {
            const r = await upsertWooProductFromWebhook(supplier, payload);
            action = r.action;
            if (!r.ok) errorMsg = r.error ?? "upsert failed";
          } else {
            action = `ignored:${topic || "unknown"}`;
          }
        } catch (e) {
          errorMsg = (e as Error).message;
          console.error("[woo-webhook] processing error", { supplierId, topic, err: errorMsg });
        }

        await supabaseAdmin
          .from("woo_webhook_deliveries" as never)
          .update({
            status: errorMsg ? "error" : "processed",
            error: errorMsg,
            processed_at: new Date().toISOString(),
          } as never)
          .eq("supplier_id", supplier.id)
          .eq("delivery_id", deliveryId);

        console.log("[woo-webhook] processed", {
          supplier: supplier.name,
          topic,
          deliveryId,
          action,
          error: errorMsg,
        });

        return new Response(
          JSON.stringify({ ok: !errorMsg, action, error: errorMsg }),
          { status: errorMsg ? 500 : 200, headers: { "content-type": "application/json" } },
        );
      },
    },
  },
});
