-- =====================================================
-- CORE HEALTH CHECKS
-- READ ONLY
-- SAFE FOR PRODUCTION INSPECTION
-- =====================================================

-- =====================================================
-- COMMERCE
-- =====================================================

-- Orders marked as paid but missing payment rows

SELECT
  o.id AS order_id,
  o.company_id,
  o.status
FROM public.orders o
LEFT JOIN public.payments p
  ON p.order_id = o.id
WHERE o.status = 'paid'
  AND p.id IS NULL;

-- =====================================================
-- Delivered orders missing invoices
-- =====================================================

SELECT
  o.id AS order_id,
  o.company_id
FROM public.orders o
LEFT JOIN public.invoices i
  ON i.order_id = o.id
WHERE o.status = 'delivered'
  AND i.id IS NULL;

-- =====================================================
-- BILLING
-- =====================================================

-- Invoice totals not matching payment sums

SELECT
  i.id,
  i.total_amount,
  COALESCE(SUM(p.amount), 0) AS paid_amount
FROM public.invoices i
LEFT JOIN public.payments p
  ON p.invoice_id = i.id
GROUP BY i.id, i.total_amount
HAVING COALESCE(SUM(p.amount), 0) <> i.total_amount;

-- =====================================================
-- INVENTORY
-- =====================================================

-- Negative inventory detection

SELECT
  company_id,
  product_id,
  quantity_on_hand
FROM public.inventory_levels
WHERE quantity_on_hand < 0;