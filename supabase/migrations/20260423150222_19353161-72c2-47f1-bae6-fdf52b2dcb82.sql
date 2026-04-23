
-- Atomic stock adjustment for products.
-- Returns true if the row was updated (sufficient stock for negative deltas),
-- false otherwise. NULL stock is treated as unlimited and always succeeds
-- without changing the value.
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

  -- For decrements, require stock + _delta >= 0 (i.e. enough stock).
  -- For increments (rollback), no guard needed.
  IF _delta < 0 THEN
    UPDATE public.products
    SET stock = stock + _delta,
        updated_at = now()
    WHERE id = _product_id
      AND (stock IS NULL OR stock + _delta >= 0);
  ELSE
    UPDATE public.products
    SET stock = COALESCE(stock, 0) + _delta,
        updated_at = now()
    WHERE id = _product_id
      AND stock IS NOT NULL;  -- don't touch unlimited (NULL) stock
  END IF;

  GET DIAGNOSTICS _updated = ROW_COUNT;

  -- Unlimited stock products: report success without modifying.
  IF _updated = 0 AND _delta < 0 THEN
    -- Could be either insufficient stock OR unlimited. Check which:
    IF EXISTS (SELECT 1 FROM public.products WHERE id = _product_id AND stock IS NULL) THEN
      RETURN true;
    END IF;
    RETURN false;
  END IF;

  RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.adjust_product_stock(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.adjust_product_stock(uuid, integer) TO authenticated;
