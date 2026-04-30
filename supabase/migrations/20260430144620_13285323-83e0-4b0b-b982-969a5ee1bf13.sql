DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;
CREATE POLICY "Anyone can insert analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name IN (
    'product_view','add_to_cart','buy_now',
    'checkout_view','checkout_completed','checkout_whatsapp_fallback',
    'whatsapp_click',
    'time_on_product','scroll_depth_25','scroll_depth_50','scroll_depth_75','scroll_depth_100',
    'exit_before_add_to_cart','ab_assignment'
  )
);

CREATE OR REPLACE FUNCTION public.analytics_vendor_product_stats(_vendor_id uuid, _days int DEFAULT 30)
RETURNS TABLE(
  product_id uuid,
  views bigint,
  add_to_cart bigint,
  checkout_started bigint,
  completed bigint,
  exits_before_cart bigint,
  conversion_rate numeric,
  cart_rate numeric
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT * FROM public.analytics_events
    WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
      AND vendor_id = _vendor_id
      AND product_id IS NOT NULL
  )
  SELECT
    product_id,
    COUNT(*) FILTER (WHERE event_name = 'product_view')               AS views,
    COUNT(*) FILTER (WHERE event_name = 'add_to_cart')                AS add_to_cart,
    COUNT(*) FILTER (WHERE event_name = 'checkout_view')              AS checkout_started,
    COUNT(*) FILTER (WHERE event_name = 'checkout_completed')         AS completed,
    COUNT(*) FILTER (WHERE event_name = 'exit_before_add_to_cart')    AS exits_before_cart,
    CASE WHEN COUNT(*) FILTER (WHERE event_name = 'product_view') = 0 THEN 0
         ELSE ROUND(
           (COUNT(*) FILTER (WHERE event_name = 'checkout_completed'))::numeric
           / (COUNT(*) FILTER (WHERE event_name = 'product_view'))::numeric * 100, 2)
    END AS conversion_rate,
    CASE WHEN COUNT(*) FILTER (WHERE event_name = 'product_view') = 0 THEN 0
         ELSE ROUND(
           (COUNT(*) FILTER (WHERE event_name = 'add_to_cart'))::numeric
           / (COUNT(*) FILTER (WHERE event_name = 'product_view'))::numeric * 100, 2)
    END AS cart_rate
  FROM e
  GROUP BY product_id
  ORDER BY views DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.analytics_vendor_product_stats(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analytics_vendor_product_stats(uuid, int) TO authenticated;

CREATE OR REPLACE FUNCTION public.analytics_alerts(_vendor_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE(
  product_id uuid,
  vendor_id uuid,
  views bigint,
  add_to_cart bigint,
  checkout_started bigint,
  completed bigint,
  conversion_rate numeric,
  cart_rate numeric,
  abandonment_rate numeric,
  alert_type text,
  severity text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH e AS (
    SELECT * FROM public.analytics_events
    WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
      AND product_id IS NOT NULL
      AND (_vendor_id IS NULL OR vendor_id = _vendor_id)
  ),
  agg AS (
    SELECT
      product_id,
      (SELECT vendor_id FROM e e2
        WHERE e2.product_id = e.product_id AND e2.vendor_id IS NOT NULL
        LIMIT 1) AS vendor_id,
      COUNT(*) FILTER (WHERE event_name = 'product_view')        AS views,
      COUNT(*) FILTER (WHERE event_name = 'add_to_cart')         AS add_to_cart,
      COUNT(*) FILTER (WHERE event_name = 'checkout_view')       AS checkout_started,
      COUNT(*) FILTER (WHERE event_name = 'checkout_completed')  AS completed
    FROM e
    GROUP BY product_id
  ),
  scored AS (
    SELECT
      product_id, vendor_id, views, add_to_cart, checkout_started, completed,
      CASE WHEN views = 0 THEN 0 ELSE ROUND(completed::numeric / views::numeric * 100, 2) END AS conversion_rate,
      CASE WHEN views = 0 THEN 0 ELSE ROUND(add_to_cart::numeric / views::numeric * 100, 2) END AS cart_rate,
      CASE WHEN checkout_started = 0 THEN 0
           ELSE ROUND((1 - completed::numeric / NULLIF(checkout_started,0)) * 100, 2)
      END AS abandonment_rate
    FROM agg
  )
  SELECT
    product_id, vendor_id, views, add_to_cart, checkout_started, completed,
    conversion_rate, cart_rate, abandonment_rate,
    CASE
      WHEN views >= 20 AND conversion_rate < 1 THEN 'low_conversion'
      WHEN views >= 20 AND cart_rate < 5 THEN 'weak_add_to_cart'
      WHEN checkout_started >= 10 AND abandonment_rate >= 50 THEN 'high_abandonment'
    END AS alert_type,
    CASE
      WHEN views >= 100 AND conversion_rate < 0.5 THEN 'high'
      WHEN checkout_started >= 20 AND abandonment_rate >= 70 THEN 'high'
      ELSE 'medium'
    END AS severity
  FROM scored
  WHERE
    (views >= 20 AND conversion_rate < 1)
    OR (views >= 20 AND cart_rate < 5)
    OR (checkout_started >= 10 AND abandonment_rate >= 50)
  ORDER BY severity DESC, views DESC;
$$;
REVOKE EXECUTE ON FUNCTION public.analytics_alerts(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analytics_alerts(uuid, int) TO authenticated;