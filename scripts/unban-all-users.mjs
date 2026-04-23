// One-time cleanup: remove any Supabase Auth ban from ALL users.
// Usage: node scripts/unban-all-users.mjs
//
// Requires env vars:
//   SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let page = 1;
const perPage = 200;
let totalScanned = 0;
let totalUnbanned = 0;
let totalErrors = 0;

while (true) {
  const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
  if (error) {
    console.error(`listUsers page ${page} error:`, error.message);
    process.exit(1);
  }
  const users = data?.users ?? [];
  if (users.length === 0) break;

  for (const u of users) {
    totalScanned++;
    // banned_until is set when a user is banned; null/undefined when not.
    const bannedUntil = u.banned_until ?? null;
    if (!bannedUntil) continue;

    const { error: updErr } = await sb.auth.admin.updateUserById(u.id, {
      ban_duration: "none",
    });
    if (updErr) {
      totalErrors++;
      console.error(`  ✗ ${u.email ?? u.id}: ${updErr.message}`);
    } else {
      totalUnbanned++;
      console.log(`  ✓ unbanned ${u.email ?? u.id} (was until ${bannedUntil})`);
    }
  }

  if (users.length < perPage) break;
  page++;
}

console.log("\n— Done —");
console.log(`Scanned : ${totalScanned}`);
console.log(`Unbanned: ${totalUnbanned}`);
console.log(`Errors  : ${totalErrors}`);
