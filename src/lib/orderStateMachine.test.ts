import { describe, expect, it } from "vitest";
import {
  TRANSITIONS,
  canTransition,
  allowedNextStates,
  type OrderStatus,
} from "./orderStateMachine";

describe("Order state machine — TRANSITIONS map", () => {
  it("defines exactly the 6 spec states", () => {
    expect(Object.keys(TRANSITIONS).sort()).toEqual(
      ["cancelled", "confirmed", "delivered", "pending", "processing", "shipped"],
    );
  });

  it("matches the spec graph", () => {
    expect(TRANSITIONS.pending).toEqual(["confirmed", "cancelled"]);
    expect(TRANSITIONS.confirmed).toEqual(["processing", "cancelled"]);
    expect(TRANSITIONS.processing).toEqual(["shipped"]);
    expect(TRANSITIONS.shipped).toEqual(["delivered"]);
    expect(TRANSITIONS.delivered).toEqual([]);
    expect(TRANSITIONS.cancelled).toEqual([]);
  });
});

describe("canTransition — admin", () => {
  it("allows every transition listed in TRANSITIONS", () => {
    (Object.keys(TRANSITIONS) as OrderStatus[]).forEach((from) => {
      TRANSITIONS[from].forEach((to) => {
        expect(canTransition("admin", from, to)).toBe(true);
      });
    });
  });

  it("rejects transitions not listed in TRANSITIONS", () => {
    expect(canTransition("admin", "delivered", "shipped")).toBe(false);
    expect(canTransition("admin", "cancelled", "pending")).toBe(false);
    expect(canTransition("admin", "pending", "shipped")).toBe(false);
    expect(canTransition("admin", "processing", "delivered")).toBe(false);
  });
});

describe("canTransition — distributor", () => {
  it("allows only pending → cancelled", () => {
    expect(canTransition("distributor", "pending", "cancelled")).toBe(true);
  });

  it("rejects everything else, even otherwise-legal admin transitions", () => {
    expect(canTransition("distributor", "pending", "confirmed")).toBe(false);
    expect(canTransition("distributor", "confirmed", "cancelled")).toBe(false);
    expect(canTransition("distributor", "confirmed", "processing")).toBe(false);
    expect(canTransition("distributor", "processing", "shipped")).toBe(false);
    expect(canTransition("distributor", "shipped", "delivered")).toBe(false);
  });
});

describe("allowedNextStates", () => {
  it("returns admin-allowed transitions filtered by role", () => {
    expect(allowedNextStates("admin", "pending")).toEqual(["confirmed", "cancelled"]);
    expect(allowedNextStates("admin", "confirmed")).toEqual(["processing", "cancelled"]);
    expect(allowedNextStates("admin", "delivered")).toEqual([]);
  });

  it("returns at most [cancelled] for distributors and only on pending", () => {
    expect(allowedNextStates("distributor", "pending")).toEqual(["cancelled"]);
    expect(allowedNextStates("distributor", "confirmed")).toEqual([]);
    expect(allowedNextStates("distributor", "processing")).toEqual([]);
    expect(allowedNextStates("distributor", "shipped")).toEqual([]);
    expect(allowedNextStates("distributor", "delivered")).toEqual([]);
    expect(allowedNextStates("distributor", "cancelled")).toEqual([]);
  });
});
