
-- ===========================================================================
-- 1) Drop policies that reference distributor_id (across 6 tables + storage)
-- ===========================================================================
DROP POLICY IF EXISTS "View company orders"                            ON public.orders;
DROP POLICY IF EXISTS "Buyers view own marketplace orders"             ON public.orders;
DROP POLICY IF EXISTS "Marketplace clients create orders at vendors"   ON public.orders;

DROP POLICY IF EXISTS "View order items in company"                    ON public.order_items;
DROP POLICY IF EXISTS "Buyers view items of own marketplace orders"    ON public.order_items;
DROP POLICY IF EXISTS "Buyers insert items for own marketplace orders" ON public.order_items;
DROP POLICY IF EXISTS "Clients insert items for own orders"            ON public.order_items;

DROP POLICY IF EXISTS "View invoices in company"                       ON public.invoices;
DROP POLICY IF EXISTS "View invoice items in company"                  ON public.invoice_items;
DROP POLICY IF EXISTS "View payments in company"                       ON public.payments;
DROP POLICY IF EXISTS "Distributors record own invoice payments"       ON public.payments;

DROP POLICY IF EXISTS "Vendors view their clients"                     ON public.profiles;

DROP POLICY IF EXISTS "Read invoice PDFs in company" ON storage.objects;
DROP POLICY IF EXISTS "Admins read invoice pdfs"     ON storage.objects;

-- ===========================================================================
-- 2) Drop triggers that depend on functions referencing distributor_id
-- ===========================================================================
DROP TRIGGER IF EXISTS trg_audit_order_changes        ON public.orders;
DROP TRIGGER IF EXISTS audit_order_changes            ON public.orders;
DROP TRIGGER IF EXISTS trg_log_order_status_change    ON public.orders;
DROP TRIGGER IF EXISTS log_order_status_change        ON public.orders;
DROP TRIGGER IF EXISTS trg_notify_admins_on_new_order ON public.orders;
DROP TRIGGER IF EXISTS notify_admins_on_new_order     ON public.orders;
DROP TRIGGER IF EXISTS trg_handle_order_status_inventory ON public.orders;
DROP TRIGGER IF EXISTS handle_order_status_inventory  ON public.orders;
DROP TRIGGER IF EXISTS trg_audit_order_item_changes   ON public.order_items;
DROP TRIGGER IF EXISTS audit_order_item_changes       ON public.order_items;
DROP TRIGGER IF EXISTS trg_enforce_invoice_consistency ON public.invoices;
DROP TRIGGER IF EXISTS enforce_invoice_consistency    ON public.invoices;

-- ===========================================================================
-- 3) Rename the columns
-- ===========================================================================
ALTER TABLE public.orders   RENAME COLUMN distributor_id TO buyer_id;
ALTER TABLE public.invoices RENAME COLUMN distributor_id TO buyer_id;

-- Rename old FK constraints if they exist (cosmetic; do not fail if missing)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'orders_distributor_fk') THEN
    EXECUTE 'ALTER TABLE public.orders RENAME CONSTRAINT orders_distributor_fk TO orders_buyer_fk';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_distributor_id_fkey') THEN
    EXECUTE 'ALTER TABLE public.invoices RENAME CONSTRAINT invoices_distributor_id_fkey TO invoices_buyer_id_fkey';
  END IF;
END $$;

-- ===========================================================================
-- 4) Recreate RLS policies with the new column name
-- ===========================================================================

-- orders
CREATE POLICY "View company orders" ON public.orders
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR ((company_id = current_company_id())
      AND ((auth.uid() = buyer_id) OR has_role(auth.uid(), 'admin'::app_role)))
);

CREATE POLICY "Buyers view own marketplace orders" ON public.orders
FOR SELECT TO authenticated
USING (buyer_id = auth.uid());

CREATE POLICY "Marketplace clients create orders at vendors" ON public.orders
FOR INSERT TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND buyer_id = auth.uid()
  AND EXISTS (
    SELECT 1 FROM public.companies c
    WHERE c.id = orders.company_id AND c.is_listed = true
  )
);

-- order_items
CREATE POLICY "View order items in company" ON public.order_items
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND (
        is_super_admin(auth.uid())
        OR ((o.company_id = current_company_id())
            AND ((auth.uid() = o.buyer_id) OR has_role(auth.uid(), 'admin'::app_role)))
      )
  )
);

CREATE POLICY "Buyers view items of own marketplace orders" ON public.order_items
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid()
  )
);

