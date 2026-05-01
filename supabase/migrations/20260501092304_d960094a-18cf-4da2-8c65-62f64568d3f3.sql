-- TASK 1: Loyalty system + supporting columns
-- TASK 2 prep: email_sent_at on invoices

-- 1. Add loyalty_points to profiles (used by trigger + UI)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS loyalty_points INTEGER NOT NULL DEFAULT 0;

-- 2. Loyalty transactions table
CREATE TABLE IF NOT EXISTS public.loyalty_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  order_id UUID REFERENCES public.orders(id) ON DELETE SET NULL,
  points INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('earned','redeemed','expired','adjusted')),
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.loyalty_transactions ENABLE ROW LEVEL SECURITY;

-- Users can see their own loyalty transactions; admins/super see company scope
CREATE POLICY "loyalty_select_own_or_company"
  ON public.loyalty_transactions FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR user_id = auth.uid()
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- Inserts allowed only for super admin or company admin (system uses SECURITY DEFINER trigger)
CREATE POLICY "loyalty_insert_admin"
  ON public.loyalty_transactions FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "loyalty_update_admin"
  ON public.loyalty_transactions FOR UPDATE
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "loyalty_delete_admin"
  ON public.loyalty_transactions FOR DELETE
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

CREATE INDEX IF NOT EXISTS idx_loyalty_user ON public.loyalty_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_order ON public.loyalty_transactions(order_id);
CREATE INDEX IF NOT EXISTS idx_loyalty_company ON public.loyalty_transactions(company_id);

-- 3. Trigger: earn points when order moves to delivered
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
    -- Idempotency: skip if we already credited this order
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
        NEW.company_id,
        NEW.buyer_id,
        NEW.id,
        total_points,
        'earned',
        'نقاط مكافأة على الطلب ' || COALESCE(NEW.order_number, NEW.id::text)
      );

      UPDATE public.profiles
        SET loyalty_points = COALESCE(loyalty_points, 0) + total_points
        WHERE id = NEW.buyer_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_earn_loyalty_points ON public.orders;
CREATE TRIGGER trg_earn_loyalty_points
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.earn_loyalty_points();

-- 4. TASK 2 prep: email_sent_at on invoices
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ;