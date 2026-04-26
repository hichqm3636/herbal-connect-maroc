-- Default commission rate (percent). Easy to tweak later.
CREATE OR REPLACE FUNCTION public.default_commission_rate()
RETURNS numeric
LANGUAGE sql IMMUTABLE
AS $$ SELECT 10.00::numeric $$;

-- 1) Auto-create pending commission when an order with partner_id is inserted
CREATE OR REPLACE FUNCTION public.create_partner_commission_on_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  rate numeric := public.default_commission_rate();
  base numeric;
  amount numeric;
BEGIN
  IF NEW.partner_id IS NULL THEN
    RETURN NEW;
  END IF;

  base := COALESCE(NEW.total_mad, 0);
  amount := ROUND(base * rate / 100.0, 2);

  INSERT INTO public.partner_commissions (
    company_id, partner_id, order_id,
    base_amount_mad, rate_percent, amount_mad, status
  ) VALUES (
    NEW.company_id, NEW.partner_id, NEW.id,
    base, rate, amount, 'pending'
  )
  ON CONFLICT (order_id, partner_id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_create_partner_commission ON public.orders;
CREATE TRIGGER trg_create_partner_commission
AFTER INSERT ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.create_partner_commission_on_order();

-- 2) Auto-approve commission when order is delivered.
--    Snapshot amount is preserved (we only flip status + approved_at).
CREATE OR REPLACE FUNCTION public.approve_partner_commission_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND OLD.status IS DISTINCT FROM 'delivered'
     AND NEW.partner_id IS NOT NULL THEN
    UPDATE public.partner_commissions
       SET status = 'approved',
           approved_at = COALESCE(approved_at, now())
     WHERE order_id = NEW.id
       AND partner_id = NEW.partner_id
       AND status = 'pending';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_approve_partner_commission ON public.orders;
CREATE TRIGGER trg_approve_partner_commission
AFTER UPDATE OF status ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.approve_partner_commission_on_delivery();