
CREATE OR REPLACE FUNCTION public.adjust_product_stock(
  _product_id uuid,
  _delta integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _updated integer;
BEGIN
  IF _delta = 0 THEN
    RETURN true;
  END IF;

  IF _delta < 0 THEN
    UPDATE public.products
    SET stock = stock + _delta,
        updated_at = now()
    WHERE id = _product_id
      AND (stock IS NULL OR stock >= abs(_delta));
  ELSE
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + _delta,
        updated_at = now()
    WHERE id = _product_id
      AND stock IS NOT NULL;
  END IF;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  IF _updated = 0 AND _delta < 0 THEN
    IF EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND stock IS NULL) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;
