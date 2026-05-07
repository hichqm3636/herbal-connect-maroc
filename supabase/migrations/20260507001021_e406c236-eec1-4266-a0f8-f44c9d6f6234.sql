
REVOKE EXECUTE ON FUNCTION public.get_company_revenue_30d() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_top_products_30d(int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_company_daily_sales(int) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.refresh_reporting_views() FROM PUBLIC, anon, authenticated;
