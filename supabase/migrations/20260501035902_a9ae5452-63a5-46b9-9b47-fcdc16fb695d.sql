-- 1. Seed default subscription plans (idempotent)
INSERT INTO public.subscription_plans (name, monthly_price, currency, max_products, max_users, max_clients, features, active)
SELECT * FROM (VALUES
  ('Starter', 199::numeric, 'MAD', 50, 2, 100, '{"analytics":"basic","support":"email","custom_domain":false,"api_access":false,"priority_listing":false}'::jsonb, true),
  ('Pro', 599::numeric, 'MAD', 500, 10, 1000, '{"analytics":"advanced","support":"priority","custom_domain":true,"api_access":true,"priority_listing":false}'::jsonb, true),
  ('Enterprise', 1999::numeric, 'MAD', NULL, NULL, NULL, '{"analytics":"enterprise","support":"dedicated","custom_domain":true,"api_access":true,"priority_listing":true,"sla":true}'::jsonb, true)
) AS v(name, monthly_price, currency, max_products, max_users, max_clients, features, active)
WHERE NOT EXISTS (SELECT 1 FROM public.subscription_plans sp WHERE sp.name = v.name);

-- 2. Subscription invoices history (separate from product invoices)
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  subscription_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  plan_name text NOT NULL,
  amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'MAD',
  period_start timestamptz NOT NULL DEFAULT now(),
  period_end timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'paid' CHECK (status IN ('paid','pending','failed','refunded','simulated')),
  payment_method text NOT NULL DEFAULT 'simulated',
  payment_reference text,
  paid_at timestamptz DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sub_invoices_company ON public.subscription_invoices(company_id, created_at DESC);

ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "View own subscription invoices" ON public.subscription_invoices;
CREATE POLICY "View own subscription invoices"
ON public.subscription_invoices FOR SELECT
TO authenticated
USING (is_super_admin(auth.uid()) OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Company admins create subscription invoices" ON public.subscription_invoices;
CREATE POLICY "Company admins create subscription invoices"
ON public.subscription_invoices FOR INSERT
TO authenticated
WITH CHECK (is_super_admin(auth.uid()) OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role)));

DROP POLICY IF EXISTS "Super admins manage subscription invoices" ON public.subscription_invoices;
CREATE POLICY "Super admins manage subscription invoices"
ON public.subscription_invoices FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- 3. RPC: simulate payment & activate subscription atomically
CREATE OR REPLACE FUNCTION public.simulate_subscription_payment(
  p_plan_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid := current_company_id();
  v_user_id uuid := auth.uid();
  v_plan record;
  v_sub_id uuid;
  v_invoice_id uuid;
  v_period_end timestamptz := now() + interval '30 days';
BEGIN
  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'No company context';
  END IF;

  IF NOT has_role(v_user_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only company admins can change subscription';
  END IF;

  SELECT * INTO v_plan FROM public.subscription_plans WHERE id = p_plan_id AND active = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Plan not found or inactive';
  END IF;

  -- Upsert subscription: update existing or create new
  UPDATE public.company_subscriptions
  SET plan_id = p_plan_id,
      status = 'active'::subscription_status,
      started_at = now(),
      expires_at = v_period_end,
      trial_ends_at = NULL,
      updated_at = now()
  WHERE company_id = v_company_id
  RETURNING id INTO v_sub_id;

  IF v_sub_id IS NULL THEN
    INSERT INTO public.company_subscriptions (company_id, plan_id, status, started_at, expires_at)
    VALUES (v_company_id, p_plan_id, 'active'::subscription_status, now(), v_period_end)
    RETURNING id INTO v_sub_id;
  END IF;

  -- Create simulated invoice
  INSERT INTO public.subscription_invoices (
    company_id, subscription_id, plan_id, plan_name,
    amount, currency, period_start, period_end,
    status, payment_method, payment_reference, paid_at
  ) VALUES (
    v_company_id, v_sub_id, p_plan_id, v_plan.name,
    v_plan.monthly_price, v_plan.currency, now(), v_period_end,
    'simulated', 'simulated', 'SIM-' || substr(gen_random_uuid()::text, 1, 8), now()
  )
  RETURNING id INTO v_invoice_id;

  RETURN jsonb_build_object(
    'subscription_id', v_sub_id,
    'invoice_id', v_invoice_id,
    'plan_name', v_plan.name,
    'amount', v_plan.monthly_price,
    'expires_at', v_period_end
  );
END;
$$;

REVOKE ALL ON FUNCTION public.simulate_subscription_payment(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.simulate_subscription_payment(uuid) TO authenticated;

-- 4. Track subscription events in analytics whitelist
ALTER TABLE public.analytics_events DROP CONSTRAINT IF EXISTS analytics_events_event_name_check;
ALTER TABLE public.analytics_events ADD CONSTRAINT analytics_events_event_name_check
CHECK (event_name = ANY (ARRAY[
  'product_view','add_to_cart','buy_now','whatsapp_click','checkout_view','checkout_completed',
  'checkout_whatsapp_fallback','checkout_field_focus','checkout_payment_selected','checkout_validation_failed',
  'time_on_product','scroll_depth_25','scroll_depth_50','scroll_depth_75','scroll_depth_100',
  'exit_before_add_to_cart','ab_assignment','client_dashboard_view','reorder_click','recommendation_click',
  'quick_action_click','landing_view','landing_cta_click','landing_category_click','landing_vendor_click',
  'landing_nav_click','signup_view','signup_started','signup_completed','signup_failed','vendor_onboarded',
  'vendors_directory_view','vendor_store_view',
  'pricing_view','pricing_plan_click','subscription_simulated','subscription_upgraded','billing_view'
]));