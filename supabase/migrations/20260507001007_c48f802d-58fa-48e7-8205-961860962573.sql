
-- ============================================
-- Materialized Views for Multi-Tenant Reports
-- ============================================

-- 1) Revenue per company (last 30 days)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_company_revenue_30d AS
SELECT
  company_id,
  COUNT(*)::int                                   AS orders_count,
  COUNT(DISTINCT buyer_id)::int                   AS unique_buyers,
  COALESCE(SUM(total_mad), 0)::numeric            AS revenue_mad,
  COALESCE(AVG(total_mad), 0)::numeric            AS avg_order_value,
  MAX(created_at)                                 AS last_order_at
FROM public.orders
WHERE created_at >= now() - interval '30 days'
  AND status <> 'cancelled'
GROUP BY company_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_company_revenue_30d_pk
  ON public.mv_company_revenue_30d (company_id);

-- 2) Top products per company (last 30 days)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_company_top_products_30d AS
SELECT
  o.company_id,
  oi.product_id,
  SUM(oi.quantity)::int                                  AS units_sold,
  SUM(oi.quantity * oi.unit_price_mad)::numeric          AS revenue_mad,
  COUNT(DISTINCT o.id)::int                              AS orders_count
FROM public.order_items oi
JOIN public.orders o ON o.id = oi.order_id
WHERE o.created_at >= now() - interval '30 days'
  AND o.status <> 'cancelled'
GROUP BY o.company_id, oi.product_id;

CREATE UNIQUE INDEX IF NOT EXISTS mv_company_top_products_30d_pk
  ON public.mv_company_top_products_30d (company_id, product_id);

CREATE INDEX IF NOT EXISTS mv_company_top_products_30d_revenue
  ON public.mv_company_top_products_30d (company_id, revenue_mad DESC);

-- 3) Daily sales per company (last 90 days)
CREATE MATERIALIZED VIEW IF NOT EXISTS public.mv_company_daily_sales AS
SELECT
  company_id,
  date_trunc('day', created_at)::date     AS day,
  COUNT(*)::int                           AS orders_count,
  COALESCE(SUM(total_mad), 0)::numeric    AS revenue_mad
FROM public.orders
WHERE created_at >= now() - interval '90 days'
  AND status <> 'cancelled'
GROUP BY company_id, date_trunc('day', created_at)::date;

CREATE UNIQUE INDEX IF NOT EXISTS mv_company_daily_sales_pk
  ON public.mv_company_daily_sales (company_id, day);

-- ============================================
-- Refresh function (used by pg_cron)
-- ============================================
CREATE OR REPLACE FUNCTION public.refresh_reporting_views()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_revenue_30d;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_top_products_30d;
  REFRESH MATERIALIZED VIEW CONCURRENTLY public.mv_company_daily_sales;
END;
$$;

-- ============================================
-- Tenant-safe accessor functions
-- (MVs don't support RLS, so we expose via SECURITY DEFINER functions
--  that filter by current_company_id())
-- ============================================
CREATE OR REPLACE FUNCTION public.get_company_revenue_30d()
RETURNS TABLE (
  orders_count int,
  unique_buyers int,
  revenue_mad numeric,
  avg_order_value numeric,
  last_order_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT orders_count, unique_buyers, revenue_mad, avg_order_value, last_order_at
  FROM public.mv_company_revenue_30d
  WHERE company_id = current_company_id()
     OR is_super_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.get_company_top_products_30d(_limit int DEFAULT 10)
RETURNS TABLE (
  product_id uuid,
  units_sold int,
  revenue_mad numeric,
  orders_count int
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT product_id, units_sold, revenue_mad, orders_count
  FROM public.mv_company_top_products_30d
  WHERE company_id = current_company_id()
     OR is_super_admin(auth.uid())
  ORDER BY revenue_mad DESC
  LIMIT GREATEST(COALESCE(_limit, 10), 1);
$$;

CREATE OR REPLACE FUNCTION public.get_company_daily_sales(_days int DEFAULT 30)
RETURNS TABLE (
  day date,
  orders_count int,
  revenue_mad numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT day, orders_count, revenue_mad
  FROM public.mv_company_daily_sales
  WHERE (company_id = current_company_id() OR is_super_admin(auth.uid()))
    AND day >= (now() - make_interval(days => GREATEST(COALESCE(_days, 30), 1)))::date
  ORDER BY day;
$$;

-- Permissions
REVOKE ALL ON public.mv_company_revenue_30d FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mv_company_top_products_30d FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mv_company_daily_sales FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_company_revenue_30d() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_top_products_30d(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_daily_sales(int) TO authenticated;

-- ============================================
-- Schedule hourly refresh via pg_cron
-- ============================================
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  PERFORM cron.unschedule('refresh-reporting-views');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'refresh-reporting-views',
  '7 * * * *', -- every hour at :07
  $$ SELECT public.refresh_reporting_views(); $$
);
