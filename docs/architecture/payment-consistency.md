# Payment Consistency Model (P0)

> Authoritative model for payment / invoice / order paid-state synchronization.
> Established by the P0 consistency sprint (2026-05-17) after the operational
> audit found split-brain between `orders.payment_status`, `invoices.status`,
> and `payments`.

## Truth model

| Layer | Role | Mutability |
|---|---|---|
| `payments` | **Event source of truth.** Each row = a real money event. | Append (insert/delete). Updates allowed only on amount/paid_at. |
| `invoices.status` / `invoices.paid_at` / `invoices.payment_method` | **Derived sync state.** | Maintained by trigger. App code should not flip directly. |
| `orders.payment_status` / `orders.payment_paid_at` | **Derived sync state for fulfillment UI.** | Maintained by trigger (forward direction). App may still flip for orders without an invoice. |

Rule of thumb: **if the money happened, write a `payments` row**. Everything
else syncs from that.

## Synchronization bridge

```text
          insert into payments
                  │
                  ▼
   ┌───────────────────────────────┐
   │ trg_sync_invoice_payment_state│  (AFTER INSERT/UPDATE/DELETE on payments)
   └───────────────────────────────┘
                  │
        SUM(payments.amount) per invoice
                  │
       ┌──────────┴──────────┐
       ▼                     ▼
   if sum >= total       if sum < total
       │                     │
       ▼                     ▼
   invoice.status='paid'  invoice.status='issued'
   invoice.paid_at = MIN  invoice.paid_at = NULL
   order.payment_status   (order.payment_status NOT auto-reverted —
        = 'paid'           refunds need explicit reconciliation)
```

### Trigger guarantees
- **Idempotent.** Re-running with the same payment set produces no extra writes.
- **Tenant-safe.** Operates only within the invoice's own `company_id` via the
  invoice→order link. No cross-tenant writes possible.
- **No reverse auto-revert on orders.** If a payment is deleted (refund),
  invoice reverts to `issued` but the order's `payment_status` is left alone —
  fulfillment-side reversal is an explicit operator decision.
- **No infinite loops.** Trigger writes to `invoices`/`orders` only, never
  back to `payments`.

## App-side bridge

`vendor.orders.tsx` → `updatePaymentStatus()` / `confirmTransfer()`:
when an admin marks an order as paid AND an invoice exists for that order,
the UI also inserts a `payments` row covering the remaining balance. The
trigger then aligns invoice + order state.

If no invoice exists yet, only `orders.payment_status` flips. The eventual
manual invoice issuance + a recorded payment will reconcile state.

## What is no longer split

| Before | After |
|---|---|
| Order paid, invoice still `issued`, no `payments` row | All three aligned through the `payments` row + trigger |
| `RecordPaymentDialog` updated invoice but not the order | Trigger updates the order automatically |
| Refund deleted `payments` row without re-opening invoice | Invoice reverts to `issued` automatically |

## Out of scope (deliberate)

- No state-machine enforcement on `orders.status`.
- No partial-payment UI.
- No refund workflow at the order/fulfillment level.
- No automated dunning or reminders.
- RLS unchanged.
