import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

interface WooImage {
  src?: string;
}

interface WooProduct {
  sku?: string;
  name?: string;
  price?: string;
  stock_quantity?: number | null;
  images?: WooImage[];
}

interface SyncResult {
  ok: boolean;
  created: number;
  updated: number;
  failed: number;
  errors: string[];
  message?: string;
}

const WOO_SITE_URL = "https://herbialife.com";
const PER_PAGE = 100;

export const syncWooCommerceProducts = createServerFn({ method: "POST" })
  .handler(async (): Promise<SyncResult> => {
    const key = process.env.WOOCOMMERCE_CONSUMER_KEY;
    const secret = process.env.WOOCOMMERCE_CONSUMER_SECRET;

    if (!key || !secret) {
      return {
        ok: false,
        created: 0,
        updated: 0,
        failed: 0,
        errors: [],
        message:
          "WooCommerce API credentials are not configured. Add WOOCOMMERCE_CONSUMER_KEY and WOOCOMMERCE_CONSUMER_SECRET to enable sync.",
      };
    }

    const auth = "Basic " + btoa(`${key}:${secret}`);
    const errors: string[] = [];
    let created = 0;
    let updated = 0;
    let failed = 0;

    let page = 1;
    while (true) {
      const url = `${WOO_SITE_URL}/wp-json/wc/v3/products?status=publish&stock_status=instock&per_page=${PER_PAGE}&page=${page}`;
      let res: Response;
      try {
        res = await fetch(url, { headers: { Authorization: auth } });
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

      const skus = products
        .map((p) => (p.sku ?? "").trim())
        .filter(Boolean);

      const existingBySku = new Map<string, string>();
      if (skus.length > 0) {
        const { data: existing, error: fetchErr } = await supabaseAdmin
          .from("products")
          .select("id, sku")
          .in("sku", skus);
        if (fetchErr) {
          return {
            ok: false,
            created,
            updated,
            failed,
            errors: [...errors, `DB read error: ${fetchErr.message}`],
          };
        }
        for (const p of existing ?? []) {
          if (p.sku) existingBySku.set(p.sku, p.id);
        }
      }

      for (const wp of products) {
        const sku = (wp.sku ?? "").trim();
        if (!sku) {
          failed++;
          errors.push(`Skipped product "${wp.name ?? "?"}": missing SKU`);
          continue;
        }
        const name = (wp.name ?? "").trim();
        const price = Number(wp.price);
        if (!name || !Number.isFinite(price)) {
          failed++;
          errors.push(`SKU ${sku}: invalid name or price`);
          continue;
        }
        const stock = Number.isFinite(wp.stock_quantity) ? Number(wp.stock_quantity) : 0;
        const imageUrl = wp.images?.[0]?.src?.trim() || null;

        const payload = {
          sku,
          name_ar: name,
          price_mad: price,
          stock,
          image_url: imageUrl,
        };

        const existingId = existingBySku.get(sku);
        if (existingId) {
          const { error } = await supabaseAdmin
            .from("products")
            .update(payload)
            .eq("id", existingId);
          if (error) {
            failed++;
            errors.push(`SKU ${sku}: ${error.message}`);
          } else {
            updated++;
          }
        } else {
          const { error } = await supabaseAdmin
            .from("products")
            .insert({ ...payload, description_ar: "", active: true });
          if (error) {
            failed++;
            errors.push(`SKU ${sku}: ${error.message}`);
          } else {
            created++;
          }
        }
      }

      if (products.length < PER_PAGE) break;
      page++;
      if (page > 50) break; // safety cap
    }

    return {
      ok: true,
      created,
      updated,
      failed,
      errors: errors.slice(0, 20),
    };
  });
