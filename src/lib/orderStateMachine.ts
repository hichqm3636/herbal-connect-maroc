/**
 * Order State Machine
 * ====================
 *
 * Single source of truth for every order status transition. ALL status
 * updates MUST go through `transitionOrderStatus`. Direct `update({ status })`
 * calls on the `orders` table are forbidden.
 *
 * Responsibilities:
 *  1. Validate transitions against `TRANSITIONS`
 *  2. Apply role-based guards (`canTransition`)
 *  3. Persist the change atomically (single optimistic UPDATE keyed on the
 *     previous status to prevent races)
 *  4. Log to `activity_logs` via `logActivity`
 *  5. Trigger side-effects (notifications, analytics — currently placeholders)
 *
 * The system is intentionally extensible: auto-transitions, SLA tracking,
 * and analytics can be plugged into `handleSideEffects` without touching the
 * core machine.
 */

import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/lib/activityLog";
import { buildOrderWhatsappMessage } from "@/utils/whatsapp";

// ---------- Types ----------

export type OrderStatus =
  | "pending"
  | "confirmed"
  | "processing"
  | "shipped"
  | "delivered"
  | "cancelled";

export type Role = "admin" | "distributor";

/** Transitions allowed by the business state machine. Terminal states are []. */
export const TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  pending: ["confirmed", "cancelled"],
  confirmed: ["processing", "cancelled"],
  processing: ["shipped"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

/**
 * Legacy DB value `preparing` is treated as an alias of `processing` for
 * existing rows created before the state machine was introduced.
 */
function normalizeStatus(raw: string): OrderStatus {
  if (raw === "preparing") return "processing";
  return raw as OrderStatus;
}

// ---------- Guards ----------

export function canTransition(role: Role, from: OrderStatus, to: OrderStatus): boolean {
  if (!TRANSITIONS[from]?.includes(to)) return false;

  if (role === "distributor") {
    return from === "pending" && to === "cancelled";
  }
  if (role === "admin") return true;
  return false;
}

/** UI helper: list every status reachable from `from` for the given role. */
export function allowedNextStates(role: Role, from: OrderStatus): OrderStatus[] {
  return TRANSITIONS[from].filter((to) => canTransition(role, from, to));
}

// ---------- Errors ----------

export class OrderStateError extends Error {
  code: "NOT_FOUND" | "INVALID_TRANSITION" | "UNAUTHORIZED" | "CONFLICT" | "DB_ERROR";
  constructor(
    code: OrderStateError["code"],
    message: string,
  ) {
    super(message);
    this.code = code;
    this.name = "OrderStateError";
  }
}

// ---------- Side-effects ----------

interface SideEffectContext {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
  companyId: string;
}

/**
 * Side-effects layer. Structured so notifications / analytics / WhatsApp can
 * be plugged in incrementally without touching the state machine core.
 *
 * Failures here are swallowed and logged — they MUST NOT break the
 * transition itself.
 */
async function handleSideEffects(ctx: SideEffectContext): Promise<void> {
  try {
    if (ctx.to === "confirmed") {
      // TODO: enqueue customer notification (email / push).
      console.debug("[orderStateMachine] side-effect: confirmed", ctx.orderId);
    }

    if (ctx.to === "shipped") {
      // Pre-build a WhatsApp link the UI can pick up. Actual sending is
      // user-initiated via the existing button.
      const { data } = await supabase
        .from("orders")
        .select(
          "order_number, total_mad, profiles(full_name)",
        )
        .eq("id", ctx.orderId)
        .maybeSingle();
      if (data) {
        const row = data as unknown as {
          order_number: string;
          total_mad: number;
          profiles: { full_name: string } | null;
        };
        const message = buildOrderWhatsappMessage({
          distributorName: row.profiles?.full_name ?? "—",
          orderNumber: row.order_number,
          orderTotalMad: Number(row.total_mad ?? 0),
          orderId: ctx.orderId,
        });
        console.debug("[orderStateMachine] side-effect: shipped → wa message ready", {
          orderId: ctx.orderId,
          length: message.length,
        });
      }
    }

    if (ctx.to === "delivered") {
      // TODO: analytics hook — record fulfilment cycle time, NPS trigger, etc.
      console.debug("[orderStateMachine] side-effect: delivered", ctx.orderId);
    }
  } catch (err) {
    console.warn("[orderStateMachine] side-effect failed", err);
  }
}

// ---------- Core ----------

export interface TransitionInput {
  orderId: string;
  to: OrderStatus;
  userId: string;
  role: Role;
  companyId: string;
}

export interface TransitionResult {
  orderId: string;
  from: OrderStatus;
  to: OrderStatus;
}

/**
 * Single entry-point for any order status change.
 *
 * @throws {OrderStateError} on missing order, invalid transition, unauthorized
 *         action, race conflict, or database error.
 */
export async function transitionOrderStatus(
  input: TransitionInput,
): Promise<TransitionResult> {
  const { orderId, to, role, companyId } = input;

  // 1. Load current status.
  const { data: current, error: fetchErr } = await supabase
    .from("orders")
    .select("id, status, company_id")
    .eq("id", orderId)
    .maybeSingle();

  if (fetchErr) {
    throw new OrderStateError("DB_ERROR", fetchErr.message);
  }
  if (!current) {
    throw new OrderStateError("NOT_FOUND", "Order not found");
  }

  const from = normalizeStatus(current.status);

  // 2. Validate transition + role.
  if (!TRANSITIONS[from]) {
    throw new OrderStateError("INVALID_TRANSITION", `Unknown status: ${from}`);
  }
  if (!TRANSITIONS[from].includes(to)) {
    throw new OrderStateError(
      "INVALID_TRANSITION",
      `Invalid transition: ${from} → ${to}`,
    );
  }
  if (!canTransition(role, from, to)) {
    throw new OrderStateError("UNAUTHORIZED", "Unauthorized action");
  }

  // 3. Optimistic update — guards against concurrent transitions.
  // We accept either the canonical `from` or its legacy alias `preparing`
  // when transitioning out of processing, so historical rows still update.
  type DbStatus = "pending" | "confirmed" | "processing" | "preparing" | "shipped" | "delivered" | "cancelled";
  const expectedStatuses: DbStatus[] =
    from === "processing" ? ["processing", "preparing"] : [from satisfies OrderStatus];

  const { data: updated, error: updateErr } = await supabase
    .from("orders")
    .update({ status: to })
    .eq("id", orderId)
    .in("status", expectedStatuses)
    .select("id")
    .maybeSingle();

  if (updateErr) {
    throw new OrderStateError("DB_ERROR", updateErr.message);
  }
  if (!updated) {
    throw new OrderStateError(
      "CONFLICT",
      "Order status changed concurrently. Please reload.",
    );
  }

  // 4. Audit log (best-effort — logActivity already swallows failures).
  await logActivity({
    companyId,
    action: "order_status_changed",
    entityType: "order",
    entityId: orderId,
    fieldName: "status",
    oldValue: from,
    newValue: to,
  });

  // 5. Side-effects (best-effort).
  await handleSideEffects({ orderId, from, to, companyId });

  return { orderId, from, to };
}
