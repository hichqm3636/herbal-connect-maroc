-- Analytics events table
CREATE TABLE public.analytics_events (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_name text NOT NULL,
  product_id uuid NULL,
  vendor_id uuid NULL,
  user_id uuid NULL,
  price numeric NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX idx_analytics_events_event_name ON public.analytics_events(event_name);
CREATE INDEX idx_analytics_events_product_id ON public.analytics_events(product_id);
CREATE INDEX idx_analytics_events_vendor_id ON public.analytics_events(vendor_id);
CREATE INDEX idx_analytics_events_created_at ON public.analytics_events(created_at DESC);

ALTER TABLE public.analytics_events ENABLE ROW LEVEL SECURITY;

-- Anyone (anon + authenticated) can insert events; we keep payload narrow & validated
CREATE POLICY "Anyone can insert analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name IN ('product_view','add_to_cart','buy_now','checkout_view','checkout_completed','checkout_whatsapp_fallback','whatsapp_click')
);

-- Super admins read everything; vendor admins read their own company events
CREATE POLICY "Super admins read all analytics"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Vendor admins read own company analytics"
ON public.analytics_events
FOR SELECT
TO authenticated
USING (
  vendor_id IS NOT NULL
  AND vendor_id = public.current_company_id()
  AND public.has_role(auth.uid(), 'admin'::app_role)
);

-- Conversion rate per product (views → completed checkout)
CREATE OR REPLACE FUNCTION public.analytics_product_conversion(_vendor_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS TABLE(product_id uuid, views bigint, add_to_cart bigint, completed bigint, conversion_rate numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT * FROM public.analytics_events
    WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
      AND product_id IS NOT NULL
      AND (_vendor_id IS NULL OR vendor_id = _vendor_id)
  )
  SELECT
    product_id,
    COUNT(*) FILTER (WHERE event_name = 'product_view')         AS views,
    COUNT(*) FILTER (WHERE event_name = 'add_to_cart')          AS add_to_cart,
    COUNT(*) FILTER (WHERE event_name = 'checkout_completed')   AS completed,
    CASE WHEN COUNT(*) FILTER (WHERE event_name = 'product_view') = 0 THEN 0
         ELSE ROUND(
           (COUNT(*) FILTER (WHERE event_name = 'checkout_completed'))::numeric
           / (COUNT(*) FILTER (WHERE event_name = 'product_view'))::numeric * 100, 2)
    END AS conversion_rate
  FROM e
  GROUP BY product_id
  ORDER BY views DESC;
$$;

-- Orders per vendor (from real orders table — analytics-style aggregate)
CREATE OR REPLACE FUNCTION public.analytics_vendor_orders(_days int DEFAULT 30)
RETURNS TABLE(vendor_id uuid, orders_count bigint, revenue_mad numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    company_id AS vendor_id,
    COUNT(*)::bigint AS orders_count,
    COALESCE(SUM(total_mad), 0)::numeric AS revenue_mad
  FROM public.orders
  WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
    AND status <> 'cancelled'
  GROUP BY company_id
  ORDER BY orders_count DESC;
$$;

-- Checkout funnel / drop-off
CREATE OR REPLACE FUNCTION public.analytics_checkout_funnel(_vendor_id uuid DEFAULT NULL, _days int DEFAULT 30)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  WITH e AS (
    SELECT event_name FROM public.analytics_events
    WHERE created_at >= now() - make_interval(days => GREATEST(_days, 1))
      AND (_vendor_id IS NULL OR vendor_id = _vendor_id)
  ),
  c AS (
    SELECT
      COUNT(*) FILTER (WHERE event_name = 'product_view')              AS views,
      COUNT(*) FILTER (WHERE event_name = 'add_to_cart')               AS add_to_cart,
      COUNT(*) FILTER (WHERE event_name = 'checkout_view')             AS checkout_view,
      COUNT(*) FILTER (WHERE event_name = 'checkout_completed')        AS completed,
      COUNT(*) FILTER (WHERE event_name = 'checkout_whatsapp_fallback') AS whatsapp_fallback
    FROM e
  )
  SELECT jsonb_build_object(
    'views', views,
    'add_to_cart', add_to_cart,
    'checkout_view', checkout_view,
    'completed', completed,
    'whatsapp_fallback', whatsapp_fallback,
    'drop_view_to_cart', CASE WHEN views = 0 THEN 0
      ELSE ROUND((1 - add_to_cart::numeric / NULLIF(views,0))*100, 2) END,
    'drop_cart_to_checkout', CASE WHEN add_to_cart = 0 THEN 0
      ELSE ROUND((1 - checkout_view::numeric / NULLIF(add_to_cart,0))*100, 2) END,
    'drop_checkout_to_completed', CASE WHEN checkout_view = 0 THEN 0
      ELSE ROUND((1 - completed::numeric / NULLIF(checkout_view,0))*100, 2) END
  ) FROM c;
$$;