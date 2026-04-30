CREATE TABLE IF NOT EXISTS public.checkout_optimization_baselines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id uuid,
  label text NOT NULL,
  recommendation_id text NOT NULL,
  views integer NOT NULL DEFAULT 0,
  add_to_cart integer NOT NULL DEFAULT 0,
  checkout_view integer NOT NULL DEFAULT 0,
  completed integer NOT NULL DEFAULT 0,
  cart_rate numeric NOT NULL DEFAULT 0,
  abandonment_rate numeric NOT NULL DEFAULT 0,
  conversion_rate numeric NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.checkout_optimization_baselines ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Super admins manage baselines"
ON public.checkout_optimization_baselines
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Vendor admins read own baselines"
ON public.checkout_optimization_baselines
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (vendor_id IS NOT NULL AND vendor_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Vendor admins insert own baselines"
ON public.checkout_optimization_baselines
FOR INSERT
TO authenticated
WITH CHECK (
  is_super_admin(auth.uid())
  OR (vendor_id IS NOT NULL AND vendor_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

-- Capture the BEFORE snapshot for the current abandonment-driven optimization.
INSERT INTO public.checkout_optimization_baselines
(vendor_id, label, recommendation_id, views, add_to_cart, checkout_view, completed,
 cart_rate, abandonment_rate, conversion_rate, notes)
SELECT
  NULL,
  'before_streamlined_checkout',
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
  'Baseline snapshot before streamlined-checkout optimization (inputMode tel, payment-select tracking, validation tracking, field-focus tracking)'
FROM public.analytics_events
WHERE created_at >= now() - interval '30 days';