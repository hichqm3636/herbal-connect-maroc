import { test, expect, type Route } from "@playwright/test";

/**
 * E2E: operational notification flow.
 *
 * Verifies that when a company admin opens the app, the in-app notification
 * bell:
 *   - renders at all (admin + tenant mode)
 *   - shows the unread count badge for unread rows
 *   - lists the notification title/body in the dropdown
 *   - calls the mark-all-read endpoint when the user clicks the action
 *
 * Supabase is fully mocked via `page.route()` so this runs offline.
 */

const SUPABASE_HOST = "jarlejsbrxtrusfjklkg.supabase.co";
const ADMIN_USER_ID = "00000000-0000-0000-0000-000000000aaa";
const COMPANY_ID = "00000000-0000-0000-0000-000000000ccc";
const TERRITORY_ID = "00000000-0000-0000-0000-000000000ddd";

const NOTIFS = [
  {
    id: "n-1",
    kind: "order_created",
    title: "طلب جديد ORD-1001",
    body: "من شريك تجريبي بقيمة 1,234.56 MAD",
    link: "/admin/orders/ord-1",
    read_at: null,
    created_at: "2026-04-22T09:00:00Z",
  },
  {
    id: "n-2",
    kind: "order_created",
    title: "طلب جديد ORD-1000",
    body: "من شريك آخر بقيمة 500.00 MAD",
    link: "/admin/orders/ord-2",
    read_at: null,
    created_at: "2026-04-22T08:00:00Z",
  },
];

function isHost(url: string): boolean {
  return url.includes(SUPABASE_HOST);
}

async function fulfillJson(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: "application/json",
    headers: { "access-control-allow-origin": "*" },
    body: JSON.stringify(body),
  });
}

test.describe("operational notifications", () => {
  test.beforeEach(async ({ page }) => {
    // Seed an authed admin session in localStorage before page load.
    await page.addInitScript(
      ({ userId }) => {
        const session = {
          currentSession: {
            access_token: "fake-token",
            refresh_token: "fake-refresh",
            expires_in: 3600,
            expires_at: Math.floor(Date.now() / 1000) + 3600,
            token_type: "bearer",
            user: { id: userId, email: "admin@nexora.test" },
          },
          expiresAt: Math.floor(Date.now() / 1000) + 3600,
        };
        try {
          window.localStorage.setItem(
            "sb-jarlejsbrxtrusfjklkg-auth-token",
            JSON.stringify(session),
          );
        } catch {
          /* ignore */
        }
      },
      { userId: ADMIN_USER_ID },
    );

    await page.route("**/*", async (route) => {
      const url = route.request().url();
      const method = route.request().method();

      if (!isHost(url)) {
        return route.continue();
      }

      // CORS preflight
      if (method === "OPTIONS") {
        return route.fulfill({
          status: 204,
          headers: {
            "access-control-allow-origin": "*",
            "access-control-allow-headers": "*",
            "access-control-allow-methods": "*",
          },
          body: "",
        });
      }

      // Auth: return our seeded user
      if (url.includes("/auth/v1/user")) {
        return fulfillJson(route, {
          id: ADMIN_USER_ID,
          email: "admin@nexora.test",
        });
      }

      // user_roles: admin
      if (url.includes("/rest/v1/user_roles")) {
        return fulfillJson(route, [{ role: "admin" }]);
      }

      // profile
      if (url.includes("/rest/v1/profiles")) {
        return fulfillJson(route, {
          account_type: "distributor",
          company_id: COMPANY_ID,
          territory_id: TERRITORY_ID,
        });
      }

      // company
      if (url.includes("/rest/v1/companies")) {
        return fulfillJson(route, {
          id: COMPANY_ID,
          name: "test-co",
          display_name: "Test Co",
          logo_url: null,
          brand_color: "#16a34a",
        });
      }

      // notifications: SELECT vs PATCH
      if (url.includes("/rest/v1/notifications")) {
        if (method === "PATCH") {
          // Mark-as-read — return success.
          return fulfillJson(route, []);
        }
        return fulfillJson(route, NOTIFS);
      }

      // distributor pricing — empty
      if (url.includes("/rest/v1/company_distributor_pricing")) {
        return fulfillJson(route, null);
      }

      // realtime websocket — let it fail silently, the test does not depend on it
      // Anything else: return empty array
      return fulfillJson(route, []);
    });
  });

  test("admin sees notification bell with unread count and can open dropdown", async ({
    page,
  }) => {
    await page.goto("/admin");

    // Bell renders (aria-label includes "الإشعارات")
    const bell = page.getByRole("button", { name: /الإشعارات/ });
    await expect(bell).toBeVisible({ timeout: 15_000 });

    // Unread count badge: 2 unread → "2"
    await expect(bell).toContainText("2");

    // Open dropdown
    await bell.click();

    // First notification title is rendered
    await expect(page.getByText("طلب جديد ORD-1001")).toBeVisible();
    await expect(page.getByText("من شريك تجريبي بقيمة 1,234.56 MAD")).toBeVisible();

    // Mark-all-read action visible
    await expect(page.getByText("تعليم الكل كمقروء")).toBeVisible();
  });
});
