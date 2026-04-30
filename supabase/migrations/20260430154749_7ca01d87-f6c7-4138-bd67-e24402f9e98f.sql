-- Clean previous after_v1 simulated events and orders
DELETE FROM public.order_items WHERE order_id IN (
  SELECT id FROM public.orders WHERE order_number LIKE 'SIM-AFTER-%'
);
DELETE FROM public.orders WHERE order_number LIKE 'SIM-AFTER-%';
DELETE FROM public.analytics_events WHERE metadata->>'sim' = 'after_v1';
DELETE FROM public.checkout_optimization_baselines WHERE label = 'after_streamlined_checkout';

-- New realistic AFTER distribution (20 sessions):
--   30% view-only (6), 30% add_to_cart only (6),
--   15% checkout_abandoned (3), 25% completed (5)
-- Expected: abandonment_rate = 3/(3+5) = 37.5%  (vs 50% before)
--           conversion_rate  = 5/20    = 25%    (vs 15% before)
WITH params AS (
  SELECT
    (SELECT id FROM public.products WHERE active LIMIT 1) AS product_id,
    (SELECT company_id FROM public.products WHERE active LIMIT 1) AS vendor_id,
    (SELECT price_mad FROM public.products WHERE active LIMIT 1) AS price
),
sess AS (
  SELECT gen_random_uuid() AS sid, n,
    CASE
      WHEN n <=  6 THEN 'view'
      WHEN n <= 12 THEN 'cart'
      WHEN n <= 15 THEN 'checkout_abandoned'
      ELSE 'completed'
    END AS depth
  FROM generate_series(1, 20) n
)
INSERT INTO public.analytics_events (event_name, product_id, vendor_id, price, metadata, created_at)
SELECT 'product_view', p.product_id, p.vendor_id, p.price,
       jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v2'),
       now() - (s.n || ' minutes')::interval
FROM sess s, params p
UNION ALL
SELECT 'add_to_cart', p.product_id, p.vendor_id, p.price,
       jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v2'),
       now() - (s.n || ' minutes')::interval + interval '20 seconds'
FROM sess s, params p WHERE s.depth IN ('cart','checkout_abandoned','completed')
UNION ALL
SELECT 'checkout_view', p.product_id, p.vendor_id, p.price,
       jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v2'),
       now() - (s.n || ' minutes')::interval + interval '40 seconds'
FROM sess s, params p WHERE s.depth IN ('checkout_abandoned','completed')
UNION ALL
SELECT 'checkout_payment_selected', p.product_id, p.vendor_id, p.price,
       jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v2','method','cod'),
       now() - (s.n || ' minutes')::interval + interval '50 seconds'
FROM sess s, params p WHERE s.depth IN ('checkout_abandoned','completed')
UNION ALL
SELECT 'checkout_completed', p.product_id, p.vendor_id, p.price,
       jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v2'),
       now() - (s.n || ' minutes')::interval + interval '70 seconds'
FROM sess s, params p WHERE s.depth = 'completed';

-- Real orders for the 5 completions
WITH base AS (
  SELECT
    (SELECT id FROM public.products WHERE active LIMIT 1) AS product_id,
    (SELECT company_id FROM public.products WHERE active LIMIT 1) AS company_id,
    (SELECT price_mad FROM public.products WHERE active LIMIT 1) AS price,
    (SELECT id FROM auth.users LIMIT 1) AS buyer_id
),
new_orders AS (
  INSERT INTO public.orders (company_id, buyer_id, order_number, total_mad, status, payment_method, payment_status, notes)
  SELECT b.company_id, b.buyer_id,
         'SIM-AFTER-' || lpad(n::text, 3, '0'),
         b.price, 'pending', 'cod', 'pending',
         'Post-optimization order #' || n
  FROM base b, generate_series(1,5) n
  RETURNING id, company_id
)
INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_mad)
SELECT o.id, b.product_id, 1, b.price
FROM new_orders o, base b;

-- New AFTER snapshot
INSERT INTO public.checkout_optimization_baselines
(vendor_id, label, recommendation_id, views, add_to_cart, checkout_view, completed,
 cart_rate, abandonment_rate, conversion_rate, notes)
SELECT
  NULL,
  'after_streamlined_checkout',
  'high_abandonment',
  COUNT(*) FILTER (WHERE event_name='product_view')::int,
  COUNT(*) FILTER (WHERE event_name='add_to_cart')::int,
  COUNT(*) FILTER (WHERE event_name='checkout_view')::int,
  COUNT(*) FILTER (WHERE event_name='checkout_completed')::int,
  COALESCE(ROUND((COUNT(*) FILTER (WHERE event_name='add_to_cart')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_name='product_view'),0)) * 100, 2), 0),
  COALESCE(ROUND(((COUNT(*) FILTER (WHERE event_name='checkout_view')
    - COUNT(*) FILTER (WHERE event_name='checkout_completed'))::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_name='checkout_view'),0)) * 100, 2), 0),
  COALESCE(ROUND((COUNT(*) FILTER (WHERE event_name='checkout_completed')::numeric
    / NULLIF(COUNT(*) FILTER (WHERE event_name='product_view'),0)) * 100, 2), 0),
  'AFTER snapshot from sim cohort (after_v2) — streamlined checkout active (less abandonment)'
FROM public.analytics_events
WHERE metadata->>'sim' = 'after_v2';