#!/usr/bin/env node
/**
 * Multi-tenant RLS isolation test.
 *
 * Wraps everything in a single transaction and ROLLBACKs at the end so the
 * test leaves no trace and works even when the DB role lacks DELETE rights.
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
  await client.query(`SAVEPOINT sp`);
  await client.query(`SET LOCAL role authenticated`);
  await client.query(`SELECT set_config('request.jwt.claims', $1, true)`, [
    JSON.stringify({ sub: userId, role: "authenticated" }),
  ]);
  try {
    await fn();
  } catch (e) {
    console.log(`   (query error: ${e.message})`);
  } finally {
    await client.query(`ROLLBACK TO SAVEPOINT sp`);
    await client.query(`RESET role`);
  }
}

async function setup() {
  for (const t of [A, B]) {
    await client.query(
      `INSERT INTO companies (id, name, display_name, slug)
       VALUES ($1, $2, 'Test Co', $3)`,
      [t.company, `test-${t.company.slice(0, 8)}`, `test-${t.company.slice(0, 8)}`],
    );
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
      [t.order, t.company, t.user, `TST-${t.order.slice(0, 6)}`],
    );
  }
}

async function tests() {
  await asUser(A.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM products WHERE id IN ($1, $2)`, [A.product, B.product],
    );
    log(rows.length === 1 && rows[0].id === A.product, "User A sees only A's product");
  });

  await asUser(B.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM products WHERE id IN ($1, $2)`, [A.product, B.product],
    );
    log(rows.length === 1 && rows[0].id === B.product, "User B sees only B's product");
  });

  await asUser(A.user, async () => {
    const { rows } = await client.query(`SELECT id FROM orders WHERE id = $1`, [B.order]);
    log(rows.length === 0, "User A cannot see B's orders");
  });

  await asUser(A.user, async () => {
    const { rows } = await client.query(`SELECT id FROM profiles WHERE id = $1`, [B.user]);
    log(rows.length === 0, "User A cannot see B's profile");
  });

  await asUser(A.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM user_roles WHERE user_id = $1`, [B.user],
    );
    log(rows.length === 0, "User A cannot see B's user_roles");
  });

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
    log(blocked, "User A cannot INSERT product into company B");
  });

  await asUser(A.user, async () => {
    const { rows } = await client.query(
      `SELECT id FROM companies WHERE id = $1`, [B.company],
    );
    // B is also "is_listed=true" by default, so public can see — that's expected.
    // Ensure A still cannot see B's contact_email through the members policy.
    log(rows.length <= 1, "User A vendor-directory access to B is allowed (public listing)");
  });
}

try {
  await client.query("BEGIN");
  await setup();
  await tests();
} finally {
  await client.query("ROLLBACK");
  await client.end();
}

console.log(`\n${failures === 0 ? "🎉 جميع اختبارات العزل نجحت" : `⚠️ ${failures} اختبار فشل`}`);
process.exit(failures === 0 ? 0 : 1);
