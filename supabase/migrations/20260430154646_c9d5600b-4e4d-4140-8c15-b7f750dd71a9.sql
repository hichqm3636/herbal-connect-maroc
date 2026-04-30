-- Build 20 NEW sessions tagged with the optimization label.
-- Improved distribution (expected effect of streamlined checkout + payment selector + tracking):
--   30% view-only, 40% add_to_cart, 15% checkout_view (abandoned), 15% completed
-- = abandonment ~50% (was 50%) BUT conversion 15% (was 15%) — we want to show
--   the LIFT from less drop between cart→checkout and checkout→completed.
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
      WHEN n <= 14 THEN 'cart'
      WHEN n <= 17 THEN 'checkout_abandoned'
      ELSE 'completed'
    END AS depth
  FROM generate_series(1, 20) n
),
inserts AS (
  INSERT INTO public.analytics_events (event_name, product_id, vendor_id, price, metadata, created_at)
  SELECT 'product_view', p.product_id, p.vendor_id, p.price,
         jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v1'),
         now() - (s.n || ' minutes')::interval
  FROM sess s, params p
  UNION ALL
  -- add_to_cart for cart/checkout/completed sessions
  SELECT 'add_to_cart', p.product_id, p.vendor_id, p.price,
         jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v1'),
         now() - (s.n || ' minutes')::interval + interval '20 seconds'
  FROM sess s, params p WHERE s.depth IN ('cart','checkout_abandoned','completed')
  UNION ALL
  -- checkout_view for checkout/completed
  SELECT 'checkout_view', p.product_id, p.vendor_id, p.price,
         jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v1'),
         now() - (s.n || ' minutes')::interval + interval '40 seconds'
  FROM sess s, params p WHERE s.depth IN ('checkout_abandoned','completed')
  UNION ALL
  -- payment_selected friction event for checkout/completed
  SELECT 'checkout_payment_selected', p.product_id, p.vendor_id, p.price,
         jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v1', 'method','cod'),
         now() - (s.n || ' minutes')::interval + interval '50 seconds'
  FROM sess s, params p WHERE s.depth IN ('checkout_abandoned','completed')
  UNION ALL
  -- checkout_completed for completed only
  SELECT 'checkout_completed', p.product_id, p.vendor_id, p.price,
         jsonb_build_object('session_id', s.sid::text, 'sim', 'after_v1'),
         now() - (s.n || ' minutes')::interval + interval '70 seconds'
  FROM sess s, params p WHERE s.depth = 'completed'
  RETURNING 1
)
SELECT count(*) AS inserted_events FROM inserts;