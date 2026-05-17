/**
 * Unit tests for the analytics ingestion schema.
 *
 * Full integration tests (RLS denial, cross-tenant pollution, rate-limit
 * bursts) require a running Supabase instance and live in `e2e/`. These
 * tests pin the schema-level guarantees that the server function relies on:
 * unknown events, oversized metadata, and invalid types are all rejected.
 */
import { describe, expect, it } from "vitest";
import { EventSchema } from "./analyticsIngest.functions";

describe("EventSchema", () => {
  it("accepts a known event with minimal payload", () => {
    expect(() => EventSchema.parse({ event_name: "product_view" })).not.toThrow();
  });

  it("rejects an unknown event name", () => {
    expect(() =>
      EventSchema.parse({ event_name: "drop_all_tables" }),
    ).toThrow();
  });

  it("rejects non-uuid product_id", () => {
    expect(() =>
      EventSchema.parse({ event_name: "add_to_cart", product_id: "not-a-uuid" }),
    ).toThrow();
  });

  it("rejects negative or infinite price", () => {
    expect(() =>
      EventSchema.parse({ event_name: "buy_now", price: -1 }),
    ).toThrow();
    expect(() =>
      EventSchema.parse({ event_name: "buy_now", price: Number.POSITIVE_INFINITY }),
    ).toThrow();
  });

  it("rejects oversized metadata", () => {
    const big = "x".repeat(3000);
    expect(() =>
      EventSchema.parse({ event_name: "product_view", metadata: { big } }),
    ).toThrow(/metadata too large/);
  });

  it("rejects metadata keys longer than 64 chars", () => {
    const longKey = "k".repeat(65);
    expect(() =>
      EventSchema.parse({
        event_name: "product_view",
        metadata: { [longKey]: 1 },
      }),
    ).toThrow();
  });

  it("ignores client-supplied vendor_id / user_id (not in schema)", () => {
    // Schema does not include vendor_id/user_id — Zod strips unknowns by default
    // for objects, so this just confirms the shape doesn't accept them as
    // first-class fields.
    const parsed = EventSchema.parse({
      event_name: "product_view",
      vendor_id: "00000000-0000-0000-0000-000000000000",
      user_id: "00000000-0000-0000-0000-000000000000",
    } as unknown);
    expect("vendor_id" in parsed).toBe(false);
    expect("user_id" in parsed).toBe(false);
  });
});
