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
-- Orders without items
-- =====================================================

SELECT
  o.id AS order_id,
  o.company_id
FROM public.orders o
LEFT JOIN public.order_items oi
  ON oi.order_id = o.id
WHERE oi.id IS NULL;

-- =====================================================
-- BILLING
-- =====================================================

-- Payments without linked orders

SELECT
  p.id AS payment_id,
  p.order_id,
  p.amount,
  p.status
FROM public.payments p
LEFT JOIN public.orders o
  ON o.id = p.order_id
WHERE o.id IS NULL;

-- =====================================================
-- PRODUCTS
-- =====================================================

-- Products missing price

SELECT
  id,
  name
FROM public.products
WHERE price IS NULL
   OR price <= 0;

-- =====================================================
-- LOYALTY
-- =====================================================

-- Loyalty transactions without valid profile

SELECT
  lt.id,
  lt.profile_id
FROM public.loyalty_transactions lt
LEFT JOIN public.profiles p
  ON p.id = lt.profile_id
WHERE p.id IS NULL;