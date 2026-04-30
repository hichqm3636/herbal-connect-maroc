REVOKE EXECUTE ON FUNCTION public.analytics_product_conversion(uuid, int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.analytics_vendor_orders(int) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.analytics_checkout_funnel(uuid, int) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.analytics_product_conversion(uuid, int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_vendor_orders(int) TO authenticated;
GRANT EXECUTE ON FUNCTION public.analytics_checkout_funnel(uuid, int) TO authenticated;