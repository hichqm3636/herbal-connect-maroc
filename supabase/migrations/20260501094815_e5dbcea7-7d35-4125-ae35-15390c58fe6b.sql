-- Activate subscription limit enforcement triggers
DROP TRIGGER IF EXISTS enforce_products_limit ON public.products;
CREATE TRIGGER enforce_products_limit
  BEFORE INSERT ON public.products
  FOR EACH ROW
  EXECUTE FUNCTION public.check_products_limit();

DROP TRIGGER IF EXISTS enforce_users_limit ON public.user_roles;
CREATE TRIGGER enforce_users_limit
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.check_users_limit();

-- Apply real plan limits per spec
UPDATE public.subscription_plans
   SET max_products = 30, max_users = 3
 WHERE name ILIKE '%starter%' OR name ILIKE '%free%';

UPDATE public.subscription_plans
   SET max_products = 200, max_users = 10
 WHERE name ILIKE '%business%' OR name ILIKE '%pro%';
-- Enterprise / unlimited stays NULL