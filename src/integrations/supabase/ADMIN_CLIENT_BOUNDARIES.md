# `supabaseAdmin` — Service Role Containment

`supabaseAdmin` is constructed from `SUPABASE_SERVICE_ROLE_KEY` in
[`client.server.ts`](./client.server.ts). It **bypasses every Row Level
Security policy** in the database. Any code that holds a reference to it
effectively holds full read/write access to every tenant's data.

To keep blast radius small, imports of `supabaseAdmin` are mechanically
restricted by ESLint (`no-restricted-imports` in `eslint.config.js`) and
fail CI on violation.

## Why it bypasses RLS

Service-role connections are needed for legitimate server-side work that
no single tenant could perform on their own:

- resolving the active tenant before the user is known (e.g. public
  vendor directory lookup by slug),
- recording analytics events with a trustworthy `vendor_id` derived from
  `products.company_id` rather than client input,
- ingesting webhooks from external providers (WooCommerce, payment
  gateways) where no Supabase session exists,
- privileged super-admin operations that must read across companies.

In all of these cases the call site itself is responsible for enforcing
the right authorization check (signature verification, role check via
`requireSupabaseAuth`, rate limiting, tenant resolution) **before**
touching the admin client.

## Allowed import paths

| Path pattern                                  | Purpose                                      |
| --------------------------------------------- | -------------------------------------------- |
| `src/**/*.functions.ts(x)`                    | TanStack `createServerFn` modules (RPC)      |
| `src/**/*.server.ts(x)`                       | Server-only helpers (blocked from client by import-protection) |
| `src/routes/api/**`                           | Server route handlers (webhooks, public APIs, cron) |
| `src/integrations/supabase/client.server.ts`  | The module itself                            |

## Forbidden import paths

- React components (`src/components/**`, `src/routes/**.tsx` page files)
- Hooks (`src/hooks/**`)
- Shared utilities (`src/lib/**.ts` without a `.functions` or `.server`
  suffix, `src/utils/**.ts`)
- Test files that run in the browser bundle
- Anything reachable from `__root.tsx` via the client import graph

If you need privileged data in a UI flow, write a `createServerFn` that
uses `supabaseAdmin` internally and exposes only the minimum DTO the UI
needs. Do **not** import the admin client into a component "just to make
one call".

## How the boundary is enforced

1. **ESLint** — `no-restricted-imports` blocks the module everywhere, then
   an override allow-lists the four path patterns above. Violations fail
   `bun run lint`, which gates CI.
2. **Import protection** — the `*.server.ts` suffix is rejected by the
   bundler if reachable from a client entry point.
3. **Static containment test** — `src/integrations/supabase/adminContainment.test.ts`
   re-greps the source tree on every `bun run test` and fails if any
   importer falls outside the allow-list. This catches edits made by
   tools or contributors that bypass ESLint.
