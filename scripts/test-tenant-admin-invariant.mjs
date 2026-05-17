#!/usr/bin/env node
/**
 * Phase 1 invariant test:
 * fails CI if any tenant has vendor users but no admin role.
 *
 * Requires SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Skips (exit 0) if absent,
 * matching the pattern used by the tenant-isolation suite.
 */
import { createClient } from "@supabase/supabase-js";

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.log("[tenant-admin-invariant] Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set.");
  process.exit(0);
}

const admin = createClient(url, key, { auth: { persistSession: false } });

const { data, error } = await admin.rpc("assert_tenant_admin_invariant");

if (error) {
  console.error("[tenant-admin-invariant] RPC failed:", error.message);
  process.exit(1);
}

const violations = data ?? [];
if (violations.length > 0) {
  console.error(
    `[tenant-admin-invariant] FAIL: ${violations.length} tenant(s) have vendor users without an admin role:`,
  );
  for (const v of violations) {
    console.error(`  company_id=${v.company_id} vendor_count=${v.vendor_count}`);
  }
  process.exit(1);
}

console.log("[tenant-admin-invariant] OK: every vendor tenant has at least one admin.");
process.exit(0);
