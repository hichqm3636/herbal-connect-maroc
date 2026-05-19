
-- 1. Audit table for every order status transition
CREATE TABLE public.order_status_transitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id uuid NOT NULL,
  company_id uuid NOT NULL,
  from_status order_status,
  to_status order_status NOT NULL,
  actor_id uuid,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_order_status_transitions_order ON public.order_status_transitions(order_id, created_at DESC);
CREATE INDEX idx_order_status_transitions_company ON public.order_status_transitions(company_id, created_at DESC);

ALTER TABLE public.order_status_transitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View order transitions in company"
  ON public.order_status_transitions FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- No INSERT/UPDATE/DELETE policies: trigger writes via SECURITY DEFINER.

-- 2. Validation function: enforce allowed transitions
CREATE OR REPLACE FUNCTION public.validate_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  allowed boolean := false;
BEGIN
  -- No status change → nothing to validate
  IF NEW.status = OLD.status THEN
    RETURN NEW;
  END IF;

  -- Super admin can force any transition (rare administrative override)
  IF is_super_admin(auth.uid()) THEN
    RETURN NEW;
  END IF;

  -- Allowed forward transitions (must match client NEXT_STATUS)
  allowed := CASE OLD.status
    WHEN 'pending'    THEN NEW.status IN ('confirmed', 'cancelled')
    WHEN 'confirmed'  THEN NEW.status IN ('preparing', 'cancelled')
    WHEN 'preparing'  THEN NEW.status IN ('shipped', 'cancelled')
    WHEN 'processing' THEN NEW.status IN ('shipped', 'cancelled')
    WHEN 'shipped'    THEN NEW.status IN ('delivered')
    WHEN 'delivered'  THEN false
    WHEN 'cancelled'  THEN false
    ELSE false
  END;

  IF NOT allowed THEN
    RAISE EXCEPTION 'Invalid order status transition: % -> %', OLD.status, NEW.status
      USING ERRCODE = 'check_violation',
            HINT   = 'Transition not allowed by order state machine';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_validate_order_status_transition ON public.orders;
CREATE TRIGGER trg_validate_order_status_transition
  BEFORE UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_order_status_transition();

-- 3. Audit-log function: write a row to order_status_transitions
CREATE OR REPLACE FUNCTION public.log_order_status_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.order_status_transitions (
      order_id, company_id, from_status, to_status, actor_id, reason, metadata
    )
    VALUES (
      NEW.id,
      NEW.company_id,
      OLD.status,
      NEW.status,
      auth.uid(),
      nullif(current_setting('app.transition_reason', true), ''),
      jsonb_build_object(
        'order_number', NEW.order_number,
        'payment_status', NEW.payment_status
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_order_status_transition ON public.orders;
CREATE TRIGGER trg_log_order_status_transition
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW
  EXECUTE FUNCTION public.log_order_status_transition();

-- 4. Seed initial transition for existing orders (from null -> current status)
INSERT INTO public.order_status_transitions (order_id, company_id, from_status, to_status, actor_id, reason)
SELECT id, company_id, NULL, status, NULL, 'backfill: pre-state-machine'
FROM public.orders
ON CONFLICT DO NOTHING;
