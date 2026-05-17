# Nexora — Business Lifecycles Map

> Operational truth as currently implemented (not aspirational design).
> Goal: surface lifecycle gaps, orphan systems, missing bridges, and unclear
> ownership boundaries across the platform's seven core domains.

Legend:
- **Actor** = who/what triggers the step (buyer, vendor admin, system trigger,
  edge function, cron, external webhook).
- **Side-effects** = concrete DB writes (tables, columns, sequences).
- **Bridges** = explicit subsystem coupling points (triggers, RPCs, edge fn calls).
- **Gap** = missing automation, manual-only step, or unowned transition.

---

## 1. Orders

### Triggering events
- Buyer submits cart at `/checkout` → `orders` INSERT (via RLS policy
  `Marketplace clients create orders at vendors`).
- External WooCommerce webhook at `/api/public/woo-webhook` → `orders` INSERT
  with `source` / `external_id`.

### Main flow
1. `orders` row created (`status='pending'`, `payment_status='pending'`,
   `order_number` auto-assigned).
2. `order_items` inserted by buyer in same transaction (RLS:
   `order_items_company_match` enforces vendor consistency).
3. Vendor admin transitions `status` in `/vendor/orders` UI:
   `pending → confirmed → preparing → shipped → delivered` (or `cancelled`).
4. Vendor admin transitions `payment_status` separately (or via
   `RecordPaymentDialog` / buyer proof upload).
5. Delivered + paid orders become eligible for **manual invoice issuance**.

### Actors
- Buyer (create), Vendor admin (status/payment updates), External system
  (Woo webhook), Super admin (read-only oversight).

### DB side-effects
- `orders` (status, payment_status, payment_paid_at, payment_reference,
  sync_error, external_status).
- `order_items` (line items, `cost_snapshot` captured at insert).
- `inventory_movements` — written by app code on confirm/ship for internal
  products (not by a DB trigger).
- `activity_logs` — written by app code on status transitions.

### Connected subsystems
- Inventory (stock decrement on confirmation path).
- Payments (manual record or buyer proof).
- Invoices (manual bridge only — see §3).
- Notifications (vendor pings on new order, buyer pings on status change).
- Loyalty (points accrual on delivery — see §6).
- Analytics (`analytics_events` records `order_placed`).

### Current gaps
- **No automatic order→invoice bridge.** Delivered+paid orders do not generate
  an invoice unless a vendor admin clicks "إصدار فاتورة". This is intentional
  (manual issuance workflow) but means orders can sit indefinitely without an
  invoice and no surfaced backlog count exists outside the orders list.
- WooCommerce sync only flows inbound; outbound status changes are not pushed
  back to Woo. `sync_error` exists but no retry queue.
- No state machine enforcement: any admin can move `status` in any direction
  (no DB trigger prevents `delivered → pending`).
- Cancellation does not auto-reverse inventory movements.

---

## 2. Payments

### Triggering events
- Vendor admin records payment via `RecordPaymentDialog` → `payments` INSERT
  + `invoices.paid_at` / `orders.payment_paid_at` update.
- Buyer uploads payment proof via `PaymentProofUploader` →
  `storage/payment-references/{company}/{...}` + `orders.payment_reference`.
- (Future) Stripe/Paddle — not currently wired.

### Main flow
1. Payment row inserted against an invoice (`payments.invoice_id` required).
2. Trigger / app code syncs `invoices.paid_at`, `invoices.status`,
   `orders.payment_status='paid'`.
3. Notification fires to buyer on confirmation.

### Actors
- Buyer (proof upload only), Vendor admin (record + confirm), Super admin.

### DB side-effects
- `payments` (amount, method, reference, paid_at).
- `invoices.paid_at`, `invoices.status`, `invoices.payment_method`.
- `orders.payment_status`, `orders.payment_paid_at`.
- `storage.objects` under `payment-references/` bucket.

### Connected subsystems
- Invoices (1:N — invoice ← payments).
- Orders (payment_status mirror).
- Notifications (buyer "payment received" alert).
- Subscription billing (`subscription_invoices`, separate flow — see §3.2).

### Current gaps
- **Order-level payment vs invoice-level payment are dual-tracked.** An order
  can be marked paid without an invoice; payment records cannot exist without
  an invoice. This creates two sources of truth.
- No partial-payment UI (DB supports multiple `payments` rows per invoice but
  UI assumes single payment).
- No refund flow.
- Buyer proof upload writes URL but does not flip `payment_status` — admin must
  confirm manually. No SLA / reminder.

---

## 3. Invoices

### 3.1 Sales invoices (`invoices`)

### Triggering event
- **Manual only.** Vendor admin clicks "إصدار فاتورة" on an eligible order in
  `/vendor/orders`.

### Main flow
1. App inserts `invoices` row with blank `invoice_number`, computed
   `subtotal_mad` / `vat_amount_mad` (VAT-inclusive split: `total/1.2`).
2. DB trigger `trg_assign_invoice_number` (BEFORE INSERT) consumes
   `invoice_sequences` (per company+year) → assigns canonical number.