CREATE POLICY "Buyers insert items for own marketplace orders" ON public.order_items
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id AND o.buyer_id = auth.uid()
  )
);

-- (We deliberately do NOT recreate "Clients insert items for own orders" — it
--  was redundant with the buyer rule above and depended on the unused
--  `client` role check.)

-- invoices
CREATE POLICY "View invoices in company" ON public.invoices
FOR SELECT
USING (
  is_super_admin(auth.uid())
  OR ((company_id = current_company_id())
      AND ((auth.uid() = buyer_id) OR has_role(auth.uid(), 'admin'::app_role)))
);

-- invoice_items
CREATE POLICY "View invoice items in company" ON public.invoice_items
FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    company_id = current_company_id()
    AND EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id = invoice_items.invoice_id
        AND ((auth.uid() = i.buyer_id) OR has_role(auth.uid(), 'admin'::app_role))
    )
  )
);

-- payments
CREATE POLICY "View payments in company" ON public.payments
FOR SELECT TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (
    company_id = current_company_id()
    AND (
      has_role(auth.uid(), 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = payments.invoice_id AND i.buyer_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Buyers record own invoice payments" ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = payments.invoice_id
      AND i.buyer_id = auth.uid()
      AND i.company_id = payments.company_id
  )
);

-- profiles
CREATE POLICY "Vendors view their clients" ON public.profiles
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.buyer_id = profiles.id
      AND o.company_id = current_company_id()
      AND has_role(auth.uid(), 'admin'::app_role)
  )
);

-- storage.objects (invoice PDFs)
CREATE POLICY "Read invoice PDFs in company" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND (
    is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.pdf_path = objects.name
        AND (
          (i.company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
          OR i.buyer_id = auth.uid()
        )
    )
  )
);

CREATE POLICY "Admins read invoice pdfs" ON storage.objects
FOR SELECT
USING (
  bucket_id = 'invoices'
  AND (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin'::app_role)
        AND (storage.foldername(name))[1] = (current_company_id())::text)
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.pdf_path = objects.name AND i.buyer_id = auth.uid()
    )
  )
);

-- ===========================================================================
-- 5) Rebuild trigger functions with the new column name
-- ===========================================================================

CREATE OR REPLACE FUNCTION public.audit_order_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
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
    IF NEW.total_mad IS DISTINCT FROM OLD.total_mad THEN
      changed := changed || jsonb_build_object('total_mad', jsonb_build_object('before', OLD.total_mad, 'after', NEW.total_mad));
    END IF;
    IF NEW.payment_method IS DISTINCT FROM OLD.payment_method THEN
      changed := changed || jsonb_build_object('payment_method', jsonb_build_object('before', OLD.payment_method, 'after', NEW.payment_method));
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
$$;

CREATE OR REPLACE FUNCTION public.log_order_status_change()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (
      COALESCE(uid, NEW.buyer_id), NEW.company_id, 'order_status_change', NEW.buyer_id,
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number,
        'old_status', OLD.status, 'new_status', NEW.status)
    );
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.audit_order_item_changes()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  ord_company uuid; ord_buyer uuid; ord_number text;
  changed jsonb := '{}'::jsonb;
