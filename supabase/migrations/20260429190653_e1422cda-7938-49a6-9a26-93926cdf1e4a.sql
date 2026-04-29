-- 1. Add 'cod' to payment_method enum if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'cod'
      AND enumtypid = 'public.payment_method'::regtype
  ) THEN
    ALTER TYPE public.payment_method ADD VALUE 'cod';
  END IF;
END$$;

-- 2. COD auto-paid trigger: when status flips to 'delivered' on a COD order,
-- automatically mark payment_status = 'paid' and stamp payment_paid_at.
CREATE OR REPLACE FUNCTION public.cod_autopay_on_delivered()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'delivered'
     AND (OLD.status IS DISTINCT FROM 'delivered')
     AND NEW.payment_method = 'cod'
     AND NEW.payment_status <> 'paid'
  THEN
    NEW.payment_status := 'paid';
    NEW.payment_paid_at := now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cod_autopay_on_delivered ON public.orders;
CREATE TRIGGER trg_cod_autopay_on_delivered
  BEFORE UPDATE ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.cod_autopay_on_delivered();