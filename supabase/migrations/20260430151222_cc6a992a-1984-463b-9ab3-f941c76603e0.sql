-- Lower the views threshold so realistic per-product traffic (≥10 views)
-- can trigger alerts. Keep low_conversion threshold higher to avoid noise
-- when only a handful of users have seen a product.
CREATE OR REPLACE FUNCTION public.analytics_alerts(_vendor_id uuid DEFAULT NULL::uuid, _days integer DEFAULT 30)
 RETURNS TABLE(product_id uuid, vendor_id uuid, views bigint, add_to_cart bigint, checkout_started bigint, completed bigint, conversion_rate numeric, cart_rate numeric, abandonment_rate numeric, alert_type text, severity text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      WHEN views >= 10 AND cart_rate < 5      THEN 'weak_add_to_cart'
      WHEN checkout_started >= 3 AND abandonment_rate >= 50 THEN 'high_abandonment'
      ELSE NULL
    END AS alert_type,
    CASE
      WHEN (views >= 20 AND conversion_rate < 1)
        OR (checkout_started >= 5 AND abandonment_rate >= 70)
      THEN 'high'
      ELSE 'medium'
    END AS severity
  FROM scored
  WHERE
       (views >= 20 AND conversion_rate < 1)
    OR (views >= 10 AND cart_rate < 5)
    OR (checkout_started >= 3 AND abandonment_rate >= 50)
$function$;