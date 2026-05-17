-- Payments are the authoritative event source for "paid" state.
-- This trigger derives invoices.status/paid_at and orders.payment_status/payment_paid_at
-- from the SUM of payments per invoice. Idempotent: only writes when state actually changes.

CREATE OR REPLACE FUNCTION public.sync_invoice_payment_state()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice_id uuid;
  v_invoice_total numeric;
  v_invoice_order uuid;
  v_paid_sum numeric;
  v_first_paid timestamptz;
  v_method text;
BEGIN
  v_invoice_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  IF v_invoice_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT total_mad, order_id
    INTO v_invoice_total, v_invoice_order
  FROM public.invoices
  WHERE id = v_invoice_id;

  IF v_invoice_total IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(amount), 0), MIN(paid_at)
    INTO v_paid_sum, v_first_paid
  FROM public.payments
  WHERE invoice_id = v_invoice_id;

  SELECT payment_method::text
    INTO v_method
  FROM public.payments
  WHERE invoice_id = v_invoice_id
  ORDER BY paid_at ASC
  LIMIT 1;

  IF v_invoice_total > 0 AND v_paid_sum >= v_invoice_total THEN
    -- Sync invoice -> paid (idempotent)
    UPDATE public.invoices
       SET status = 'paid',
           paid_at = v_first_paid,
           payment_method = COALESCE(payment_method, v_method),
           updated_at = now()
     WHERE id = v_invoice_id
       AND (status <> 'paid' OR paid_at IS DISTINCT FROM v_first_paid);

    -- Sync order -> paid (idempotent, only if linked)
    IF v_invoice_order IS NOT NULL THEN
      UPDATE public.orders
         SET payment_status = 'paid',
             payment_paid_at = COALESCE(payment_paid_at, v_first_paid),
             updated_at = now()
       WHERE id = v_invoice_order
         AND payment_status <> 'paid';
    END IF;
  ELSE
    -- Reverse sync: payments removed/reduced below total
    UPDATE public.invoices
       SET status = 'issued',
           paid_at = NULL,
           updated_at = now()
     WHERE id = v_invoice_id
       AND status = 'paid';
    -- Note: we intentionally do NOT auto-revert orders.payment_status here.
    -- A vendor must explicitly reconcile a reversal at order level to avoid
    -- silently flipping fulfillment-side state during refund workflows.
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_invoice_payment_state ON public.payments;
CREATE TRIGGER trg_sync_invoice_payment_state
AFTER INSERT OR UPDATE OF amount, invoice_id, paid_at OR DELETE
ON public.payments
FOR EACH ROW
EXECUTE FUNCTION public.sync_invoice_payment_state();

COMMENT ON FUNCTION public.sync_invoice_payment_state() IS
  'P0 consistency bridge: payments are the event source of truth. '
  'Derives invoices.status/paid_at and orders.payment_status/payment_paid_at '
  'from SUM(payments.amount) per invoice. Idempotent.';