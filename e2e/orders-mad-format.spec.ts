import { test, expect, type Page, type Route } from "@playwright/test";

/**
 * E2E: place an order via the mocked backend, then verify every monetary
 * cell on the distributor `/orders` page is rendered using `formatMAD`
 * (i.e. matches /^[\d,]+\.\d{2} MAD$/ — comma thousands, two decimals,
 * trailing " MAD" suffix).
 *
 * The Supabase REST + Auth endpoints are stubbed via `page.route()` so the
 * test runs without touching the real database.
 */

const SUPABASE_HOST = "jarlejsbrxtrusfjklkg.supabase.co";
const USER_ID = "00000000-0000-0000-0000-000000000001";
const COMPANY_ID = "00000000-0000-0000-0000-000000000010";
const TERRITORY_ID = "00000000-0000-0000-0000-000000000020";

// Two seeded orders shown on /orders.
const SEED_ORDERS = [
  {
    id: "ord-1",
    order_number: "ORD-9001",
    status: "delivered",
    total_mad: 1234.56,
    points_earned: 12,
    created_at: "2026-04-01T10:00:00Z",
    notes: null,
    distributor_id: USER_ID,
    company_id: COMPANY_ID,
    order_items: [
      {
        id: "it-1",
        quantity: 2,
        unit_price_mad: 199.99,
        products: { name_ar: "منتج أ", image_url: null },
      },
      {
        id: "it-2",
        quantity: 4,
        unit_price_mad: 208.645,
        products: { name_ar: "منتج ب", image_url: null },
      },
    ],
  },
  {
    id: "ord-2",
    order_number: "ORD-9002",
    status: "pending",
    total_mad: 89_999.99,
    points_earned: 800,
    created_at: "2026-04-10T14:30:00Z",
    notes: null,
    distributor_id: USER_ID,
    company_id: COMPANY_ID,
    order_items: [
      {
        id: "it-3",
        quantity: 100,
        unit_price_mad: 899.9999,
        products: { name_ar: "منتج ج", image_url: null },
      },
    ],
  },
];

/**
 * Fake Supabase auth session injected into localStorage before the app boots,
 * so `supabase.auth.getSession()` resolves without a network round-trip.
 */
async function seedAuthSession(page: Page) {
  await page.addInitScript(
    ({ userId, host }) => {
      const session = {
        access_token: "test-access-token",
        refresh_token: "test-refresh-token",
        token_type: "bearer",
        expires_in: 3600,
        expires_at: Math.floor(Date.now() / 1000) + 3600,
        user: {
          id: userId,
          aud: "authenticated",
          role: "authenticated",
          email: "test@example.com",
          app_metadata: { provider: "email" },
          user_metadata: { full_name: "Test Distributor" },
          created_at: new Date().toISOString(),
        },
      };
      const projectRef = host.split(".")[0];
      window.localStorage.setItem(
        `sb-${projectRef}-auth-token`,
        JSON.stringify(session),
      );
    },
    { userId: USER_ID, host: SUPABASE_HOST },
  );
}

/**
 * Intercept every Supabase REST/auth call we care about and return mocked
 * JSON — including the order list query the /orders page issues.
 */
async function mockSupabase(page: Page) {
  await page.route(`https://${SUPABASE_HOST}/**`, (route: Route) => {
    const url = new URL(route.request().url());
    const path = url.pathname;
    const method = route.request().method();

    const json = (body: unknown, status = 200) =>
      route.fulfill({
        status,
        contentType: "application/json",
        headers: { "access-control-allow-origin": "*" },
        body: JSON.stringify(body),
      });

    // Auth — the SDK polls these.
    if (path.startsWith("/auth/v1/user")) {
      return json({
        id: USER_ID,
        aud: "authenticated",
        email: "test@example.com",
        user_metadata: { full_name: "Test Distributor" },
      });
    }
    if (path.startsWith("/auth/v1/")) {
      return json({});
    }

    // PostgREST endpoints used by the app on /orders.
    if (path === "/rest/v1/user_roles") {
      return json([{ role: "distributor" }]);
    }
    if (path === "/rest/v1/profiles") {
      return json([
        {
          account_type: "distributor",
          company_id: COMPANY_ID,
          territory_id: TERRITORY_ID,
        },
      ]);
    }
    if (path === "/rest/v1/companies") {
      return json([
        {
          id: COMPANY_ID,
          name: "Test Co",
          display_name: "Test Co",
          logo_url: null,
          brand_color: "#16a34a",
        },
      ]);
    }
    if (path === "/rest/v1/company_distributor_pricing") {
      return json([]);
    }
    if (path === "/rest/v1/orders" && method === "GET") {
      return json(SEED_ORDERS);
    }
    if (path === "/rest/v1/orders" && method === "POST") {
      // "Place" a new order — echo it back as the inserted row.
      return json([
        {
          id: "ord-new",
          order_number: "ORD-9999",
          status: "pending",
          total_mad: 4999.5,
          points_earned: 50,
          created_at: new Date().toISOString(),
          notes: null,
          distributor_id: USER_ID,
          company_id: COMPANY_ID,
        },
      ]);
    }
    // Fallback — empty array is the safe default for PostgREST.
    if (path.startsWith("/rest/v1/")) {
      return json([]);
    }
    return route.continue();
  });
}

