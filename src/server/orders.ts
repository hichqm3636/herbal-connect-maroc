/**
 * Server-side `createOrder` for distributors.
 *
 * Hybrid model:
 *  - Cart, quick-order, and repeat-order still build the cart on the
 *    client and read products via Supabase + RLS.
 *  - The actual order INSERT goes through THIS server function so we
 *    have a single, audited, middleware-protected entry point that
 *    enforces `requireEnabledDistributorRole` BEFORE touching the DB.
 *
 * A disabled distributor cannot reach the handler at all — the
 * middleware returns a 403 JSON `{ reason, message }` payload that the
 * client maps via `parseApiError` + `AUTHZ_MESSAGES_AR`.
 *
 * Even if an attacker bypassed the middleware (e.g. by calling the
 * Supabase REST API directly) the new RLS policy
 * `has_enabled_distributor_role` blocks the INSERT at the database
 * layer. Defence in depth.
 */
import { createDistributorServerFn } from "@/server/createDistributorServerFn";

interface OrderItemInput {
  product_id: string;
  quantity: number;
  unit_price_mad: number;
}

interface CreateOrderInput {
  company_id: string;
  total_mad: number;
  points_earned: number;
  notes: string | null;
  items: OrderItemInput[];
}

interface CreateOrderResult {
  order_id: string;
}

function validate(input: unknown): CreateOrderInput {
  if (!input || typeof input !== "object") {
    throw new Error("Invalid order payload");
  }
  const o = input as Record<string, unknown>;
  if (typeof o.company_id !== "string" || o.company_id.length < 8) {
    throw new Error("company_id required");
  }
  if (typeof o.total_mad !== "number" || !Number.isFinite(o.total_mad) || o.total_mad < 0) {
    throw new Error("total_mad invalid");
  }
  if (typeof o.points_earned !== "number" || !Number.isFinite(o.points_earned)) {
    throw new Error("points_earned invalid");
  }
  if (!Array.isArray(o.items) || o.items.length === 0) {
    throw new Error("items required");
  }
  const items: OrderItemInput[] = o.items.map((raw, idx) => {
    if (!raw || typeof raw !== "object") throw new Error(`item[${idx}] invalid`);
    const it = raw as Record<string, unknown>;
    if (typeof it.product_id !== "string") throw new Error(`item[${idx}].product_id`);
    if (typeof it.quantity !== "number" || it.quantity <= 0) {
      throw new Error(`item[${idx}].quantity`);
    }
    if (typeof it.unit_price_mad !== "number" || it.unit_price_mad < 0) {
      throw new Error(`item[${idx}].unit_price_mad`);
    }
    return {
      product_id: it.product_id,
      quantity: it.quantity,
      unit_price_mad: it.unit_price_mad,
    };
  });
  if (items.length > 200) throw new Error("Too many items");
  const notes = typeof o.notes === "string" ? o.notes.slice(0, 1000) : null;
  return {
    company_id: o.company_id,
    total_mad: o.total_mad,
    points_earned: o.points_earned,
    notes,
    items,
  };
}

