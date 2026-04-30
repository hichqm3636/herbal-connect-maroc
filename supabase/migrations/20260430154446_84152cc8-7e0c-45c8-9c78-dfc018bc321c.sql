DROP POLICY IF EXISTS "Anyone can insert analytics events" ON public.analytics_events;

CREATE POLICY "Anyone can insert analytics events"
ON public.analytics_events
FOR INSERT
TO anon, authenticated
WITH CHECK (
  event_name = ANY (ARRAY[
    'product_view','add_to_cart','buy_now','checkout_view','checkout_completed',
    'checkout_whatsapp_fallback','whatsapp_click','time_on_product',
    'scroll_depth_25','scroll_depth_50','scroll_depth_75','scroll_depth_100',
    'exit_before_add_to_cart','ab_assignment',
    'checkout_field_focus','checkout_payment_selected','checkout_validation_failed'
  ])
);