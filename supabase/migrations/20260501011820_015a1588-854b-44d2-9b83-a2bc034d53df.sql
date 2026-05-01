CREATE OR REPLACE FUNCTION public.analytics_client_growth(_days int DEFAULT 30)
RETURNS TABLE(
  reorder_clicks bigint,
  recommendation_clicks bigint,
  dashboard_views bigint,
  quick_action_clicks bigint,
  orders bigint,
  conversion_rate numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT event_name
    FROM public.analytics_events
    WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
  ),
  agg AS (
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'reorder_click') AS reorder_clicks,
      COUNT(*) FILTER (WHERE event_name = 'recommendation_click') AS recommendation_clicks,
      COUNT(*) FILTER (WHERE event_name = 'client_dashboard_view') AS dashboard_views,
      COUNT(*) FILTER (WHERE event_name = 'quick_action_click') AS quick_action_clicks
    FROM e
  ),
  o AS (
    SELECT COUNT(*) AS orders
    FROM public.orders
    WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
  )
  SELECT
    agg.reorder_clicks,
    agg.recommendation_clicks,
    agg.dashboard_views,
    agg.quick_action_clicks,
    o.orders,
    CASE WHEN agg.dashboard_views = 0 THEN 0
         ELSE ROUND((o.orders::numeric / agg.dashboard_views::numeric) * 100, 2)
    END AS conversion_rate
  FROM agg, o;
$$;

REVOKE ALL ON FUNCTION public.analytics_client_growth(int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.analytics_client_growth(int) TO authenticated;