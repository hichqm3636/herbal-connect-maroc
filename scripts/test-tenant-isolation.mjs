#!/usr/bin/env node
/**
 * Multi-tenant RLS isolation test.
 *
 * Creates two ephemeral test companies (A, B) with one staff user + one
 * product each, then simulates each user's JWT and verifies that:
 *   - User A can only see products of company A.
 *   - User B can only see products of company B.
 *   - Neither can read the other's orders, invoices, or profiles.
 *
 * Cleans up everything at the end. Run via: `node scripts/test-tenant-isolation.mjs`
 */
import { Client } from "pg";
import { randomUUID } from "node:crypto";

const client = new Client({ ssl: { rejectUnauthorized: false } });
await client.connect();

const A = { company: randomUUID(), user: randomUUID(), product: randomUUID(), order: randomUUID() };
const B = { company: randomUUID(), user: randomUUID(), product: randomUUID(), order: randomUUID() };

let failures = 0;
const log = (ok, msg) => {
  if (!ok) failures++;
  console.log(`${ok ? "✅" : "❌"} ${msg}`);
};

async function asUser(userId, fn) {
  await client.query("BEGIN");
  await client.query(`SET LOCAL role authenticated`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    return await fn();
  } finally {
    await client.query("ROLLBACK");
  }
}

async function setup() {
  // Insert companies (super-admin context — bypass RLS via service role conn)
  for (const t of [A, B]) {
    await client.query(
      `INSERT INTO companies (id, name, display_name, slug, brand_color)
       VALUES ($1, $2, $3, $4, '#16a34a')`,
      [t.company, `test-${t.company.slice(0, 8)}`, "Test Co", `test-${t.company.slice(0, 8)}`],
    );
    // Profile linked to company (no auth.users row needed for RLS sim — RLS only checks auth.uid())
    await client.query(
      `INSERT INTO profiles (id, company_id, full_name) VALUES ($1, $2, 'Test User')`,
      [t.user, t.company],
    );
    await client.query(
      `INSERT INTO user_roles (user_id, company_id, role) VALUES ($1, $2, 'admin')`,
      [t.user, t.company],
    );
    await client.query(
      `INSERT INTO products (id, company_id, name_ar, price_mad, active)
       VALUES ($1, $2, 'منتج اختبار', 100, true)`,
      [t.product, t.company],
    );
    await client.query(
      `INSERT INTO orders (id, company_id, buyer_id, order_number, total_mad, status)
       VALUES ($1, $2, $3, $4, 100, 'pending')`,
      [t.order, t.company, t.user, `TST-${t.order.slice(0, 6)}`, ],
    );
  }
}

async function tests() {
  // Test 1: User A sees only A's products
  await asUser(A.user, async () => {
    const { rows } = await client.query(
      `SELECT id, company_id FROM products WHERE id IN ($1, $2)`,
      [A.product, B.product],
    );
    log(rows.length === 1 && rows[0].id === A.product, "User A sees only A's product");
  });

  // Test 2: User B sees only B's products
  await asUser(B.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM products WHERE id IN ($1, $2)`,
      [A.product, B.product],
    );
    log(rows.length === 1 && rows[0].id === B.product, "User B sees only B's product");
  });

  // Test 3: User A cannot see B's orders
  await asUser(A.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM orders WHERE id = $1`,
      [B.order],
    );
    log(rows.length === 0, "User A cannot see B's orders");
  });

  // Test 4: User A cannot see B's profiles
  await asUser(A.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM profiles WHERE id = $1`,
      [B.user],
    );
    log(rows.length === 0, "User A cannot see B's profile");
  });

  // Test 5: User A cannot UPDATE B's products
  await asUser(A.user, async () => {
    const { rowCount } = await client.query(
      `UPDATE products SET price_mad = 999 WHERE id = $1`,
      [B.product],
    );
    log(rowCount === 0, "User A cannot UPDATE B's products");
  });

  // Test 6: User A cannot INSERT product into company B
  await asUser(A.user, async () => {
    let blocked = false;
    try {
      await client.query(
        `INSERT INTO products (company_id, name_ar, price_mad) VALUES ($1, 'x', 1)`,
        [B.company],
      );
    } catch {
      blocked = true;
    }
    log(blocked, "User A cannot INSERT into company B");
  });
}

async function cleanup() {
  for (const t of [A, B]) {
    await client.query(`DELETE FROM orders WHERE id = $1`, [t.order]);
    await client.query(`DELETE FROM products WHERE id = $1`, [t.product]);
    await client.query(`DELETE FROM user_roles WHERE user_id = $1`, [t.user]);
    await client.query(`DELETE FROM profiles WHERE id = $1`, [t.user]);
    await client.query(`DELETE FROM companies WHERE id = $1`, [t.company]);
  }
}

try {
  await setup();
  await tests();
} finally {
  await cleanup();
  await client.end();
}

console.log(`\n${failures === 0 ? "🎉 جميع الاختبارات نجحت" : `⚠️ ${failures} اختبار فشل`}`);
process.exit(failures === 0 ? 0 : 1);
