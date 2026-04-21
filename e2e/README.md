# End-to-End tests (Playwright)

These specs cover the user-facing behaviour that vitest snapshot tests
can't reach — full route navigation through the live React + TanStack
Router app — while keeping the backend mocked via `page.route()` so no
data is written to Lovable Cloud.

## Run locally

```bash
npm run test:e2e
```

The first run also needs:

```bash
npx playwright install chromium
```

## Specs

- `orders-mad-format.spec.ts` — places a test order against the mocked
  Supabase REST endpoint, then asserts every monetary cell rendered on
  `/orders` (header totals, per-line unit prices, per-line subtotals)
  matches the canonical `formatMAD` pattern (`/^-?[\d,]+\.\d{2} MAD$/`).

## Sandbox note

The Lovable build sandbox does not have the X11/glib system libraries
required to launch Chromium, so `npm run test:e2e` only runs in
environments with full Linux desktop deps (CI runners, your laptop,
Playwright's official Docker image `mcr.microsoft.com/playwright:v1.x`).
The vitest suite (`npm test`) covers the same `formatMAD` invariants at
the component level and runs everywhere.
