CREATE OR REPLACE FUNCTION public.credit_loyalty_on_order()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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

  INSERT INTO public.loyalty_transactions (distributor_id, company_id, points, reason)
  VALUES (
    NEW.distributor_id,
    NEW.company_id,
    delta,
    CASE
      WHEN TG_OP = 'INSERT' THEN 'مكافأة طلب جديد'
      ELSE 'تعديل نقاط طلب'
    END
  );

  RETURN NEW;
END;
$function$;