3. DB trigger `on_invoice_issued` (AFTER INSERT) calls `pg_net` →
   edge fn `generate-invoice-pdf`.
4. Edge fn renders PDF, uploads to `storage/invoices/{company}/{year}/{number}.pdf`,
   updates `invoices.pdf_path`.
5. Edge fn dispatches `send-invoice-email` (best-effort, no-op if Resend not
   configured) → updates `invoices.email_sent_at`.
6. Payments recorded later flip `status` to `paid`.

### Actors
- Vendor admin (issuance), DB triggers (numbering, PDF dispatch), Edge fns
  (rendering, emailing), Buyer (passive recipient).

### DB side-effects
- `invoices` (full row + `invoice_number`, `pdf_path`, `email_sent_at`).
- `invoice_items` (copied from `order_items` at issuance).
- `invoice_sequences.next_number++`.

### Connected subsystems
- Orders (1:1 link via `order_id`).
- Payments (1:N).
- Storage (`invoices` private bucket, signed URLs for buyer access).
- Email (Resend via `send-invoice-email`).

### Current gaps
- **No backfill mechanism** for historical delivered+paid orders that pre-date
  the manual issuance workflow.
- Issuance does not block on stock/price discrepancies between `order_items`
  and `invoice_items`.
- Credit notes / corrective invoices are not modeled.
- PDF regeneration on company branding change is not automatic.

### 3.2 Subscription invoices (`subscription_invoices`)

- Separate table, separate lifecycle. Generated by app code when a company
  upgrades/renews a `company_subscriptions` plan.
- **Gap:** No automated renewal cron — subscription expiry is checked on read,
  not enforced on write. No dunning flow.

---

## 4. Inventory

### Triggering events
- Vendor admin creates/edits product (`products` row) → `inventory_levels`
  bootstrapped per warehouse (app-side).
- Order confirmation → `inventory_movements` INSERT (app-side, not trigger).
- Manual stock adjustment in vendor UI → `inventory_movements` +
  `inventory_levels` update.

### Main flow
1. `inventory_levels` holds current `quantity_on_hand` / `quantity_reserved` /
   `quantity_available` per (company, product, warehouse).
2. `inventory_movements` is the append-only audit log (movement_type, qty,
   reference).
3. `inventory_events` is a parallel event stream (event_type, payload) — used
   for downstream consumers (low-stock alerts, analytics).

### Actors
- Vendor admin (manual), App code (order/return paths), Super admin (oversight).

### DB side-effects
- `inventory_levels` (mutated).
- `inventory_movements` (append-only).
- `inventory_events` (append-only).
- `products.stock` — **legacy column still present**, partially mirrors
  `inventory_levels.quantity_available` but not consistently maintained.

### Connected subsystems
- Orders (decrement on confirm).
- Notifications (low-stock alerts — partially wired).
- Products (stock display on storefront).

### Current gaps
- **Three sources of truth**: `products.stock`, `inventory_levels`, and
  movement-derived running totals. No reconciliation job.
- No reservation lifecycle: `quantity_reserved` is not incremented at cart-add
  or order-place; only `quantity_on_hand` moves at confirm.
- Cancellation does not auto-reverse the movement.
- `inventory_events` has no documented consumer — possible orphan stream.
- Multi-warehouse is schema-supported but UI assumes default warehouse only.

---

## 5. Notifications

### Triggering events
- App-side INSERT into `notifications` from various code paths (order created,
  status change, payment recorded, review submitted, low stock).
- RLS policy `System and admins create notifications` requires the caller to be
  super_admin OR (in-company admin with admin role) — **buyers cannot create
  notifications**, including their own confirmations.

### Main flow
1. Code path determines `recipient_id`, `kind`, `title`, optional `link`.
2. Row inserted (must include `company_id`).
3. `NotificationsBell` polls / subscribes via Supabase Realtime.
4. Recipient marks read → `read_at = now()` (recipient-only UPDATE).

### Actors
- Vendor admin (implicit, via RLS), Super admin, App code running under admin
  context.

### DB side-effects
- `notifications` rows; no fan-out table, no delivery log.

### Connected subsystems
- Orders, Payments, Invoices, Reviews, Inventory (all emit).
- Email (separate path — only invoice emails currently dispatched).
- WhatsApp (`send-whatsapp` edge fn exists, **not wired to notification inserts**).

### Current gaps
- **Buyer-targeted notifications are emitted only when an admin is the actor.**
  Self-service flows (e.g. buyer cancels own pending order, if added) cannot
  create their own confirmation notification under current RLS.
- No multi-channel fan-out: in-app vs email vs WhatsApp are independent;
  `notifications` row does not record which channels were attempted.
- No notification preferences per user.
- WhatsApp edge fn is an **orphan subsystem** — wired to nothing.
- No retention / archival policy.

---

## 6. Loyalty

### Triggering events
- Order delivered → app-side INSERT into `loyalty_transactions` with
  `type='earn'`, `points = sum(order_items.quantity * products.points_per_unit)`.
- Admin manual adjustment (earn/redeem/expire).

