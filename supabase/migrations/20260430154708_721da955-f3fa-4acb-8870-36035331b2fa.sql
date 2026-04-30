-- 1) Create matching orders for the 3 simulated completions
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
         'Simulated post-optimization order #' || n
  FROM base b, generate_series(1,3) n
  RETURNING id, company_id
)
INSERT INTO public.order_items (order_id, product_id, quantity, unit_price_mad)
SELECT o.id, b.product_id, 1, b.price
FROM new_orders o, base b;

-- 2) Save the AFTER snapshot from sim events only
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
  'AFTER snapshot from sim cohort (after_v1) — streamlined checkout active'
FROM public.analytics_events
WHERE metadata->>'sim' = 'after_v1';