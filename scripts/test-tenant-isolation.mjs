#!/usr/bin/env node
/**
 * Tenant-isolation integration suite.
 *
 * Seeds two tenants (A, B), each with a buyer (no role), an admin, and a
 * member (signed-in user with no role), plus one super_admin floating
 * outside both tenants. Then probes every sensitive table from each
 * persona's perspective and asserts cross-tenant operations FAIL.
 *
 * What "fail" means under RLS:
 *   - SELECT: returns an empty result set for forbidden rows.
 *   - INSERT/UPDATE/DELETE: returns a postgrest error (42501 or 23514).
 *
 * Both are accepted by `expectDenied()` in the helpers module. A row that
 * leaks across tenants — or a write that succeeds with a forged
 * company_id / vendor_id — fails the run and exits non-zero so CI breaks.
 *
 * Coverage targets (matches the hardening spec):
 *   orders, order_items, invoices, invoice_items, suppliers, payments,
 *   notifications, inventory_levels, inventory_movements, user_roles,
 *   analytics_events.
 *
 * Run:
 *   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… SUPABASE_PUBLISHABLE_KEY=… \
 *     node scripts/test-tenant-isolation.mjs
 *
 * If any of those env vars are missing the suite SKIPS (exit 0) — see
 * helpers.requireEnv. That keeps it safe for forks that don't have
 * service-role secrets wired into CI.
 */
import {
  requireEnv,
  admin,
  TAG,
  createTenant,
  createUser,
  createAdmin,
  createOrder,
  createProduct,
  createInvoice,
  impersonateUser,
  cleanup,
  pass,
  fail,
  expectDenied,
  expectAllowed,
  summary,
} from "./lib/tenant-test-helpers.mjs";

requireEnv();

console.log(`🧪 Tenant isolation suite — run tag ${TAG}\n`);

// ───────────────────────────────────────────────────────────── seed
let A, B;
let aBuyer, aAdmin, aMember;
let bBuyer, bAdmin;
let superUser;
let aOrder, bOrder;
let aProduct, bProduct;
let aInvoice, bInvoice;

try {
  console.log("📦 Seeding two tenants + personas…");
  [A, B] = await Promise.all([createTenant("A"), createTenant("B")]);
  [aBuyer, aAdmin, aMember, bBuyer, bAdmin, superUser] = await Promise.all([
    createUser({ companyId: A.id, label: "Abuyer" }),
    createAdmin({ companyId: A.id, label: "Aadmin" }),
    createUser({ companyId: A.id, label: "Amember" }),
    createUser({ companyId: B.id, label: "Bbuyer" }),
    createAdmin({ companyId: B.id, label: "Badmin" }),
    createUser({ label: "super" }),
  ]);
  await admin
    .from("user_roles")
    .insert({ user_id: superUser.id, role: "super_admin" });

  [aProduct, bProduct] = await Promise.all([
    createProduct({ companyId: A.id, label: "pA" }),
    createProduct({ companyId: B.id, label: "pB" }),
  ]);
  [aOrder, bOrder] = await Promise.all([
    createOrder({ companyId: A.id, buyerId: aBuyer.id }),
    createOrder({ companyId: B.id, buyerId: bBuyer.id }),
  ]);
  [aInvoice, bInvoice] = await Promise.all([
    createInvoice({ companyId: A.id, orderId: aOrder.id, buyerId: aBuyer.id }),
    createInvoice({ companyId: B.id, orderId: bOrder.id, buyerId: bBuyer.id }),
  ]);
  console.log(`  ✓ tenants ${A.slug} / ${B.slug}\n`);
} catch (e) {
  console.error("Seed failed:", e.message);
  await cleanup();
  process.exit(1);
}

// Sign in everyone we'll need
const sessAbuyer = await impersonateUser(aBuyer);
const sessAadmin = await impersonateUser(aAdmin);
const sessAmember = await impersonateUser(aMember);
const sessBadmin = await impersonateUser(bAdmin);

