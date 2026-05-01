
-- Replace the whitelist of allowed analytics event names
ALTER TABLE public.analytics_events
  DROP CONSTRAINT IF EXISTS analytics_events_event_name_check;

ALTER TABLE public.analytics_events
  ADD CONSTRAINT analytics_events_event_name_check
  CHECK (event_name = ANY (ARRAY[
    -- existing
    'product_view','add_to_cart','buy_now','whatsapp_click',
    'checkout_view','checkout_completed','checkout_whatsapp_fallback',
    'checkout_field_focus','checkout_payment_selected','checkout_validation_failed',
    'time_on_product','scroll_depth_25','scroll_depth_50','scroll_depth_75','scroll_depth_100',
    'exit_before_add_to_cart','ab_assignment',
    'client_dashboard_view','reorder_click','recommendation_click','quick_action_click',
    -- NEW: landing
    'landing_view','landing_cta_click','landing_category_click',
    'landing_vendor_click','landing_nav_click',
    -- NEW: signup funnel
    'signup_view','signup_started','signup_completed','signup_failed',
    -- NEW: vendor lifecycle
    'vendor_onboarded',
    -- NEW: marketplace browsing
    'vendors_directory_view','vendor_store_view'
  ]));

-- Refresh the matching INSERT policy whitelist
DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

CREATE POLICY "Anyone can insert analytics events"
  ON public.analytics_events
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (event_name = ANY (ARRAY[
    'product_view','add_to_cart','buy_now','whatsapp_click',
    'checkout_view','checkout_completed','checkout_whatsapp_fallback',
    'checkout_field_focus','checkout_payment_selected','checkout_validation_failed',
    'time_on_product','scroll_depth_25','scroll_depth_50','scroll_depth_75','scroll_depth_100',
    'exit_before_add_to_cart','ab_assignment',
    'client_dashboard_view','reorder_click','recommendation_click','quick_action_click',
    'landing_view','landing_cta_click','landing_category_click',
    'landing_vendor_click','landing_nav_click',
    'signup_view','signup_started','signup_completed','signup_failed',
    'vendor_onboarded',
    'vendors_directory_view','vendor_store_view'
  ]));
