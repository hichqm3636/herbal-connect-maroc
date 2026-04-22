-- Audit triggers for orders + loyalty point changes.
-- Records: timestamp (admin_activity_log.created_at), admin user (auth.uid()),
-- target user (the affected distributor), and a JSON metadata payload with
-- before/after snapshots of the changed fields.

-- =====================================================================
-- 1) Orders audit: insert / update / delete
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_order_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
        'points_earned', NEW.points_earned,
        'payment_method', NEW.payment_method,
        'notes', NEW.notes,
        'admin_notes', NEW.admin_notes
      )
    );
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (COALESCE(uid, NEW.distributor_id), NEW.company_id, 'order_created', NEW.distributor_id, meta);
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    -- Only log if at least one tracked field actually changed.
    IF NEW.status IS DISTINCT FROM OLD.status THEN
      changed := changed || jsonb_build_object(
        'status', jsonb_build_object('before', OLD.status, 'after', NEW.status)
      );
    END IF;
    IF NEW.total_mad IS DISTINCT FROM OLD.total_mad THEN
      changed := changed || jsonb_build_object(
        'total_mad', jsonb_build_object('before', OLD.total_mad, 'after', NEW.total_mad)
      );
    END IF;
    IF NEW.points_earned IS DISTINCT FROM OLD.points_earned THEN
      changed := changed || jsonb_build_object(
        'points_earned', jsonb_build_object('before', OLD.points_earned, 'after', NEW.points_earned)
      );
    END IF;
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      changed := changed || jsonb_build_object(
        'payment_method', jsonb_build_object('before', OLD.payment_method, 'after', NEW.payment_method)
      );
    END IF;
    IF NEW.notes IS DISTINCT FROM OLD.notes THEN
      changed := changed || jsonb_build_object(
        'notes', jsonb_build_object('before', OLD.notes, 'after', NEW.notes)
      );
    END IF;
    IF NEW.admin_notes IS DISTINCT FROM OLD.admin_notes THEN
      changed := changed || jsonb_build_object(
        'admin_notes', jsonb_build_object('before', OLD.admin_notes, 'after', NEW.admin_notes)
      );
    END IF;

    IF changed = '{}'::jsonb THEN
      RETURN NEW;
    END IF;

    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, NEW.distributor_id),
      NEW.company_id,
      'order_updated',
      NEW.distributor_id,
      jsonb_build_object(
        'order_id', NEW.id,
        'order_number', NEW.order_number,
        'changes', changed
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, OLD.distributor_id),
      OLD.company_id,
      'order_deleted',
      OLD.distributor_id,
      jsonb_build_object(
        'order_id', OLD.id,
        'order_number', OLD.order_number,
        'before', jsonb_build_object(
          'status', OLD.status,
          'total_mad', OLD.total_mad,
          'points_earned', OLD.points_earned,
          'payment_method', OLD.payment_method
        )
      )
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_orders ON public.orders;
CREATE TRIGGER trg_audit_orders
AFTER INSERT OR UPDATE OR DELETE ON public.orders
FOR EACH ROW EXECUTE FUNCTION public.audit_order_changes();

-- =====================================================================
-- 2) Order items audit: insert / update / delete
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_order_item_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
  ord_company uuid;
  ord_distributor uuid;
  ord_number text;
  changed jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT company_id, distributor_id, order_number
      INTO ord_company, ord_distributor, ord_number
    FROM public.orders WHERE id = NEW.order_id;
  ELSE
    SELECT company_id, distributor_id, order_number
      INTO ord_company, ord_distributor, ord_number
    FROM public.orders WHERE id = OLD.order_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, ord_distributor),
      ord_company,
      'order_item_added',
      ord_distributor,
      jsonb_build_object(
        'order_id', NEW.order_id,
        'order_number', ord_number,
        'order_item_id', NEW.id,
        'product_id', NEW.product_id,
        'after', jsonb_build_object(
          'quantity', NEW.quantity,
          'unit_price_mad', NEW.unit_price_mad
        )
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
      changed := changed || jsonb_build_object(
        'quantity', jsonb_build_object('before', OLD.quantity, 'after', NEW.quantity)
      );
    END IF;
    IF NEW.unit_price_mad IS DISTINCT FROM OLD.unit_price_mad THEN
      changed := changed || jsonb_build_object(
        'unit_price_mad', jsonb_build_object('before', OLD.unit_price_mad, 'after', NEW.unit_price_mad)
      );
    END IF;
    IF changed = '{}'::jsonb THEN RETURN NEW; END IF;

    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, ord_distributor),
      ord_company,
      'order_item_updated',
      ord_distributor,
      jsonb_build_object(
        'order_id', NEW.order_id,
        'order_number', ord_number,
        'order_item_id', NEW.id,
        'product_id', NEW.product_id,
        'changes', changed
      )
    );
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, ord_distributor),
      ord_company,
      'order_item_removed',
      ord_distributor,
      jsonb_build_object(
        'order_id', OLD.order_id,
        'order_number', ord_number,
        'order_item_id', OLD.id,
        'product_id', OLD.product_id,
        'before', jsonb_build_object(
          'quantity', OLD.quantity,
          'unit_price_mad', OLD.unit_price_mad
        )
      )
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_order_items ON public.order_items;
CREATE TRIGGER trg_audit_order_items
AFTER INSERT OR UPDATE OR DELETE ON public.order_items
FOR EACH ROW EXECUTE FUNCTION public.audit_order_item_changes();

-- =====================================================================
-- 3) Loyalty points audit: log every change to profiles.loyalty_points,
--    plus every loyalty_transactions row.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.audit_loyalty_points_changes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  IF NEW.loyalty_points IS DISTINCT FROM OLD.loyalty_points THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, NEW.id),
      NEW.company_id,
      'loyalty_points_changed',
      NEW.id,
      jsonb_build_object(
        'before', OLD.loyalty_points,
        'after', NEW.loyalty_points,
        'delta', COALESCE(NEW.loyalty_points,0) - COALESCE(OLD.loyalty_points,0),
        'level_before', OLD.level,
        'level_after', NEW.level
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_loyalty_points ON public.profiles;
CREATE TRIGGER trg_audit_loyalty_points
AFTER UPDATE OF loyalty_points ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.audit_loyalty_points_changes();

CREATE OR REPLACE FUNCTION public.audit_loyalty_transaction_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  uid uuid := auth.uid();
BEGIN
  INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
  VALUES (
    COALESCE(uid, NEW.admin_id, NEW.distributor_id),
    NEW.company_id,
    'loyalty_transaction',
    NEW.distributor_id,
    jsonb_build_object(
      'transaction_id', NEW.id,
      'points', NEW.points,
      'reason', NEW.reason
    )
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_loyalty_tx ON public.loyalty_transactions;
CREATE TRIGGER trg_audit_loyalty_tx
AFTER INSERT ON public.loyalty_transactions
FOR EACH ROW EXECUTE FUNCTION public.audit_loyalty_transaction_insert();