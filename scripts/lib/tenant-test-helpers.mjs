/**
 * Reusable test helpers for the tenant-isolation integration suite.
 *
 * Two client kinds:
 *   - `admin`    — service-role, BYPASSES RLS, used only for seeding and cleanup.
 *   - `asUser()` — anon-key client signed in as a specific seeded user; every
 *                  request goes through RLS exactly as it would from a browser.
 *
 * Naming: every artifact this module creates is prefixed with `tt_` (tenant
 * test) and tagged with a run id so concurrent runs and leftover rows from
 * crashed runs can be reaped without touching real data.
 */
import { createClient } from "@supabase/supabase-js";
import { randomUUID } from "node:crypto";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

export function requireEnv() {
  const missing = [];
  if (!SUPABASE_URL) missing.push("SUPABASE_URL");
  if (!SERVICE_KEY) missing.push("SUPABASE_SERVICE_ROLE_KEY");
  if (!ANON_KEY) missing.push("SUPABASE_ANON_KEY or SUPABASE_PUBLISHABLE_KEY");
  if (missing.length) {
    console.log(
      `⏭️  Skipping tenant-isolation suite — missing env: ${missing.join(", ")}`,
    );
    process.exit(0);
  }
}

export const RUN_ID = randomUUID().slice(0, 8);
export const TAG = `tt_${RUN_ID}`;

export const admin = createClient(SUPABASE_URL ?? "", SERVICE_KEY ?? "", {
  auth: { persistSession: false, autoRefreshToken: false },
});

/** Anon client, no session. Use for unauthenticated probes. */
export function anonClient() {
  return createClient(SUPABASE_URL ?? "", ANON_KEY ?? "", {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Sign in as a previously created user and return a fresh anon client whose
 * Authorization header carries that user's JWT. RLS applies.
 */
export async function impersonateUser({ email, password }) {
  const client = anonClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error) throw new Error(`signIn(${email}) failed: ${error.message}`);
  return { client, userId: data.user.id, accessToken: data.session.access_token };
}

/** Create a listed company. Returns { id, slug }. */
export async function createTenant(label) {
  const slug = `${TAG}-${label}-${randomUUID().slice(0, 6)}`.toLowerCase();
  const { data, error } = await admin
    .from("companies")
    .insert({
      name: `${TAG} ${label}`,
      display_name: `${TAG} ${label}`,
      slug,
      is_listed: true,
      company_type: "vendor",
    })
    .select("id, slug")
    .single();
  if (error) throw new Error(`createTenant: ${error.message}`);
  return data;
}

/** Create an auth user + profile (no role). Returns { id, email, password }. */
export async function createUser({ companyId, label = "user" } = {}) {
  const email = `${TAG}-${label}-${randomUUID().slice(0, 6)}@tenant-test.local`;
  const password = `Pw_${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { tenant_test: TAG },
  });
  if (error) throw new Error(`createUser: ${error.message}`);
  const userId = data.user.id;

  // profile is normally created by a trigger; upsert to make sure company_id is set
  await admin
    .from("profiles")
    .upsert({ id: userId, full_name: `${TAG} ${label}`, company_id: companyId ?? null });

  return { id: userId, email, password };
}

/** Create an auth user, attach `admin` role scoped to `companyId`. */
export async function createAdmin({ companyId, label = "admin" }) {
  const user = await createUser({ companyId, label });
  const { error } = await admin
    .from("user_roles")
    .insert({ user_id: user.id, company_id: companyId, role: "admin" });
  if (error) throw new Error(`createAdmin role: ${error.message}`);
  return user;
}

/** Create a marketplace order for `buyerId` at `companyId`. */
export async function createOrder({ companyId, buyerId, total = 100 }) {
  const orderNumber = `${TAG}-${randomUUID().slice(0, 6)}`;
  const { data, error } = await admin
    .from("orders")
    .insert({
      order_number: orderNumber,
      company_id: companyId,
      buyer_id: buyerId,
      total_mad: total,
    })
    .select("id, order_number, company_id, buyer_id")
    .single();
  if (error) throw new Error(`createOrder: ${error.message}`);
  return data;
}

/** Create a product for a given tenant (needed for order_items). */
export async function createProduct({ companyId, label = "p" }) {
  const { data, error } = await admin
    .from("products")
    .insert({
      company_id: companyId,
      name_ar: `${TAG} ${label}`,
      external_id: `${TAG}-${randomUUID().slice(0, 6)}`,
      price_mad: 50,
      active: true,
    })
    .select("id, company_id")
    .single();
  if (error) throw new Error(`createProduct: ${error.message}`);
  return data;
}

/** Create an invoice for an order — needed for invoice_items / payments tests. */
export async function createInvoice({ companyId, orderId, buyerId }) {
  const invoiceNumber = `${TAG}-INV-${randomUUID().slice(0, 6)}`;
  const { data, error } = await admin
    .from("invoices")
    .insert({
      company_id: companyId,
      order_id: orderId,
      buyer_id: buyerId,
      invoice_number: invoiceNumber,
      total_mad: 100,
    })
    .select("id, company_id, buyer_id")
    .single();
  if (error) throw new Error(`createInvoice: ${error.message}`);
  return data;
}

/** Reap everything this run created. Safe to call even on partial failure. */
export async function cleanup() {
  // Delete users (cascades aren't guaranteed; explicit table sweeps follow).
  const { data: usersList } = await admin.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });
  for (const u of usersList?.users ?? []) {
    const isOurs =
      u.email?.includes(TAG) || u.user_metadata?.tenant_test === TAG;
    if (!isOurs) continue;
    await admin.auth.admin.deleteUser(u.id).catch(() => {});
  }
  // Companies seeded with our slug prefix
  await admin.from("companies").delete().like("slug", `${TAG}%`);
}

/**
 * Assertion helpers — concise pass/fail logger used by every spec so a single
 * file holds the entire suite's truth table.
 */
let passed = 0;
let failed = 0;
const failures = [];

export function pass(name) {
  passed++;
  console.log(`  ✅ ${name}`);
}
export function fail(name, detail) {
  failed++;
  failures.push({ name, detail });
  console.log(`  ❌ ${name} — ${detail}`);
}

export function expectDenied(name, { error, data }) {
  // RLS denial surfaces as either an error OR an empty result set, depending
  // on whether the verb is SELECT (empty) or INSERT/UPDATE/DELETE (error).
  if (error) {
    pass(`${name} (denied: ${error.code ?? error.message})`);
    return;
  }
  if (Array.isArray(data) && data.length === 0) {
    pass(`${name} (denied: empty result)`);
    return;
  }
  fail(name, `expected denial, got ${JSON.stringify(data)?.slice(0, 120)}`);
}

export function expectAllowed(name, { error, data }) {
  if (error) {
    fail(name, `expected allow, got error ${error.message}`);
    return;
  }
  pass(`${name} (allowed${Array.isArray(data) ? `, rows=${data.length}` : ""})`);
}

export function summary() {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  if (failed > 0) {
    console.log(`\n❌ Tenant isolation suite FAILED.`);
    for (const f of failures) console.log(`  • ${f.name}: ${f.detail}`);
    process.exit(1);
  }
  console.log(`\n🎉 Tenant isolation suite PASSED.`);
}