### Main flow
1. `loyalty_transactions` row inserted (RLS: admin-only INSERT).
2. `profiles.loyalty_points` updated by app code (no DB trigger).
3. Buyer sees balance in `LoyaltyCard` on `/client`.

### Actors
- Vendor admin (manual adjustments), App code on delivery (admin-context insert).

### DB side-effects
- `loyalty_transactions` (append-only).
- `profiles.loyalty_points` (mutated, denormalized).

### Connected subsystems
- Orders (earn trigger).
- Products (`points_per_unit` source).
- Profiles (denormalized balance).

### Current gaps
- **Balance drift risk**: `profiles.loyalty_points` is maintained by app code,
  not by trigger over `loyalty_transactions`. No reconciliation.
- No redemption flow at checkout (points are accrued but cannot be spent in UI).
- No expiry job.
- `company_id` on `loyalty_transactions` means loyalty is per-vendor, but
  `profiles.loyalty_points` is a single cross-vendor scalar — **schema/UI
  mismatch**.

---

## 7. Identity / Roles

### Triggering events
- User signs up (`auth.users`) → `profiles` row created by handler.
- Vendor tenant provisioning (`create-distributor` edge fn or super admin
  flow) → `companies` + `user_roles` (vendor + admin) inserted.
- Super admin grants/revokes roles in `/super-admin/users`.
- Vendor admin invites team members in `/vendor/team`.

### Main flow
1. `auth.users` (managed by Supabase Auth).
2. `profiles` row (1:1 with auth user, holds `company_id` membership).
3. `user_roles` rows (N:M user↔role, scoped by optional `company_id`).
4. `has_role(uid, role)` SECURITY DEFINER fn drives all RLS.
5. Tenant invariant (Phase 1): every vendor tenant must have ≥1 admin role.
   CI test `scripts/test-tenant-admin-invariant.mjs` enforces.

### Actors
- User (signup), Super admin (provisioning + role grants), Vendor admin (team
  management within company), System trigger (`trg_prevent_self_company_change`
  on profiles).

### DB side-effects
- `auth.users`, `profiles`, `user_roles`, `companies`.
- `admin_activity_log` / `activity_logs` on grants.

### Connected subsystems
- Every RLS policy in the platform (via `has_role` + `current_company_id`).
- Notifications (admin-role gated INSERT).
- Storage (folder-scoped to `current_company_id`).

### Current gaps
- **`has_role()` does not filter `is_enabled=true`** — disabling a role in
  `user_roles` does not revoke access. (Flagged in current security scan.)
- No role-expiry / time-bound grants.
- No audit trail on `user_roles` changes beyond generic `admin_activity_log`.
- `company_id IS NULL` global roles (intended for super_admin) are valid for
  any role in the enum — relies on app-side discipline.
- Multi-tenant membership: schema allows a user to hold roles across multiple
  companies, but `profiles.company_id` pins them to one tenant for RLS. The
  `TenantSwitcher` exists but switching semantics are app-side only.

---

## Cross-cutting observations

### Orphan / under-wired systems
- `send-whatsapp` edge fn — built, not invoked from any notification path.
- `inventory_events` stream — no documented consumer.
- `analytics_rejections` — written by ingestion, no dashboard surfaces it.
- `checkout_optimization_baselines` — schema and RLS exist; surfaced only in
  super-admin tooling, no vendor-facing loop.

### Missing operational bridges
- **Order delivered+paid → invoice issued**: manual only (by design, but no
  backlog metric).
- **Invoice paid → loyalty points**: loyalty earns on order delivery, not on
  invoice payment — possible double-trigger if both paths ever automate.
- **Subscription expired → tenant downgrade**: no enforcement job.
- **Buyer payment proof uploaded → admin review queue**: no surfaced queue, just
  a column on `orders`.
- **WooCommerce status change (outbound)**: inbound-only sync.

### Unclear ownership boundaries
- **Payment truth**: `orders.payment_status` vs `invoices.status` vs
  `payments` rows — three places, app code keeps them in sync, no DB invariant.
- **Stock truth**: `products.stock` vs `inventory_levels` vs movement totals.
- **Loyalty balance**: per-vendor transactions vs cross-vendor profile scalar.
- **Notification authorship**: RLS implies admin-only emission, but the product
  expects system-emitted buyer notifications — currently works because admin
  context is used server-side.

### Invariants currently enforced
- Tenant admin invariant (CI test, Phase 1).
- Invoice numbering monotonicity per (company, year) via `invoice_sequences`.
- Order/product company match on `order_items` INSERT (RLS).
- Self company_id change prevented on `profiles` (trigger).
- Storage folder scoping to `current_company_id` (most buckets — invoice
  bucket has a known gap flagged in current security scan).

### Invariants NOT enforced (relied on by app code)
- `profiles.loyalty_points` = SUM(`loyalty_transactions.points`) per user.
- `orders.payment_status='paid'` ⇔ exists `payments` row covering total.
- `inventory_levels.quantity_available` = on_hand − reserved.
- Vendor tenant always has ≥1 active warehouse.
- Every delivered+paid order eventually has an invoice (no SLA).
