# Nexora — Operational Audit Log

> **Scope:** End-to-end commerce lifecycle (Order → Payment → Invoice →
> Inventory → Loyalty).
> **Mode:** Observation only. No fixes applied.
> **Audit date:** 2026-05-17
> **Trace subject:** Order `NX-20260517-350S` — the only delivered+paid order
> in the database; representative of the full happy path.

---

## 0. Dataset snapshot

| Metric | Value |
|---|---|
| Total orders | 3 |
| Real orders (non-`tt_`) | 1 |
| Orphan test orders still present (`tt_*`) | 2 |
| Delivered + paid | 1 |
| Delivered+paid without invoice | 0 |
| Total invoices | 1 |
| Invoices with PDF | 1 |
| Invoices emailed (`email_sent_at`) | 0 |
| Loyalty balance drift (profiles vs tx sum) | 0 users |

Subject order timeline (UTC):
```
22:37:19  order created (status=pending, payment=pending)
22:40:32  → confirmed
22:40:40  → preparing
22:40:41  → shipped
22:40:42  → delivered  + payment_status=paid (payment_paid_at set)
22:??:??  invoice INV-2026-00001 issued (manual)
22:??:??  PDF generated and uploaded to storage
```
All four status transitions happened within **10 seconds** — admin click-through,
not a real fulfillment cadence.

---

## 1. Step-by-step audit

### Step 1 — Buyer creates order

| Field | Observation |
|---|---|
| **Expected** | `orders` row inserted with status/payment=pending; `order_items` mirror cart; `order_number` auto-assigned. |
| **Actual** | ✅ Row created (`NX-20260517-350S`, total 2435 MAD). |
| **Side-effects observed** | `notifications` rows for `order_created` to vendor admin. |
| **Side-effects expected but missing** | None for this step. |
| **Tenant correctness** | ✅ `company_id` set; RLS `order_items_company_match` enforced. |
| **Anomaly** | **Duplicate `order_created` notification** — two identical rows at the same microsecond (`22:37:19.567045`) to the same recipient `f264b644...`. Suggests the order-creation path fires the notification insert twice (likely both client-side and a trigger, or a double-mount). Both were read together at `22:41:02.821`. |

### Step 2 — Vendor receives notification

| Field | Observation |
|---|---|
| **Expected** | One `notifications.kind='order_created'` row to each vendor admin, deep-link to `/vendor/orders?focus=…`. |
| **Actual** | ✅ Link format correct; read_at populated on bell click. |
| **UX friction** | Bell shows `2` unread for a single order — buyer-perceived noise on the vendor side. |
| **Trust issue** | Duplicate notifications erode trust in the count badge. |

### Step 3 — Status transitions (pending → delivered)

| Field | Observation |
|---|---|
| **Expected** | Each transition: `orders.status` UPDATE + `activity_logs` audit row + buyer notification. |
| **Actual — notifications** | ✅ 4 buyer notifications (`confirmed`, `preparing`, `shipped`, `delivered`), correctly linked to `/orders?focus=…`. |
| **Actual — activity_logs** | ❌ **0 rows** for `entity_id = order_id`. Status transitions are NOT being logged in `activity_logs` despite the table existing for exactly this purpose. |
| **Timing** | All 4 transitions in 10 seconds — no DB-level guard against impossible velocity. |
| **State machine** | No enforcement — `delivered → pending` would succeed if attempted. |

### Step 4 — Payment confirmed

| Field | Observation |
|---|---|
| **Expected** | Admin records payment → `payments` INSERT → `invoices.paid_at` + `invoices.status='paid'` + `orders.payment_status='paid'` + `orders.payment_paid_at`. |
| **Actual** | ⚠️ **Partial.** `orders.payment_status='paid'` and `orders.payment_paid_at` set. But: |
| Missing | ❌ **Zero `payments` rows for this invoice.** |
| Missing | ❌ `invoices.paid_at` is **NULL**. |
| Missing | ❌ `invoices.status` is still `issued`, not `paid`. |
| **Root cause (observed)** | The order was marked paid via `vendor.orders` status-row update path, NOT via `RecordPaymentDialog`. The order-side payment toggle does not insert into `payments` or sync `invoices`. |
| **Severity** | **Consistency issue — split brain between `orders.payment_status` and `invoices.status`.** Audit and reporting will disagree depending on which table is queried. |

