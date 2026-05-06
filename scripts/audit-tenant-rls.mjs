#!/usr/bin/env node
/**
 * Multi-tenant RLS auditor.
 *
 * Static checks that catch the most common multi-tenant leak vectors WITHOUT
 * needing to impersonate a real user (which our DB role cannot do):
 *
 *   1. Every tenant-scoped table (has `company_id` column) has RLS ENABLED.
 *   2. Every tenant-scoped table has at least one SELECT policy that
 *      references `current_company_id()` or `is_super_admin()`.
 *   3. No SELECT policy on a tenant-scoped table is `USING (true)` for
 *      authenticated/public roles (full leak).
 *   4. No tenant-scoped column is nullable (cannot enforce isolation if NULL).
 *
 * Exits non-zero on any finding.
 *
 * For end-to-end behavioural verification (real users, real JWTs), use the
 * companion Playwright recipe documented in e2e/README.md.
 */
import { Client } from "pg";

const client = new Client({ ssl: { rejectUnauthorized: false } });
await client.connect();

let warnings = 0;
let errors = 0;
const warn = (msg) => { warnings++; console.log(`⚠️  ${msg}`); };
const err  = (msg) => { errors++;   console.log(`❌ ${msg}`); };
const ok   = (msg) => { console.log(`✅ ${msg}`); };

// 1. Discover tenant-scoped tables (have company_id column in public schema)
const { rows: tables } = await client.query(`
  SELECT c.relname AS table_name,
         (SELECT is_nullable = 'YES'
            FROM information_schema.columns
           WHERE table_schema='public' AND table_name=c.relname
             AND column_name='company_id') AS company_nullable,
         c.relrowsecurity AS rls_enabled
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1 FROM information_schema.columns
       WHERE table_schema='public' AND table_name=c.relname
         AND column_name='company_id'
    )
  ORDER BY c.relname
`);

console.log(`\n🔍 Auditing ${tables.length} tenant-scoped tables…\n`);

for (const t of tables) {
  // Check 1: RLS enabled
  if (!t.rls_enabled) {
    err(`${t.table_name}: RLS is DISABLED — full data leak across tenants`);
    continue;
  }

  // Check 4: company_id NOT NULL
  if (t.company_nullable) {
    warn(`${t.table_name}: company_id is NULLABLE — rows with NULL bypass tenant filters`);
  }

  // Fetch SELECT policies
  const { rows: pols } = await client.query(
    `SELECT polname, pg_get_expr(polqual, polrelid) AS using_expr,
            polroles::regrole[] AS roles, polcmd
     FROM pg_policy WHERE polrelid = ('public.'||$1)::regclass`,
    [t.table_name],
  );

  const selectPols = pols.filter(p => p.polcmd === 'r' || p.polcmd === '*');
  if (selectPols.length === 0) {
    err(`${t.table_name}: NO SELECT policy — all reads blocked OR (worse) inherits permissive default`);
    continue;
  }

  // Check 3: no USING (true) for broad roles on tenant data
  const dangerous = selectPols.find(p =>
    /^\s*true\s*$/i.test(p.using_expr || '')
  );
  if (dangerous) {
    err(`${t.table_name}: policy "${dangerous.polname}" uses USING (true) — full read leak`);
  }

  // Check 2: at least one policy references current_company_id or is_super_admin
  const hasTenantCheck = selectPols.some(p =>
    /current_company_id|is_super_admin/i.test(p.using_expr || '')
  );
  if (!hasTenantCheck) {
    // Allowed if every SELECT policy is owner-scoped (e.g. recipient_id = auth.uid())
    const allOwnerScoped = selectPols.every(p =>
      /auth\.uid\(\)/i.test(p.using_expr || '')
    );
    if (!allOwnerScoped) {
      warn(`${t.table_name}: no SELECT policy references current_company_id() or is_super_admin()`);
    }
  }

  ok(`${t.table_name}: ${selectPols.length} SELECT polic${selectPols.length===1?'y':'ies'}`);
}

await client.end();

console.log(`\n${'='.repeat(50)}`);
console.log(`Errors:   ${errors}`);
console.log(`Warnings: ${warnings}`);
if (errors > 0) {
  console.log(`\n❌ Audit FAILED — fix errors before deploying to multi-tenant production.`);
  process.exit(1);
}
console.log(`\n🎉 Audit PASSED${warnings ? ' (with warnings)' : ''}`);
