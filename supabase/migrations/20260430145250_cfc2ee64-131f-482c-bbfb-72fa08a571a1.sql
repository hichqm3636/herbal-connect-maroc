-- Validation RPCs for analytics data quality
CREATE OR REPLACE FUNCTION public.analytics_recent_events(p_limit int DEFAULT 50)
RETURNS TABLE (
  id uuid,
  event_name text,
  product_id uuid,
  vendor_id uuid,
  user_id uuid,
  price numeric,
  metadata jsonb,
  created_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, event_name, product_id, vendor_id, user_id, price, metadata, created_at
  FROM public.analytics_events
  WHERE public.is_super_admin(auth.uid())
  ORDER BY created_at DESC
  LIMIT GREATEST(p_limit, 1);
$$;

-- Integrity report: counts per event, missing product/vendor, dup signature counts
CREATE OR REPLACE FUNCTION public.analytics_integrity_report()
RETURNS TABLE (
  event_name text,
  total bigint,
  missing_product bigint,
  missing_vendor bigint,
  duplicate_groups bigint,
  duplicate_events bigint
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH base AS (
    SELECT * FROM public.analytics_events
    WHERE public.is_super_admin(auth.uid())
  ),
  dups AS (
    SELECT event_name,
           COALESCE(product_id::text,'') AS pid,
           COALESCE(user_id::text,'') AS uid,
           date_trunc('second', created_at) AS sec,
           COUNT(*) AS c
    FROM base
    GROUP BY 1,2,3,4
    HAVING COUNT(*) > 1
  )
  SELECT b.event_name,
         COUNT(*)::bigint AS total,
         COUNT(*) FILTER (WHERE b.product_id IS NULL)::bigint AS missing_product,
         COUNT(*) FILTER (WHERE b.vendor_id IS NULL)::bigint AS missing_vendor,
         COALESCE((SELECT COUNT(*) FROM dups d WHERE d.event_name = b.event_name),0)::bigint AS duplicate_groups,
         COALESCE((SELECT SUM(d.c) FROM dups d WHERE d.event_name = b.event_name),0)::bigint AS duplicate_events
  FROM base b
  GROUP BY b.event_name
  ORDER BY total DESC;
$$;

-- Compare orders vs checkout_completed events over a time window (default 30 days)
CREATE OR REPLACE FUNCTION public.analytics_orders_vs_events(p_days int DEFAULT 30)
RETURNS TABLE (
  orders_count bigint,
  checkout_completed_events bigint,
  diff bigint,
  product_views bigint,
  real_conversion_pct numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH window_start AS (
    SELECT (now() - (GREATEST(p_days,1) || ' days')::interval) AS ts
  ),
  o AS (
    SELECT COUNT(*)::bigint AS c
    FROM public.orders, window_start ws
    WHERE created_at >= ws.ts
      AND (public.is_super_admin(auth.uid()) OR company_id = public.current_company_id())
  ),
  cc AS (
    SELECT COUNT(*)::bigint AS c
    FROM public.analytics_events, window_start ws
    WHERE event_name = 'checkout_completed'
      AND created_at >= ws.ts
      AND (public.is_super_admin(auth.uid())
           OR (vendor_id IS NOT NULL AND vendor_id = public.current_company_id()))
  ),
  pv AS (
    SELECT COUNT(*)::bigint AS c
    FROM public.analytics_events, window_start ws
    WHERE event_name = 'product_view'
      AND created_at >= ws.ts
      AND (public.is_super_admin(auth.uid())
           OR (vendor_id IS NOT NULL AND vendor_id = public.current_company_id()))
  )
  SELECT
    o.c AS orders_count,
    cc.c AS checkout_completed_events,
    (cc.c - o.c) AS diff,
    pv.c AS product_views,
    CASE WHEN pv.c > 0 THEN ROUND((o.c::numeric / pv.c::numeric) * 100, 2) ELSE 0 END AS real_conversion_pct
  FROM o, cc, pv;
$$;

GRANT EXECUTE ON FUNCTION public.analytics_recent_events(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_integrity_report() TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_orders_vs_events(int) TO authenticated;