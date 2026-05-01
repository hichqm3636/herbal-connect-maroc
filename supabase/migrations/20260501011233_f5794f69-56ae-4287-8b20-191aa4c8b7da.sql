-- Extend analytics_events allowlist to include client dashboard events.
-- Drop existing CHECK constraint(s) on event_name, then add a new unified one.

DO $$
DECLARE
  c record;
BEGIN
  FOR c IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.analytics_events'::regclass
      AND contype = 'c'
      AND pg_get_constraintdef(oid) ILIKE '%event_name%'
  LOOP
    EXECUTE format('ALTER TABLE public.analytics_events DROP CONSTRAINT %I', c.conname);
  END LOOP;
END$$;

ALTER TABLE public.analytics_events
ADD CONSTRAINT analytics_events_event_name_check
CHECK (event_name IN (
  'product_view',
  'add_to_cart',
  'buy_now',
  'whatsapp_click',
  'checkout_view',
  'checkout_completed',
  'checkout_whatsapp_fallback',
  'checkout_field_focus',
  'checkout_payment_selected',
  'checkout_validation_failed',
  'time_on_product',
  'scroll_depth_25',
  'scroll_depth_50',
  'scroll_depth_75',
  'scroll_depth_100',
  'exit_before_add_to_cart',
  'ab_assignment',
  'client_dashboard_view',
  'reorder_click',
  'recommendation_click',
  'quick_action_click'
));

-- Update the INSERT RLS policy to match the new allowlist
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

CREATE POLICY "Anyone can insert analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (event_name IN (
  'product_view',
  'add_to_cart',
  'buy_now',
  'whatsapp_click',
  'checkout_view',
  'checkout_completed',
  'checkout_whatsapp_fallback',
  'checkout_field_focus',
  'checkout_payment_selected',
  'checkout_validation_failed',
  'time_on_product',
  'scroll_depth_25',
  'scroll_depth_50',
  'scroll_depth_75',
  'scroll_depth_100',
  'exit_before_add_to_cart',
  'ab_assignment',
  'client_dashboard_view',
  'reorder_click',
  'recommendation_click',
  'quick_action_click'
));