
-- ========================================
-- 1. INVENTORY IDEMPOTENCY GUARD
-- ========================================
-- Prevent double "sale" movement per (order, product). Other movement types
-- (reservation, release, adjustment) are intentionally not unique-constrained.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_inventory_sale_per_order_product
  ON public.inventory_movements (reference_id, product_id)
  WHERE movement_type = 'sale' AND reference_type = 'order';

-- ========================================
-- 2. LOYALTY POINTS DERIVED FROM TRANSACTIONS
-- ========================================

-- Replace earn_loyalty_points: stop writing to profiles directly.
CREATE OR REPLACE FUNCTION public.earn_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  item RECORD;
  total_points INTEGER := 0;
BEGIN
  IF NEW.status = 'delivered' AND (OLD.status IS DISTINCT FROM 'delivered') THEN
    IF EXISTS (
      SELECT 1 FROM public.loyalty_transactions
      WHERE order_id = NEW.id AND type = 'earned'
    ) THEN
      RETURN NEW;
    END IF;

    FOR item IN
      SELECT oi.quantity, p.points_per_unit
      FROM public.order_items oi
      JOIN public.products p ON p.id = oi.product_id
      WHERE oi.order_id = NEW.id
        AND p.points_per_unit IS NOT NULL
        AND p.points_per_unit > 0
    LOOP
      total_points := total_points + (item.quantity * item.points_per_unit);
    END LOOP;

    IF total_points > 0 THEN
      INSERT INTO public.loyalty_transactions (
        company_id, user_id, order_id, points, type, description
      ) VALUES (
        NEW.company_id, NEW.buyer_id, NEW.id, total_points, 'earned',
        'نقاط مكافأة على الطلب ' || COALESCE(NEW.order_number, NEW.id::text)
      );
      -- profiles.loyalty_points is now derived via trg_sync_profile_loyalty_points
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- New: recompute profiles.loyalty_points from the ledger.
CREATE OR REPLACE FUNCTION public.sync_profile_loyalty_points()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected_user uuid;
BEGIN
  affected_user := COALESCE(NEW.user_id, OLD.user_id);
  IF affected_user IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  UPDATE public.profiles
    SET loyalty_points = COALESCE((
      SELECT SUM(points)::int
      FROM public.loyalty_transactions
      WHERE user_id = affected_user
    ), 0),
    updated_at = now()
    WHERE id = affected_user;

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_profile_loyalty_points() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_sync_profile_loyalty_points ON public.loyalty_transactions;
CREATE TRIGGER trg_sync_profile_loyalty_points
  AFTER INSERT OR UPDATE OR DELETE ON public.loyalty_transactions
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_profile_loyalty_points();

-- ========================================
-- 3. BACKFILL: reconcile current profiles balances with the ledger
-- ========================================
UPDATE public.profiles p
SET loyalty_points = COALESCE(lt.total, 0),
    updated_at = now()
FROM (
  SELECT user_id, SUM(points)::int AS total
  FROM public.loyalty_transactions
  GROUP BY user_id
) lt
WHERE lt.user_id = p.id
  AND p.loyalty_points IS DISTINCT FROM COALESCE(lt.total, 0);

-- Zero-out profiles with no ledger entries but a positive cached balance
UPDATE public.profiles
  SET loyalty_points = 0, updated_at = now()
WHERE loyalty_points <> 0
  AND id NOT IN (SELECT DISTINCT user_id FROM public.loyalty_transactions WHERE user_id IS NOT NULL);