### Step 5 — Invoice issued

| Field | Observation |
|---|---|
| **Expected** | Admin clicks "إصدار فاتورة" → `invoices` INSERT (blank number) → trigger `trg_assign_invoice_number` assigns `INV-2026-00001` → trigger `on_invoice_issued` fires pg_net to PDF fn. |
| **Actual** | ✅ Invoice created. Number assigned correctly. `subtotal=2029.17`, `vat=405.83`, `total=2435.00` (VAT-inclusive split from 20%). Arithmetic verified. |
| **Bridge correctness** | ✅ `invoice_sequences` advanced. |
| **Gap** | Manual issuance only — confirmed by design (Phase prior). No backlog UI surfaces delivered+paid orders without invoices (but here there are none, so untestable in current data). |

### Step 6 — Invoice PDF generated

| Field | Observation |
|---|---|
| **Expected** | Edge fn `generate-invoice-pdf` writes to `invoices/{company}/{year}/{number}.pdf` and sets `invoices.pdf_path`. |
| **Actual** | ✅ `pdf_path = 311d71a7-…/2026/INV-2026-00001.pdf` populated. PDF exists in private bucket. |
| **Email step** | ❌ `email_sent_at` is **NULL**. Expected (Resend/FROM_EMAIL secrets not configured → graceful no-op per `send-invoice-email`), but the buyer never receives the invoice — silent operational gap. |
| **Trust issue** | Vendor UI may show "invoice issued" with no signal that email was skipped. |

### Step 7 — Inventory updated

| Field | Observation |
|---|---|
| **Expected** | On order confirmation (or shipment), `inventory_movements` INSERT + `inventory_levels.quantity_on_hand` decrement for each line item. |
| **Actual** | ❌ **Zero `inventory_movements` rows** with `reference_id = order.id`. |
| **Severity** | **Lifecycle gap.** Stock was not decremented for a delivered order. `products.stock` (the legacy column) and `inventory_levels` are now out of sync with reality. Storefront will display incorrect availability. |
| **Cross-check** | This confirms the "three sources of truth" hazard documented in `business-lifecycles.md` §4 — and here, **none** of the three were updated. |

### Step 8 — Loyalty points granted

| Field | Observation |
|---|---|
| **Expected** | On delivery, `loyalty_transactions` INSERT (`type='earn'`, points from `products.points_per_unit × qty`) + `profiles.loyalty_points` increment. |
| **Actual** | ❌ **Zero `loyalty_transactions` rows** for this order. `profiles.loyalty_points` unchanged. |
| **Severity** | **Lifecycle gap.** Loyalty accrual not wired to the delivery transition. (No drift detected globally only because no transactions exist anywhere yet — vacuous truth.) |

---

## 2. Findings by category

### A. Lifecycle gaps (missing automated steps)
1. **Order delivered → inventory movement**: not emitted. Stock untouched.
2. **Order delivered → loyalty accrual**: not emitted. Points never granted.
3. **Order payment_status=paid → `payments` row**: not created when the toggle
   is on the order, only when `RecordPaymentDialog` is used.
4. **Order payment_status=paid → invoice payment sync**: `invoices.paid_at` and
   `invoices.status='paid'` never set in the observed path.
5. **Invoice issued → email delivery**: silently skipped (no secrets) with no
   operator-visible indicator.
6. **Order status change → activity_logs**: not written, defeating the audit
   trail the table exists for.

### B. Consistency issues (split-brain)
1. **Payment truth split**: `orders.payment_status='paid'` while
   `invoices.status='issued'` and zero `payments` rows for the same business
   event. Any report joining these will mismatch.
2. **Inventory truth**: `products.stock`, `inventory_levels`, and
   movement-derived totals — all three are stale for the audited order.
3. **Loyalty truth**: `profiles.loyalty_points` is a denormalized scalar
   maintained by app code; no DB trigger enforces equality with
   `SUM(loyalty_transactions.points)`. Currently coherent only because both
   sides are zero.

### C. UX friction
1. **Duplicate vendor "new order" notification** (2 rows, same microsecond).
2. **4 sequential buyer status notifications in 10 seconds** — no debouncing.
   A real fulfillment cycle would space these over days, but the system does
   not coalesce rapid transitions.