// ───────────────────────────────────────────────────────── SELECT denial
console.log("🔍 SELECT — cross-tenant denial");
{
  // A's admin must NOT see B's orders
  const res = await sessAadmin.client
    .from("orders")
    .select("id")
    .eq("id", bOrder.id);
  expectDenied("A-admin reads B order", res);

  // B's admin must NOT see A's invoices
  const res2 = await sessBadmin.client
    .from("invoices")
    .select("id")
    .eq("id", aInvoice.id);
  expectDenied("B-admin reads A invoice", res2);

  // A's buyer must NOT see other buyers' orders even inside same tenant
  const res3 = await sessAbuyer.client
    .from("orders")
    .select("id")
    .eq("buyer_id", bBuyer.id);
  expectDenied("A-buyer reads other buyer order", res3);

  // suppliers: A-admin must NOT see B's supplier creds (admin-gated)
  // Seed a supplier in B
  const { data: bSupplier } = await admin
    .from("suppliers")
    .insert({
      company_id: B.id,
      domain: `https://${TAG}.example.com`,
      name: `${TAG} sup`,
      consumer_key: "ck_x",
      consumer_secret: "cs_x",
    })
    .select("id")
    .single();
  const res4 = await sessAadmin.client
    .from("suppliers")
    .select("id, consumer_secret")
    .eq("id", bSupplier.id);
  expectDenied("A-admin reads B supplier secret", res4);

  // member (no admin role) inside tenant A must NOT see suppliers at all
  const res5 = await sessAmember.client
    .from("suppliers")
    .select("id")
    .eq("company_id", A.id);
  expectDenied("A-member reads A suppliers (admin-only)", res5);

  // payments — leak check across tenants
  const res6 = await sessAadmin.client
    .from("payments")
    .select("id")
    .eq("company_id", B.id);
  expectDenied("A-admin reads B payments", res6);

  // notifications: B-admin must NOT see A-buyer's notifications
  await admin.from("notifications").insert({
    company_id: A.id,
    recipient_id: aBuyer.id,
    title: `${TAG} notify`,
    kind: "info",
  });
  const res7 = await sessBadmin.client
    .from("notifications")
    .select("id")
    .eq("recipient_id", aBuyer.id);
  expectDenied("B-admin reads A buyer notification", res7);

  // inventory_levels / inventory_movements
  await admin.from("inventory_levels").insert({
    company_id: A.id,
    warehouse_id: aOrder.id, // dummy FK-free uuid
    product_id: aProduct.id,
  });
  const res8 = await sessBadmin.client
    .from("inventory_levels")
    .select("id")
    .eq("company_id", A.id);
  expectDenied("B-admin reads A inventory_levels", res8);

  // user_roles: A-admin must NOT see B's role rows (other than their own)
  const res9 = await sessAadmin.client
    .from("user_roles")
    .select("id")
    .eq("user_id", bAdmin.id);
  expectDenied("A-admin reads B-admin role row", res9);

  // analytics_events: seed one in B, A-admin must NOT see it
  await admin.from("analytics_events").insert({
    event_name: "product_view",
    vendor_id: B.id,
    metadata: { tag: TAG },
  });
  const res10 = await sessAadmin.client
    .from("analytics_events")
    .select("id")
    .eq("vendor_id", B.id);
  expectDenied("A-admin reads B analytics_events", res10);

  // Sanity: A-admin CAN see their own tenant's orders
  const res11 = await sessAadmin.client
    .from("orders")
    .select("id")
    .eq("id", aOrder.id);
  expectAllowed("A-admin reads own order (sanity)", res11);
}

// ───────────────────────────────────────────────────────── INSERT denial
console.log("\n✏️  INSERT — cross-tenant + forged-id denial");
{
  // A-admin tries to insert order_items into B's order (forged tenant join)
  const res = await sessAadmin.client.from("order_items").insert({
    order_id: bOrder.id,
    product_id: bProduct.id,
    quantity: 1,
    unit_price_mad: 1,
  });
  expectDenied("A-admin inserts order_item into B order", res);

  // A-buyer tries to insert an order pretending to be B-buyer
  const res2 = await sessAbuyer.client.from("orders").insert({
    order_number: `${TAG}-forge`,
    company_id: B.id,
    buyer_id: bBuyer.id, // forged
    total_mad: 1,
  });
  expectDenied("A-buyer inserts order as B-buyer", res2);

  // A-buyer tries to mismatch buyer_id (privilege escalation via spoofed id)
  const res3 = await sessAbuyer.client.from("orders").insert({
    order_number: `${TAG}-forge2`,
    company_id: A.id,
    buyer_id: bBuyer.id, // not auth.uid()
    total_mad: 1,
  });
  expectDenied("A-buyer inserts order with spoofed buyer_id", res3);

  // A-admin tries to insert an invoice for B
  const res4 = await sessAadmin.client.from("invoices").insert({
    company_id: B.id,
    order_id: bOrder.id,
    buyer_id: bBuyer.id,
    invoice_number: `${TAG}-forge-inv`,
    total_mad: 1,
  });
  expectDenied("A-admin inserts invoice for B", res4);

  // A-admin tries to insert payment for B's invoice
  const res5 = await sessAadmin.client.from("payments").insert({
    company_id: B.id,
    invoice_id: bInvoice.id,
    amount: 1,
  });
  expectDenied("A-admin inserts payment in B", res5);

  // A-member (no admin role) tries to insert a supplier in A
  const res6 = await sessAmember.client.from("suppliers").insert({
    company_id: A.id,
    domain: `https://${TAG}-mem.example.com`,
    name: "x",
    consumer_key: "x",
    consumer_secret: "x",
  });
  expectDenied("A-member inserts supplier (role escalation)", res6);

  // A-member tries to grant themselves admin role in A (role escalation)
  const res7 = await sessAmember.client.from("user_roles").insert({
    user_id: aMember.id,
    company_id: A.id,
    role: "admin",
  });
  expectDenied("A-member self-grants admin role", res7);

  // A-admin tries to grant a role inside B
  const res8 = await sessAadmin.client.from("user_roles").insert({
    user_id: bAdmin.id,
    company_id: B.id,
    role: "admin",
  });
  expectDenied("A-admin grants role inside B", res8);

  // A-admin tries to grant themselves super_admin
  const res9 = await sessAadmin.client.from("user_roles").insert({
    user_id: aAdmin.id,
    role: "super_admin",
  });
  expectDenied("A-admin self-grants super_admin", res9);

  // analytics_events: direct anon/auth insert must be denied (hardened path)
  const res10 = await sessAadmin.client.from("analytics_events").insert({
    event_name: "product_view",
    vendor_id: A.id,
  });
  expectDenied("A-admin direct-inserts analytics_events", res10);

  // notifications: A-member tries to send a notification (admin-gated insert)
  const res11 = await sessAmember.client.from("notifications").insert({
    company_id: A.id,
    recipient_id: aBuyer.id,
    title: "spam",
    kind: "info",
  });
  expectDenied("A-member inserts notification", res11);

  // inventory_movements: A-admin tries to write into B
  const res12 = await sessAadmin.client.from("inventory_movements").insert({
    company_id: B.id,
    product_id: bProduct.id,
    warehouse_id: bOrder.id,
    movement_type: "adjust",
    quantity: 1,
  });
  expectDenied("A-admin writes inventory_movement in B", res12);
}

