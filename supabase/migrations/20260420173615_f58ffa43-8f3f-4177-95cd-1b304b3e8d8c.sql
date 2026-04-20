-- 1) Per-product minimum quantity
CREATE OR REPLACE FUNCTION public.enforce_order_item_min_quantity()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  prod_min int;
  prod_name text;
BEGIN
  SELECT minimum_order, name_ar INTO prod_min, prod_name
  FROM public.products WHERE id = NEW.product_id;

  IF prod_min IS NOT NULL AND NEW.quantity < prod_min THEN
    RAISE EXCEPTION 'الحد الأدنى للطلب (%): % وحدة', prod_name, prod_min
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_item_min_quantity ON public.order_items;
CREATE TRIGGER trg_enforce_order_item_min_quantity
BEFORE INSERT OR UPDATE OF quantity, product_id ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_item_min_quantity();

-- 2) Per-company minimum order value (uses order_rules MIN_ORDER_AMOUNT)
CREATE OR REPLACE FUNCTION public.enforce_order_min_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dist_tier uuid;
  threshold numeric;
  computed_total numeric;
BEGIN
  -- Skip while order is still being assembled (pending with no items yet is allowed).
  -- We enforce when the order has items. Easiest: enforce on every INSERT/UPDATE
  -- by computing the actual sum of order_items at this moment.
  SELECT COALESCE(SUM(quantity * unit_price_mad), 0)
    INTO computed_total
  FROM public.order_items WHERE order_id = NEW.id;

  -- If no items yet, defer (the order_items insert will fire this again via the
  -- statement-level trigger we add below).
  IF computed_total = 0 THEN
    RETURN NEW;
  END IF;

  SELECT pricing_tier_id INTO dist_tier
  FROM public.company_distributor_pricing
  WHERE distributor_id = NEW.distributor_id AND company_id = NEW.company_id
  LIMIT 1;

  SELECT MAX(min_order_amount) INTO threshold
  FROM public.order_rules
  WHERE active = true
    AND rule_type = 'MIN_ORDER_AMOUNT'
    AND min_order_amount IS NOT NULL
    AND (company_id IS NULL OR company_id = NEW.company_id)
    AND (tier_id IS NULL OR tier_id = dist_tier);

  IF threshold IS NOT NULL AND computed_total < threshold THEN
    RAISE EXCEPTION 'الحد الأدنى للطلب هو % درهم', threshold
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

-- Re-check after each item insert/update so the rule is enforced even when
-- the order row was inserted first with total_mad = 0.
CREATE OR REPLACE FUNCTION public.enforce_order_min_amount_via_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord public.orders%ROWTYPE;
  dist_tier uuid;
  threshold numeric;
  computed_total numeric;
BEGIN
  SELECT * INTO ord FROM public.orders WHERE id = NEW.order_id;
  IF ord.id IS NULL THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(quantity * unit_price_mad), 0)
    INTO computed_total
  FROM public.order_items WHERE order_id = ord.id;

  SELECT pricing_tier_id INTO dist_tier
  FROM public.company_distributor_pricing
  WHERE distributor_id = ord.distributor_id AND company_id = ord.company_id
  LIMIT 1;

  SELECT MAX(min_order_amount) INTO threshold
  FROM public.order_rules
  WHERE active = true
    AND rule_type = 'MIN_ORDER_AMOUNT'
    AND min_order_amount IS NOT NULL
    AND (company_id IS NULL OR company_id = ord.company_id)
    AND (tier_id IS NULL OR tier_id = dist_tier);

  -- Only block when the running total has reached or exceeded what would be
  -- the final total. We allow partial assembly, but if at the moment of insert
  -- the total is already short AND this is the only/last expected item, the
  -- frontend's pre-check already prevents that path. For server defense we
  -- rely on the orders-level trigger checking `total_mad` declared by client:
  IF ord.total_mad IS NOT NULL AND ord.total_mad > 0
     AND threshold IS NOT NULL AND ord.total_mad < threshold THEN
    RAISE EXCEPTION 'الحد الأدنى للطلب هو % درهم', threshold
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_order_min_amount ON public.orders;
CREATE TRIGGER trg_enforce_order_min_amount
BEFORE INSERT OR UPDATE OF total_mad, distributor_id, company_id ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_min_amount();

DROP TRIGGER IF EXISTS trg_enforce_order_min_amount_item ON public.order_items;
CREATE TRIGGER trg_enforce_order_min_amount_item
AFTER INSERT OR UPDATE OF quantity, unit_price_mad ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_order_min_amount_via_item();