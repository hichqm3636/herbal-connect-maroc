import { supabase } from "@/integrations/supabase/client";

/**
 * Activity Log + Audit Trail helper.
 *
 * Every important action and field-level change is recorded in the
 * `activity_logs` table. Logging is best-effort: failures are caught
 * and reported to the console so they never break the user-facing
 * mutation that triggered them.
 */

export type EntityType = "order" | "product" | "company" | "supplier" | "team";

export interface LogActivityInput {
  companyId: string;
  action: string;
  entityType: EntityType;
  entityId?: string | null;
  fieldName?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  metadata?: Record<string, unknown>;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  try {
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id ?? null;
    await supabase.from("activity_logs").insert({
      company_id: input.companyId,
      user_id: userId,
      action: input.action,
      entity_type: input.entityType,
      entity_id: input.entityId ?? null,
      field_name: input.fieldName ?? null,
      old_value: input.oldValue == null ? null : (input.oldValue as never),
      new_value: input.newValue == null ? null : (input.newValue as never),
      metadata: (input.metadata ?? {}) as never,
    } as never);
  } catch (err) {
    // Never let logging break the calling flow.
    console.warn("[activityLog] insert failed", err);
  }
}

/**
 * Diff two flat objects and emit one log row per changed field.
 * Useful for record updates (products, company settings, orders).
 */
export async function logFieldChanges(
  base: Omit<LogActivityInput, "fieldName" | "oldValue" | "newValue">,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  fields: string[],
): Promise<void> {
  for (const field of fields) {
    const oldV = before[field];
    const newV = after[field];
    if (JSON.stringify(oldV ?? null) === JSON.stringify(newV ?? null)) continue;
    await logActivity({
      ...base,
      fieldName: field,
      oldValue: oldV ?? null,
      newValue: newV ?? null,
    });
  }
}

export interface ActivityLogRow {
  id: string;
  company_id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  field_name: string | null;
  old_value: unknown;
  new_value: unknown;
  metadata: Record<string, unknown>;
  created_at: string;
}

/** Fetch the timeline for a single entity, newest first. */
export async function fetchEntityActivity(
  entityType: EntityType,
  entityId: string,
  limit = 50,
): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLogRow[];
}

/** Fetch the most-recent log row for an entity (for the "Last edited" label). */
export async function fetchLastEdit(
  entityType: EntityType,
  entityId: string,
): Promise<ActivityLogRow | null> {
  const { data } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as ActivityLogRow | null) ?? null;
}

/** Fetch all activity for the company (admin overview). */
export async function fetchCompanyActivity(
  companyId: string,
  limit = 100,
): Promise<ActivityLogRow[]> {
  const { data, error } = await supabase
    .from("activity_logs")
    .select("*")
    .eq("company_id", companyId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as ActivityLogRow[];
}

/** Resolve user_ids → display names in a single batch. */
export async function fetchUserNames(
  userIds: string[],
): Promise<Record<string, string>> {
  const unique = Array.from(new Set(userIds.filter(Boolean)));
  if (unique.length === 0) return {};
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name")
    .in("id", unique);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as { id: string; full_name: string }[]) {
    map[row.id] = row.full_name || "—";
  }
  return map;
}
