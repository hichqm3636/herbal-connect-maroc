
REVOKE EXECUTE ON FUNCTION public.validate_order_status_transition() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.log_order_status_transition() FROM PUBLIC, anon, authenticated;
