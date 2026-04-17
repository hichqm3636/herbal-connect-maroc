-- Trigger function: keep profiles.monthly_sales in sync with orders.total_mad
CREATE OR REPLACE FUNCTION public.update_monthly_sales_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta numeric := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    UPDATE public.profiles
    SET monthly_sales = monthly_sales + COALESCE(NEW.total_mad, 0)
    WHERE id = NEW.distributor_id;
  ELSIF TG_OP = 'UPDATE' THEN
    delta := COALESCE(NEW.total_mad, 0) - COALESCE(OLD.total_mad, 0);
    IF delta <> 0 THEN
      UPDATE public.profiles
      SET monthly_sales = monthly_sales + delta
      WHERE id = NEW.distributor_id;
    END IF;
  ELSIF TG_OP = 'DELETE' THEN
    UPDATE public.profiles
    SET monthly_sales = GREATEST(0, monthly_sales - COALESCE(OLD.total_mad, 0))
    WHERE id = OLD.distributor_id;
    RETURN OLD;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_monthly_sales_insert ON public.orders;
CREATE TRIGGER trg_monthly_sales_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_monthly_sales_on_order();

DROP TRIGGER IF EXISTS trg_monthly_sales_update ON public.orders;
CREATE TRIGGER trg_monthly_sales_update
AFTER UPDATE OF total_mad ON public.orders
FOR EACH ROW
WHEN (OLD.total_mad IS DISTINCT FROM NEW.total_mad)
EXECUTE FUNCTION public.update_monthly_sales_on_order();

DROP TRIGGER IF EXISTS trg_monthly_sales_delete ON public.orders;
CREATE TRIGGER trg_monthly_sales_delete
AFTER DELETE ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.update_monthly_sales_on_order();

-- Enable pg_cron for the monthly reset
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Reset function callable by cron
CREATE OR REPLACE FUNCTION public.reset_monthly_sales()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.profiles SET monthly_sales = 0 WHERE monthly_sales <> 0;
$$;

-- Unschedule any prior version, then schedule for the 1st of every month at 00:00 UTC
DO $$
BEGIN
  PERFORM cron.unschedule('reset-monthly-sales');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'reset-monthly-sales',
  '0 0 1 * *',
  $$ SELECT public.reset_monthly_sales(); $$
);