BEGIN
  IF TG_OP IN ('INSERT','UPDATE') THEN
    SELECT company_id, buyer_id, order_number INTO ord_company, ord_buyer, ord_number
    FROM public.orders WHERE id = NEW.order_id;
  ELSE
    SELECT company_id, buyer_id, order_number INTO ord_company, ord_buyer, ord_number
    FROM public.orders WHERE id = OLD.order_id;
  END IF;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (COALESCE(uid, ord_buyer), ord_company, 'order_item_added', ord_buyer,
      jsonb_build_object('order_id', NEW.order_id, 'order_number', ord_number,
        'order_item_id', NEW.id, 'product_id', NEW.product_id,
        'after', jsonb_build_object('quantity', NEW.quantity, 'unit_price_mad', NEW.unit_price_mad)));
    RETURN NEW;

  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.quantity IS DISTINCT FROM OLD.quantity THEN
      changed := changed || jsonb_build_object('quantity', jsonb_build_object('before', OLD.quantity, 'after', NEW.quantity));
    END IF;
    IF NEW.unit_price_mad IS DISTINCT FROM OLD.unit_price_mad THEN
      changed := changed || jsonb_build_object('unit_price_mad', jsonb_build_object('before', OLD.unit_price_mad, 'after', NEW.unit_price_mad));
    END IF;
    IF changed = '{}'::jsonb THEN RETURN NEW; END IF;
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (COALESCE(uid, ord_buyer), ord_company, 'order_item_updated', ord_buyer,
      jsonb_build_object('order_id', NEW.order_id, 'order_number', ord_number,
        'order_item_id', NEW.id, 'product_id', NEW.product_id, 'changes', changed));
    RETURN NEW;

  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.admin_activity_log (admin_id, company_id, action, target_user_id, metadata)
    VALUES (COALESCE(uid, ord_buyer), ord_company, 'order_item_removed', ord_buyer,
      jsonb_build_object('order_id', OLD.order_id, 'order_number', ord_number,
        'order_item_id', OLD.id, 'product_id', OLD.product_id,
        'before', jsonb_build_object('quantity', OLD.quantity, 'unit_price_mad', OLD.unit_price_mad)));
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.notify_admins_on_new_order()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE partner_name text; admin_row record;
BEGIN
  SELECT COALESCE(NULLIF(trim(full_name), ''), 'شريك') INTO partner_name
  FROM public.profiles WHERE id = NEW.buyer_id;

  FOR admin_row IN
    SELECT ur.user_id FROM public.user_roles ur
    WHERE ur.role IN ('admin'::app_role, 'vendor'::app_role)
      AND ur.company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id, admin_row.user_id, 'order_created',
      'طلب جديد ' || NEW.order_number,
      'من ' || partner_name || ' بقيمة ' || to_char(NEW.total_mad, 'FM999G999G990D00') || ' MAD',
      '/vendor/orders?focus=' || NEW.id,
      jsonb_build_object('order_id', NEW.id, 'order_number', NEW.order_number,
        'total_mad', NEW.total_mad, 'buyer_id', NEW.buyer_id)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.enforce_invoice_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE ord_company uuid; ord_buyer uuid;
BEGIN
  SELECT company_id, buyer_id INTO ord_company, ord_buyer
  FROM public.orders WHERE id = NEW.order_id;
  IF ord_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'invoice company must match order company';
  END IF;
  IF ord_buyer IS DISTINCT FROM NEW.buyer_id THEN
    RAISE EXCEPTION 'invoice buyer must match order buyer';
  END IF;
  RETURN NEW;
END;
$$;

-- handle_order_status_inventory uses NEW.company_id and NEW.status only,
-- not distributor_id — recreating defensively to be safe.
CREATE OR REPLACE FUNCTION public.handle_order_status_inventory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE itm record; wh uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;
  wh := public.default_warehouse_for_company(NEW.company_id);
  IF wh IS NULL THEN RETURN NEW; END IF;

  IF NEW.status IN ('shipped','delivered')
     AND OLD.status NOT IN ('shipped','delivered','cancelled') THEN
    FOR itm IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      INSERT INTO public.inventory_movements (
        company_id, product_id, warehouse_id, movement_type, quantity,
        reference_type, reference_id, metadata
      ) VALUES (
        NEW.company_id, itm.product_id, wh, 'sale', itm.quantity,
        'order', NEW.id, jsonb_build_object('reason','order_shipped')
      );
    END LOOP;
  END IF;

  IF NEW.status = 'cancelled'
     AND OLD.status NOT IN ('cancelled','shipped','delivered') THEN
    FOR itm IN SELECT product_id, quantity FROM public.order_items WHERE order_id = NEW.id LOOP
      INSERT INTO public.inventory_movements (
        company_id, product_id, warehouse_id, movement_type, quantity,
        reference_type, reference_id, metadata
      ) VALUES (
        NEW.company_id, itm.product_id, wh, 'release', itm.quantity,
        'order', NEW.id, jsonb_build_object('reason','order_cancelled')
      );
    END LOOP;
  END IF;
  RETURN NEW;
END;
$$;

-- ===========================================================================
-- 6) Reattach triggers
-- ===========================================================================
CREATE TRIGGER trg_audit_order_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.audit_order_changes();

CREATE TRIGGER trg_log_order_status_change
  AFTER UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.log_order_status_change();

CREATE TRIGGER trg_notify_admins_on_new_order
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.notify_admins_on_new_order();

CREATE TRIGGER trg_handle_order_status_inventory
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_inventory();

CREATE TRIGGER trg_audit_order_item_changes
  AFTER INSERT OR UPDATE OR DELETE ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.audit_order_item_changes();

CREATE TRIGGER trg_enforce_invoice_consistency
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_consistency();
