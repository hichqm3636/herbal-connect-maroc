/**
 * Wrapper around `createServerFn` that automatically attaches the
 * `requireEnabledDistributorRole` middleware.
 *
 * Use this for ANY server function that should be reachable only by an
 * enabled distributor (or by an admin / super_admin acting on their behalf).
 * This guarantees the authorization check cannot be forgotten — there is no
 * way to call this helper without the middleware running.
 *
 * Example:
 *
 *   import { createDistributorServerFn } from "@/server/createDistributorServerFn";
 *
 *   export const submitOrder = createDistributorServerFn({ method: "POST" })
 *     .inputValidator((input: { items: CartItem[] }) => input)
 *     .handler(async ({ data, context }) => {
 *       // context.supabase is the user's authed client (RLS applies)
 *       // context.userId is the auth uid
 *       // context.distributorAccess tells you if they are super/admin/distributor
 *       ...
 *     });
 *
 * If you find yourself writing `createServerFn(...).middleware([...])` for a
 * distributor endpoint, USE THIS HELPER INSTEAD.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireEnabledDistributorRole } from "@/server/middleware/requireEnabledDistributorRole";

type CreateServerFnOptions = Parameters<typeof createServerFn>[0];

export function createDistributorServerFn(options: CreateServerFnOptions) {
  return createServerFn(options).middleware([requireEnabledDistributorRole]);
}