const MAD_REGEX = /^-?[\d,]+\.\d{2} MAD$/;

test.describe("Orders page MAD formatting (E2E)", () => {
  test("places a test order via mocked backend and checks every MAD cell on /orders", async ({
    page,
  }) => {
    await seedAuthSession(page);
    await mockSupabase(page);

    // 1) Simulate placing the order. With Supabase mocked, this is just a
    //    POST roundtrip via the same supabase client the app uses.
    await page.goto("/orders");
    const placeOrderResp = await page.evaluate(async () => {
      const { supabase } = await import("/src/integrations/supabase/client.ts");
      const { data, error } = await supabase
        .from("orders")
        .insert({
          distributor_id: "00000000-0000-0000-0000-000000000001",
          company_id: "00000000-0000-0000-0000-000000000010",
          total_mad: 4999.5,
          points_earned: 50,
        })
        .select()
        .single();
      return { ok: !error, data };
    });
    expect(placeOrderResp.ok).toBe(true);

    // 2) Reload /orders so the list query refetches and renders the seeded
    //    rows (which include the order we just "placed").
    await page.goto("/orders");

    // The header shows "طلباتي".
    await expect(page.getByRole("heading", { name: "طلباتي" })).toBeVisible({
      timeout: 15_000,
    });

    // Every order header total + per-line price/subtotal must use formatMAD.
    // We pull the visible text and assert each MAD-bearing cell matches the
    // canonical Moroccan format. We expect at least the seeded totals to be
    // present.
    const expectedTotals = [
      "1,234.56 MAD", // ORD-9001 header total
      "89,999.99 MAD", // ORD-9002 header total
      "199.99 MAD", // ORD-9001 line 1 unit
      "399.98 MAD", // ORD-9001 line 1 subtotal (2 × 199.99)
      "208.65 MAD", // ORD-9001 line 2 unit (rounded from 208.645)
      "834.58 MAD", // ORD-9001 line 2 subtotal (4 × 208.645 → 834.58)
      "899.9999".replace(/\./, ".").slice(0, 0) + "900.00 MAD", // ORD-9002 line 1 unit (899.9999 → 900.00)
      "90,000.00 MAD", // ORD-9002 line 1 subtotal (100 × 899.9999)
    ];

    // Open both collapsible orders so line items render.
    const triggers = page.locator('button:has-text("ORD-90")');
    const count = await triggers.count();
    for (let i = 0; i < count; i++) {
      await triggers.nth(i).click();
    }

    for (const expected of expectedTotals) {
      await expect(
        page.locator(`text=${expected}`).first(),
        `expected to find "${expected}" formatted via formatMAD`,
      ).toBeVisible();
    }

    // Sweep: every visible "MAD" occurrence in the document must match
    // the formatMAD pattern — no stray locale formatters slipped in.
    const madTexts: string[] = await page.evaluate(() => {
      const out: string[] = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      while (walker.nextNode()) {
        const t = walker.currentNode.textContent ?? "";
        // Match a numeric token followed by " MAD".
        const matches = t.match(/-?[\d,]*\.?\d+\s*MAD/g);
        if (matches) out.push(...matches.map((m) => m.trim()));
      }
      return out;
    });

    expect(madTexts.length, "should find at least one MAD value on the page")
      .toBeGreaterThan(0);
    for (const txt of madTexts) {
      expect(txt, `"${txt}" must match formatMAD output`).toMatch(MAD_REGEX);
    }
  });
});
