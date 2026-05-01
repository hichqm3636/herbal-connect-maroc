import { createFileRoute, redirect } from "@tanstack/react-router";
import { z } from "zod";

/**
 * Canonical client URL for the buyer's orders.
 *
 * The full, production-grade orders experience already lives at
 * `/orders` (filters, realtime, payment proof upload, reviews, deep-link
 * focus, RTL UX). To avoid forking ~700 lines of well-tested logic into
 * a parallel page that would inevitably drift, this route forwards to
 * the canonical implementation, preserving the optional `?focus=<id>`
 * deep-link used after checkout and from notifications.
 *
 * RLS guarantees client-only access:
 *   - orders:      buyer_id = auth.uid()
 *   - order_items: EXISTS (orders.buyer_id = auth.uid())
 * No service role, no cross-tenant leakage.
 */
const searchSchema = z.object({
  focus: z.string().optional(),
});

export const Route = createFileRoute("/_app/client/orders")({
  validateSearch: searchSchema,
  beforeLoad: ({ search }) => {
    throw redirect({
      to: "/orders",
      search: search.focus ? { focus: search.focus } : {},
    });
  },
});