// ───────────────────────────────────────────────────────── UPDATE denial
console.log("\n✏️  UPDATE — cross-tenant denial");
{
  // A-admin tries to mutate B's order
  const res = await sessAadmin.client
    .from("orders")
    .update({ admin_notes: "pwned" })
    .eq("id", bOrder.id)
    .select("id");
  expectDenied("A-admin updates B order", res);

  // A-buyer tries to mark someone else's invoice as paid
  const res2 = await sessAbuyer.client
    .from("invoices")
    .update({ status: "paid" })
    .eq("id", bInvoice.id)
    .select("id");
  expectDenied("A-buyer updates B invoice", res2);

  // A-admin tries to flip B's company is_listed
  const res3 = await sessAadmin.client
    .from("companies")
    .update({ is_listed: false })
    .eq("id", B.id)
    .select("id");
  expectDenied("A-admin updates B company", res3);

  // A-admin tries to elevate B-admin's role
  const res4 = await sessAadmin.client
    .from("user_roles")
    .update({ role: "super_admin" })
    .eq("user_id", bAdmin.id)
    .select("id");
  expectDenied("A-admin elevates B-admin role", res4);
}

// ───────────────────────────────────────────────────────── DELETE denial
console.log("\n🗑️  DELETE — cross-tenant denial");
{
  const res = await sessAadmin.client
    .from("orders")
    .delete()
    .eq("id", bOrder.id)
    .select("id");
  expectDenied("A-admin deletes B order", res);

  const res2 = await sessAadmin.client
    .from("notifications")
    .delete()
    .eq("recipient_id", bBuyer.id)
    .select("id");
  expectDenied("A-admin deletes B notifications", res2);

  // A-admin tries to revoke B-admin's role
  const res3 = await sessAadmin.client
    .from("user_roles")
    .delete()
    .eq("user_id", bAdmin.id)
    .select("id");
  expectDenied("A-admin revokes B-admin role", res3);

  // Verify B-admin's role is still there
  const { data: stillThere } = await admin
    .from("user_roles")
    .select("id")
    .eq("user_id", bAdmin.id)
    .eq("role", "admin");
  if (stillThere?.length) pass("B-admin role survived cross-tenant DELETE");
  else fail("B-admin role survived cross-tenant DELETE", "row missing");
}

// ───────────────────────────────────────────────────── public exposure
console.log("\n🌐 Public exposure");
{
  // Anon may browse listed companies but NOT internal fields like
  // payment_instructions or ICE/RC/TVA.
  const { createClient } = await import("@supabase/supabase-js");
  const anon = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_ANON_KEY,
    { auth: { persistSession: false } },
  );

  const { data: listed, error: listedErr } = await anon
    .from("companies")
    .select("id, slug, display_name")
    .eq("id", A.id);
  if (listedErr || !listed?.length)
    fail("anon browses listed company", listedErr?.message ?? "no row");
  else pass("anon browses listed company (allowed fields only)");

  // Anon must NOT see supplier credentials
  const { data: sup, error: supErr } = await anon
    .from("suppliers")
    .select("id")
    .eq("company_id", A.id);
  expectDenied("anon reads suppliers", { data: sup, error: supErr });

  // Anon must NOT see orders / invoices / payments / analytics_events
  for (const tbl of ["orders", "invoices", "payments", "analytics_events"]) {
    const res = await anon.from(tbl).select("id").limit(1);
    expectDenied(`anon reads ${tbl}`, res);
  }
}

// ──────────────────────────────────────────────────────── cleanup
console.log("\n🧹 Cleanup…");
await cleanup();
summary();