export const createOrder = createDistributorServerFn({ method: "POST" })
  .inputValidator((input: unknown) => validate(input))
  .handler(async ({ data, context }): Promise<CreateOrderResult> => {
    const { supabase, userId } = context;

    // ---------------- Server-side stock validation ----------------
    // Fetch authoritative stock + cost for every product in the order.
    // Rules:
    //   stock = null → unlimited (allow)
    //   stock >= qty → allow
    //   stock <  qty → reject with structured 400-style error
    const productIds = data.items.map((i) => i.product_id);
    const { data: stockRows, error: stockErr } = await supabase
      .from("products")
      .select("id, stock, cost_price")
      .in("id", productIds);

    if (stockErr) {
      console.error("[createOrder] stock fetch failed", { userId, err: stockErr });
      throw new Error("تعذّر التحقق من المخزون");
    }

    const stockMap = new Map<string, number | null>(
      (stockRows ?? []).map((r) => [r.id, (r as { stock: number | null }).stock]),
    );
    const costMap = new Map<string, number | null>(
      (stockRows ?? []).map((r) => [r.id, (r as { cost_price: number | null }).cost_price]),
    );

    for (const it of data.items) {
      const stock = stockMap.get(it.product_id);
      // Missing product (RLS hid it or it was deleted) — reject.
      if (stock === undefined) {
        throw new Error(
          JSON.stringify({
            error: "out_of_stock",
            product_id: it.product_id,
            message: "المنتج غير متوفر",
          }),
        );
      }
      if (stock !== null && stock < it.quantity) {
        throw new Error(
          JSON.stringify({
            error: "out_of_stock",
            product_id: it.product_id,
            message: "الكمية المطلوبة غير متوفرة في المخزون",
          }),
        );
      }
    }

    // ---------------- Decrement stock FIRST (race-condition safe) ----------------
    // Use the atomic `adjust_product_stock` RPC which performs a relative
    // update (`stock = stock - qty`) guarded by `stock >= qty` at the DB
    // level. This avoids overwriting concurrent updates from other orders.
    // The stockMap above is used ONLY for pre-validation; the actual
    // decrement relies on the live DB row.
    const decremented: { product_id: string; quantity: number }[] = [];
    for (const it of data.items) {
      // Skip unlimited-stock items (stock = null) — RPC handles this internally.
      const { data: ok, error: decErr } = await supabase.rpc("adjust_product_stock", {
        _product_id: it.product_id,
        _delta: -it.quantity,
      });

      if (decErr || ok !== true) {
        // Roll back any prior decrements via relative increment.
        for (const prev of decremented) {
          await supabase.rpc("adjust_product_stock", {
            _product_id: prev.product_id,
            _delta: prev.quantity,
          });
        }
        console.error("[createOrder] stock decrement guard failed", {
          product_id: it.product_id,
          requested: it.quantity,
          err: decErr,
        });
        throw new Error(
          JSON.stringify({
            error: "out_of_stock",
            product_id: it.product_id,
            message: "الكمية لم تعد متوفرة",
          }),
        );
      }
      decremented.push({ product_id: it.product_id, quantity: it.quantity });
    }

    // Helper to restore stock on downstream failure — relative increment,
    // never an absolute overwrite, so concurrent orders are not clobbered.
    const restoreStock = async () => {
      for (const prev of decremented) {
        await supabase.rpc("adjust_product_stock", {
          _product_id: prev.product_id,
          _delta: prev.quantity,
        });
      }
    };

    // ---------------- Create the order AFTER stock is reserved ----------------
    const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

    const { data: order, error: orderErr } = await supabase
      .from("orders")
      .insert({
        distributor_id: userId,
        company_id: data.company_id,
        total_mad: data.total_mad,
        points_earned: data.points_earned,
        status: "pending",
        notes: data.notes,
        order_number: orderNumber,
      })
      .select("id")
      .single();

    if (orderErr || !order) {
      console.error("[createOrder] insert order failed — restoring stock", {
        userId,
        err: orderErr,
      });
      await restoreStock();
      throw new Error(orderErr?.message ?? "تعذّر إنشاء الطلب");
    }

    const itemsPayload = data.items.map((i) => ({
      order_id: order.id,
      product_id: i.product_id,
      quantity: i.quantity,
      unit_price_mad: i.unit_price_mad,
      cost_snapshot: costMap.get(i.product_id) ?? null,
    }));

    const { error: itemsErr } = await supabase.from("order_items").insert(itemsPayload);
    if (itemsErr) {
      console.error("[createOrder] insert items failed — rolling back order + stock", {
        userId,
        order_id: order.id,
        err: itemsErr,
      });
      await supabase.from("orders").delete().eq("id", order.id);
      await restoreStock();
      throw new Error(itemsErr.message ?? "تعذّر حفظ عناصر الطلب");
    }

    return { order_id: order.id };
  });
