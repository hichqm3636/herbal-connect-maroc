import { supabase } from "@/integrations/supabase/client";

/**
 * Activity Log + Audit Trail helper.
 *
 * Every important action and field-level change is recorded in the
 * `activity_logs` table. Logging is best-effort: failures are caught
 * and reported to the console so they never break the user-facing
 * mutation that triggered them.
 */

export type EntityType =
  | "order"
  | "product"
  | "company"
  | "supplier"
  | "team"
  | "invoice"
  | "partner"
  | "distributor";

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

async function insertActivityRow(input: LogActivityInput, userId: string | null) {
  const { error } = await supabase.from("activity_logs").insert({
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
  if (error) throw error;
}

export async function logActivity(input: LogActivityInput): Promise<void> {
  let userId: string | null = null;
  try {
    const { data: userData } = await supabase.auth.getUser();
    userId = userData.user?.id ?? null;
  } catch {
    // ignore — logging continues without a user id
  }
  try {
    await insertActivityRow(input, userId);
    // Bump global version → all cached counts entries become stale deterministically.
    bumpCountsVersion();
  } catch (firstErr) {
    // One short-delay retry before failing silently, to absorb transient
    // network blips or brief auth refresh windows.
    await new Promise((r) => setTimeout(r, 400));
    try {
      await insertActivityRow(input, userId);
      bumpCountsVersion();
    } catch (retryErr) {
      console.warn("[activityLog] insert failed after retry", { firstErr, retryErr });
    }
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

/** Paginated company activity (offset-based, newest first). Optionally filtered by entity types.
 *  Pass `snapshot` (ISO timestamp) to freeze the result set across pagination/filter switches
 *  so that counts and visible rows stay consistent even as new logs arrive. */
export async function fetchCompanyActivityPage(
  companyId: string,
  offset: number,
  pageSize = 50,
  entityTypes?: EntityType[],
  snapshot?: string,
): Promise<ActivityLogRow[]> {
  let q = supabase
    .from("activity_logs")
    .select("*")
    .eq("company_id", companyId);
  if (entityTypes && entityTypes.length > 0) {
    q = q.in("entity_type", entityTypes);
  }
  if (snapshot) {
    q = q.lte("created_at", snapshot);
  }
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);
  if (error) throw error;
  return (data ?? []) as ActivityLogRow[];
}

/**
 * Server-side counts of activity rows grouped by entity_type for a company.
 *
 * Uses a single Postgres RPC (`activity_counts`) that performs `GROUP BY` in
 * the database — counts are never computed by iterating fetched arrays on the
 * client. Results are memoized in a module-level cache for 30s and tagged with
 * a global version. `bumpCountsVersion()` (called after every successful
 * `logActivity` write) invalidates ALL cached entries deterministically.
 */
type CountsData = Record<string, number> & { all: number };
type CountsCacheEntry = { data: CountsData; ts: number; version: number };

const COUNTS_CACHE = new Map<string, CountsCacheEntry>();
const COUNTS_TTL_MS = 30_000;
let COUNTS_VERSION = 0;

/** Bump the global counts version — all cached entries become stale. */
export function bumpCountsVersion() {
  COUNTS_VERSION++;
}

/** Exposed for tests — clears the in-memory counts cache. */
export function _clearActivityCountsCache(companyId?: string) {
  if (companyId) COUNTS_CACHE.delete(companyId);
  else COUNTS_CACHE.clear();
}

export async function fetchCompanyActivityCounts(
  companyId: string,
  _entityTypes?: EntityType[],
): Promise<CountsData> {
  const cached = COUNTS_CACHE.get(companyId);
  if (
    cached &&
    cached.version === COUNTS_VERSION &&
    Date.now() - cached.ts < COUNTS_TTL_MS
  ) {
    return cached.data;
  }
  // RPC isn't in the generated Database types yet — cast through `as never`.
  const rpc = supabase.rpc as unknown as (
    name: string,
    args: Record<string, unknown>,
  ) => Promise<{
    data: { entity_type: string; count: number | string }[] | null;
    error: unknown;
  }>;
  const { data, error } = await rpc("activity_counts", { p_company_id: companyId });
  if (error) throw error;
  const out: CountsData = { all: 0 };
  for (const row of data ?? []) {
    const c = Number(row.count) || 0;
    out[row.entity_type] = c;
    out.all += c;
  }
  COUNTS_CACHE.set(companyId, {
    data: out,
    ts: Date.now(),
    version: COUNTS_VERSION,
  });
  return out;
}

/** Paginated entity activity (offset-based, newest first).
 *  Pass `snapshot` (ISO timestamp) to freeze the result set across pagination. */
export async function fetchEntityActivityPage(
  entityType: EntityType,
  entityId: string,
  offset: number,
  pageSize = 50,
  snapshot?: string,
): Promise<ActivityLogRow[]> {
  let q = supabase
    .from("activity_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId);
  if (snapshot) q = q.lte("created_at", snapshot);
  const { data, error } = await q
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);
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
