-- Trigger function: credit loyalty points & log a transaction when an order is inserted/updated
CREATE OR REPLACE FUNCTION public.credit_loyalty_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta integer := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    delta := COALESCE(NEW.points_earned, 0);
  ELSIF TG_OP = 'UPDATE' THEN
    delta := COALESCE(NEW.points_earned, 0) - COALESCE(OLD.points_earned, 0);
  END IF;

  IF delta = 0 THEN
    RETURN NEW;
  END IF;

  UPDATE public.profiles
  SET loyalty_points = loyalty_points + delta
  WHERE id = NEW.distributor_id;

  INSERT INTO public.loyalty_transactions (distributor_id, points, reason)
  VALUES (
    NEW.distributor_id,
    delta,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'مكافأة طلب جديد'
      ELSE 'تعديل نقاط طلب'
    END
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_credit_loyalty_on_order_insert ON public.orders;
CREATE TRIGGER trg_credit_loyalty_on_order_insert
AFTER INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.credit_loyalty_on_order();

DROP TRIGGER IF EXISTS trg_credit_loyalty_on_order_update ON public.orders;
CREATE TRIGGER trg_credit_loyalty_on_order_update
AFTER UPDATE OF points_earned ON public.orders
FOR EACH ROW
WHEN (OLD.points_earned IS DISTINCT FROM NEW.points_earned)
EXECUTE FUNCTION public.credit_loyalty_on_order();