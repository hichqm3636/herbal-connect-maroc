-- Recreate the missing trigger on auth.users for new signups
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Restore other missing triggers referenced by existing functions
DROP TRIGGER IF EXISTS credit_loyalty_on_order_trigger ON public.orders;
CREATE TRIGGER credit_loyalty_on_order_trigger
  AFTER INSERT OR UPDATE OF points_earned ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.credit_loyalty_on_order();

DROP TRIGGER IF EXISTS update_monthly_sales_on_order_trigger ON public.orders;
CREATE TRIGGER update_monthly_sales_on_order_trigger
  AFTER INSERT OR UPDATE OF total_mad OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_monthly_sales_on_order();

DROP TRIGGER IF EXISTS sync_product_primary_image_trigger ON public.product_images;
CREATE TRIGGER sync_product_primary_image_trigger
  AFTER INSERT OR UPDATE OR DELETE ON public.product_images
  FOR EACH ROW EXECUTE FUNCTION public.sync_product_primary_image();

DROP TRIGGER IF EXISTS auto_promote_level_trigger ON public.profiles;
CREATE TRIGGER auto_promote_level_trigger
  BEFORE INSERT OR UPDATE OF loyalty_points ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.auto_promote_level();

DROP TRIGGER IF EXISTS update_orders_updated_at ON public.orders;
CREATE TRIGGER update_orders_updated_at
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_products_updated_at ON public.products;
CREATE TRIGGER update_products_updated_at
  BEFORE UPDATE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

DROP TRIGGER IF EXISTS update_profiles_updated_at ON public.profiles;
CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();