3. **No "invoice not yet emailed" indicator** for vendor admins.
4. **No backlog count** of orders awaiting invoice issuance (manual workflow
   needs a visible queue to be operable at scale).

### D. Trust issues
1. **Invoice marked issued but buyer never receives email** — buyer-side
   trust failure on first real flow.
2. **Order shows paid but invoice does not** — buyer viewing their invoice
   list sees `issued`, not `paid`, contradicting their own payment experience.
3. **Stock displayed on storefront is no longer real** — risk of overselling
   once concurrent buyers appear.

### E. Orphan side-effects
1. **`tt_*` test orders still present** (2 rows) — Phase 2 cleanup left
   residue. They have no items, no invoices, no payments, but occupy the
   orders list and the order-number namespace.
2. **`inventory_events` table** — schema exists, no writes observed, no
   consumer wired. Confirms `business-lifecycles.md` §4 orphan call-out.
3. **`send-whatsapp` edge function** — not invoked from any code path during
   the audited lifecycle.
4. **`activity_logs` table** — exists with RLS, but the commerce path does
   not write to it. Only `admin_activity_log` may be receiving entries.

### F. Tenant correctness
✅ No cross-tenant leakage observed in the audited flow. RLS-scoped writes
landed in the correct `company_id`. Storage path under
`311d71a7-…/2026/…pdf` matches the company UUID — folder scoping works for
the invoice that was created. (Note: the storage-policy gap currently flagged
by the security scanner for invoice INSERT/UPDATE is a separate latent issue —
not exercised by this audit because only one company performed the write.)

---

## 3. Severity summary

| # | Finding | Category | Severity |
|---|---|---|---|
| 1 | Inventory not decremented on delivery | Lifecycle gap | **High** |
| 2 | Loyalty points not granted on delivery | Lifecycle gap | **High** |
| 3 | Order-paid does not sync to invoice.paid_at / payments | Consistency | **High** |
| 4 | Status transitions not written to `activity_logs` | Lifecycle gap | Medium |
| 5 | Invoice email silently skipped, no operator indicator | Trust | Medium |
| 6 | Duplicate `order_created` notification | UX / Consistency | Medium |
| 7 | Orphan `tt_*` test orders still in DB | Orphan side-effect | Low |
| 8 | `inventory_events`, `send-whatsapp` unwired | Orphan subsystems | Low |
| 9 | No state-machine enforcement on `orders.status` | Lifecycle gap | Low |
| 10 | No debouncing on rapid status notifications | UX | Low |

---

## 4. Out of scope (observed but not actioned)

- Storage policy folder-check gap on invoice INSERT/UPDATE (currently flagged
  by security scanner) — not exercised by the audited flow.
- `has_role()` ignoring `is_enabled` — orthogonal to commerce lifecycle.
- WooCommerce inbound sync — no inbound events during audit window.
- Subscription billing lifecycle — not part of commerce scope.

---

## 5. Recommended audit reproduction

To re-run this audit on future data:
```sql
-- 1. Order timeline
SELECT order_number, status, payment_status, payment_paid_at, created_at, updated_at
FROM orders WHERE order_number = :order_number;

-- 2. Invoice coherence
SELECT i.invoice_number, i.status, i.paid_at, i.pdf_path IS NOT NULL AS has_pdf,
       i.email_sent_at IS NOT NULL AS emailed
FROM invoices i WHERE i.order_id = :order_id;

-- 3. Payment rows
SELECT * FROM payments WHERE invoice_id = :invoice_id;

-- 4. Inventory movements
SELECT * FROM inventory_movements WHERE reference_id = :order_id;

-- 5. Loyalty transactions
SELECT * FROM loyalty_transactions WHERE order_id = :order_id;

-- 6. Notifications
SELECT kind, title, recipient_id, read_at, created_at
FROM notifications WHERE link LIKE '%' || :order_id || '%' ORDER BY created_at;

-- 7. Activity logs
SELECT action, field_name, old_value, new_value, created_at
FROM activity_logs WHERE entity_id = :order_id::text ORDER BY created_at;
```
A red flag in any of these queries indicates a regression in the lifecycle
documented here.
