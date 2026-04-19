// Order Rules engine — pure evaluation logic.
// Combines global platform rules + company-scoped rules using a "minimum floor" model:
//   threshold = max(global_min, tier_specific_min, company_min)
// Tier-specific rules apply only to distributors assigned to that tier.

export type OrderRuleType = "MIN_ORDER_AMOUNT" | "MIN_POINTS" | "MIN_PRODUCTS";

export interface OrderRule {
  id: string;
  company_id: string | null; // null = global platform rule
  name: string;
  rule_type: OrderRuleType;
  min_order_amount: number | null;
  min_points: number | null;
  min_products: number | null;
  tier_id: string | null;
  active: boolean;
}

export interface CartSnapshot {
  /** Final order total in MAD (after distributor discount). */
  total: number;
  /** Total loyalty points the order will earn. */
  points: number;
  /** Total units in cart (sum of quantities). */
  unitsCount: number;
}

export interface RuleEvaluation {
  type: OrderRuleType;
  threshold: number;
  current: number;
  ok: boolean;
  remaining: number;
  /** Arabic message describing the failure / progress. */
  message: string;
  /** Source rule (the one that set the binding threshold). */
  ruleName: string;
}

export interface RulesResult {
  ok: boolean;
  evaluations: RuleEvaluation[];
  /** Failing evaluations only (for blocking checkout). */
  failures: RuleEvaluation[];
}

function ruleValue(rule: OrderRule): number {
  switch (rule.rule_type) {
    case "MIN_ORDER_AMOUNT":
      return Number(rule.min_order_amount ?? 0);
    case "MIN_POINTS":
      return Number(rule.min_points ?? 0);
    case "MIN_PRODUCTS":
      return Number(rule.min_products ?? 0);
  }
}

function currentFor(type: OrderRuleType, snap: CartSnapshot): number {
  switch (type) {
    case "MIN_ORDER_AMOUNT":
      return snap.total;
    case "MIN_POINTS":
      return snap.points;
    case "MIN_PRODUCTS":
      return snap.unitsCount;
  }
}

function buildMessage(type: OrderRuleType, threshold: number, current: number): string {
  const remaining = Math.max(0, threshold - current);
  const ok = current >= threshold;
  switch (type) {
    case "MIN_ORDER_AMOUNT":
      return ok
        ? `تم تحقيق الحد الأدنى للطلب (${threshold} درهم)`
        : remaining > 0
          ? `المتبقي للوصول إلى الحد الأدنى للطلب: ${Math.ceil(remaining)} درهم`
          : `الحد الأدنى للطلب هو ${threshold} درهم`;
    case "MIN_POINTS":
      return ok
        ? `تم تحقيق الحد الأدنى من النقاط (${threshold})`
        : remaining > 0
          ? `أضف ${Math.ceil(remaining)} نقطة للوصول إلى الحد الأدنى`
          : `يجب طلب ${threshold} نقطة على الأقل`;
    case "MIN_PRODUCTS":
      return ok
        ? `تم تحقيق الحد الأدنى من الوحدات (${threshold})`
        : remaining > 0
          ? `أضف ${Math.ceil(remaining)} وحدة للوصول إلى الحد الأدنى`
          : `يجب طلب ${threshold} وحدة على الأقل`;
  }
}

/**
 * Evaluate all active rules against the cart.
 * - Filters out inactive rules.
 * - Tier-specific rules only apply when the distributor's tier matches.
 * - For each rule type, the binding threshold is the MAXIMUM across all
 *   applicable rules (global + tier-specific + company). This is the
 *   "minimum floor" model: stricter rules stack on top.
 */
export function evaluateRules(
  rules: OrderRule[],
  snap: CartSnapshot,
  distributorTierId: string | null,
): RulesResult {
  const applicable = rules.filter((r) => {
    if (!r.active) return false;
    // Tier-targeted rule: only applies to matching tier
    if (r.tier_id && r.tier_id !== distributorTierId) return false;
    return true;
  });

  const byType = new Map<OrderRuleType, { threshold: number; ruleName: string }>();
  for (const r of applicable) {
    const v = ruleValue(r);
    if (v <= 0) continue;
    const existing = byType.get(r.rule_type);
    if (!existing || v > existing.threshold) {
      byType.set(r.rule_type, { threshold: v, ruleName: r.name });
    }
  }

  const evaluations: RuleEvaluation[] = [];
  for (const [type, { threshold, ruleName }] of byType) {
    const current = currentFor(type, snap);
    const ok = current >= threshold;
    evaluations.push({
      type,
      threshold,
      current,
      ok,
      remaining: Math.max(0, threshold - current),
      message: buildMessage(type, threshold, current),
      ruleName,
    });
  }

  const failures = evaluations.filter((e) => !e.ok);
  return { ok: failures.length === 0, evaluations, failures };
}

export const RULE_TYPE_LABELS: Record<OrderRuleType, string> = {
  MIN_ORDER_AMOUNT: "الحد الأدنى للطلب (درهم)",
  MIN_POINTS: "الحد الأدنى للنقاط",
  MIN_PRODUCTS: "الحد الأدنى للوحدات",
};
