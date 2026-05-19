-- Restore Drill — Integrity Verification
-- Run this against the RESTORED (isolated) database, NEVER production.
-- Usage: psql <restore-target-conn-string> -f scripts/verify-restore.sql

\echo '=== Nexora Restore Drill — Integrity Checks ==='
\echo ''

\echo '--- 1. Core entity counts ---'
SELECT 'auth.users'         AS table_name, count(*) FROM auth.users
UNION ALL SELECT 'companies',               count(*) FROM public.companies
UNION ALL SELECT 'user_roles',              count(*) FROM public.user_roles
UNION ALL SELECT 'products',                count(*) FROM public.products
UNION ALL SELECT 'orders',                  count(*) FROM public.orders
UNION ALL SELECT 'order_items',             count(*) FROM public.order_items
UNION ALL SELECT 'order_status_transitions',count(*) FROM public.order_status_transitions
UNION ALL SELECT 'invoices',                count(*) FROM public.invoices
UNION ALL SELECT 'invoice_items',           count(*) FROM public.invoice_items
UNION ALL SELECT 'payments',                count(*) FROM public.payments
UNION ALL SELECT 'inventory_levels',        count(*) FROM public.inventory_levels
UNION ALL SELECT 'inventory_movements',     count(*) FROM public.inventory_movements
UNION ALL SELECT 'loyalty_transactions',    count(*) FROM public.loyalty_transactions
UNION ALL SELECT 'notifications',           count(*) FROM public.notifications
UNION ALL SELECT 'client_error_logs',       count(*) FROM public.client_error_logs
ORDER BY table_name;

\echo ''
\echo '--- 2. Payment ↔ Invoice reconciliation ---'
-- Any paid invoice whose payment sum != total_mad is a corruption.
SELECT
  i.id            AS invoice_id,
  i.invoice_number,
  i.total_mad     AS invoice_total,
  COALESCE(SUM(p.amount), 0) AS payment_sum,
  i.status
FROM public.invoices i
LEFT JOIN public.payments p ON p.invoice_id = i.id
WHERE i.status = 'paid'
GROUP BY i.id
HAVING COALESCE(SUM(p.amount), 0) <> i.total_mad
LIMIT 20;

\echo ''
\echo '--- 3. Inventory sanity (no negative availability) ---'
SELECT id, company_id, product_id, quantity_on_hand, quantity_reserved, quantity_available
FROM public.inventory_levels
WHERE quantity_available < 0 OR quantity_on_hand < 0
LIMIT 20;

\echo ''
\echo '--- 4. Loyalty reconciliation (ledger vs profile) ---'
SELECT
  pr.id        AS user_id,
  pr.loyalty_points,
  COALESCE(SUM(lt.points), 0) AS ledger_sum
FROM public.profiles pr
LEFT JOIN public.loyalty_transactions lt ON lt.user_id = pr.id
GROUP BY pr.id, pr.loyalty_points
HAVING pr.loyalty_points <> COALESCE(SUM(lt.points), 0)
LIMIT 20;

\echo ''
\echo '--- 5. Critical triggers present ---'
SELECT tgname
FROM pg_trigger
WHERE NOT tgisinternal
  AND tgname IN (
    'trg_sync_invoice_payment_state',
    'trg_validate_order_status_transition',
    'trg_log_order_status_transition',
    'trg_assign_invoice_number',
    'trg_user_roles_ensure_admin',
    'enforce_notification_dedupe',
    'sync_profile_loyalty_points'
  )
ORDER BY tgname;

\echo ''
\echo '--- 6. Critical functions present ---'
SELECT proname
FROM pg_proc
WHERE pronamespace = 'public'::regnamespace
  AND proname IN (
    'has_role',
    'is_super_admin',
    'current_company_id',
    'public_signup_company'
  )
ORDER BY proname;

\echo ''
\echo '--- 7. Recent orders sample (last 10) ---'
SELECT id, order_number, status, payment_status, total_mad, created_at
FROM public.orders
ORDER BY created_at DESC
LIMIT 10;

\echo ''
\echo '=== Verification complete. Review output before declaring drill SUCCESS. ==='
