CREATE OR REPLACE FUNCTION public.enforce_order_item_product_zone()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dist_territory uuid;
  restriction_count int;
  allowed_count int;
BEGIN
  SELECT p.territory_id
    INTO dist_territory
  FROM public.orders o
  JOIN public.profiles p ON p.id = o.distributor_id
  WHERE o.id = NEW.order_id;

  IF dist_territory IS NULL THEN
    RAISE EXCEPTION 'لا يمكن إنشاء طلب: الموزع غير مُعيَّن لأي منطقة'
      USING ERRCODE = 'check_violation';
  END IF;

  SELECT count(*) INTO restriction_count
  FROM public.product_zones
  WHERE product_id = NEW.product_id;

  IF restriction_count = 0 THEN
    RETURN NEW;
  END IF;

  SELECT count(*) INTO allowed_count
  FROM public.product_zones
  WHERE product_id = NEW.product_id
    AND zone_id = dist_territory;

  IF allowed_count = 0 THEN
    RAISE EXCEPTION 'هذا المنتج غير متاح في منطقة الموزع'
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_product_zone ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_product_zone
BEFORE INSERT OR UPDATE OF product_id, order_id ON public.order_items
FOR EACH ROW
EXECUTE FUNCTION public.enforce_order_item_product_zone();