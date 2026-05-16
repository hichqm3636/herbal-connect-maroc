import { createServerFn } from "@tanstack/react-start";
import {
  fetchAndSyncWooProducts,
  sendOrderToWoo,
  retrySendOrderToWoo,
  type SyncProductsResult,
  type SendOrderResult,
} from "@/lib/integrations/herbialife-woocommerce.server";

/**
 * Server functions wrapping the Herbialife WooCommerce integration.
 *
 * The actual API logic lives in `src/lib/integrations/herbialife-woocommerce.server.ts`
 * — these wrappers exist only to expose it over RPC to the client.
 */

export const syncWooCommerceProducts = createServerFn({ method: "POST" })
  .inputValidator((input: { companyId: string; supplierId?: string }) => input)
  .handler(async ({ data }): Promise<SyncProductsResult> => {
    return fetchAndSyncWooProducts(data.companyId, data.supplierId);
  });

export const sendOrderToSupplier = createServerFn({ method: "POST" })
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }): Promise<SendOrderResult> => {
    return sendOrderToWoo(data.orderId);
  });

export const retrySendOrderToSupplier = createServerFn({ method: "POST" })
  .inputValidator((input: { orderId: string }) => input)
  .handler(async ({ data }): Promise<SendOrderResult> => {
    return retrySendOrderToWoo(data.orderId);
  });
