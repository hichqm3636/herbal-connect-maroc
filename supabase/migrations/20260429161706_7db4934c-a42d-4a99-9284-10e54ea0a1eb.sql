-- Phase 1: Payments structure on orders

-- 1. Create payment_status enum
DO $$ BEGIN
  CREATE TYPE public.payment_status AS ENUM ('pending', 'awaiting_confirmation', 'paid', 'failed', 'refunded');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2. Create order_payment_method enum (distinct from invoice payment_method which contains legacy values)
DO $$ BEGIN
  CREATE TYPE public.order_payment_method AS ENUM ('manual', 'cod', 'bank_transfer', 'card', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 3. Add new columns to orders
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS payment_status public.payment_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS payment_reference text,
  ADD COLUMN IF NOT EXISTS payment_paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS payment_provider text;
-- Keep existing payment_method text column as-is (free-form) to avoid breaking historic rows.
-- Going forward, frontend writes one of: 'manual','cod','bank_transfer'.

-- 4. Index for vendor filtering by payment_status
CREATE INDEX IF NOT EXISTS idx_orders_company_payment_status
  ON public.orders (company_id, payment_status);

-- 5. Audit payment_status changes inside the existing audit_order_changes function
CREATE OR REPLACE FUNCTION public.audit_order_changes()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid uuid := auth.uid();
  meta jsonb;
  changed jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP = 'INSERT' THEN
    meta := jsonb_build_object(
      'order_id', NEW.id,
      'order_number', NEW.order_number,
      'after', jsonb_build_object(
        'status', NEW.status,
        'total_mad', NEW.total_mad,
        'payment_method', NEW.payment_method,
        'payment_status', NEW.payment_status,
        'notes', NEW.notes,
        'admin_notes', NEW.admin_notes
      )
    );
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (COALESCE(uid, NEW.buyer_id), NEW.company_id, 'order_created', NEW.buyer_id, meta);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      changed := changed || jsonb_build_object('status', jsonb_build_object('before', OLD.status, 'after', NEW.status));
    END IF;
    IF NEW.payment_status IS DISTINCT FROM OLD.payment_status THEN
      changed := changed || jsonb_build_object('payment_status', jsonb_build_object('before', OLD.payment_status, 'after', NEW.payment_status));
    END IF;
    IF NEW.total_mad IS DISTINCT FROM OLD.total_mad THEN
      changed := changed || jsonb_build_object('total_mad', jsonb_build_object('before', OLD.total_mad, 'after', NEW.total_mad));
    END IF;
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      changed := changed || jsonb_build_object('payment_method', jsonb_build_object('before', OLD.payment_method, 'after', NEW.payment_method));
    END IF;
    IF NEW.payment_reference IS DISTINCT FROM OLD.payment_reference THEN
      changed := changed || jsonb_build_object('payment_reference', jsonb_build_object('before', OLD.payment_reference, 'after', NEW.payment_reference));
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      changed := changed || jsonb_build_object('notes', jsonb_build_object('before', OLD.notes, 'after', NEW.notes));
    END IF;
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
      changed := changed || jsonb_build_object('admin_notes', jsonb_build_object('before', OLD.admin_notes, 'after', NEW.admin_notes));
    END IF;
    IF changed = '{}'::jsonb THEN RETURN NEW; END IF;

    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, NEW.buyer_id), NEW.company_id, 'order_updated', NEW.buyer_id,
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number, 'changes', changed)
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, OLD.buyer_id), OLD.company_id, 'order_deleted', OLD.buyer_id,
      jsonb_build_object('order_id', OLD.id, 'order_number', OLD.order_number,
        'before', jsonb_build_object('status', OLD.status, 'total_mad', OLD.total_mad, 'payment_method', OLD.payment_method))
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$function$;

-- 6. Trigger: when order status moves to delivered AND payment_method = 'cod', auto-mark payment_status = 'paid'
CREATE OR REPLACE FUNCTION public.auto_mark_cod_paid()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NEW.status = 'delivered' AND OLD.status IS DISTINCT FROM 'delivered'
     AND NEW.payment_method = 'cod' AND NEW.payment_status <> 'paid' THEN
    NEW.payment_status := 'paid';
    NEW.payment_paid_at := COALESCE(NEW.payment_paid_at, now());
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_auto_mark_cod_paid ON public.orders;
CREATE TRIGGER trg_auto_mark_cod_paid
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.auto_mark_cod_paid();
