-- =========================================================================
-- PHASE 1 — INVENTORY ENGINE
-- =========================================================================

-- Movement type enum
CREATE TYPE public.inventory_movement_type AS ENUM (
  'purchase',
  'sale',
  'reservation',
  'release',
  'adjustment',
  'transfer',
  'return'
);

-- -------------------------------------------------------------------------
-- Warehouses
-- -------------------------------------------------------------------------
CREATE TABLE public.warehouses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  city text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_warehouses_company ON public.warehouses(company_id);
CREATE UNIQUE INDEX uniq_warehouses_default_per_company
  ON public.warehouses(company_id) WHERE is_default;

ALTER TABLE public.warehouses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View warehouses in company"
  ON public.warehouses FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.current_company_id()
  );

CREATE POLICY "Company admins manage warehouses"
  ON public.warehouses FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  );

CREATE TRIGGER trg_warehouses_updated_at
  BEFORE UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- -------------------------------------------------------------------------
-- Inventory levels (cached aggregates)
-- -------------------------------------------------------------------------
CREATE TABLE public.inventory_levels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  quantity_on_hand numeric NOT NULL DEFAULT 0,
  quantity_reserved numeric NOT NULL DEFAULT 0,
  quantity_available numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, product_id, warehouse_id)
);

CREATE INDEX idx_inventory_levels_company ON public.inventory_levels(company_id);
CREATE INDEX idx_inventory_levels_product ON public.inventory_levels(product_id);
CREATE INDEX idx_inventory_levels_warehouse ON public.inventory_levels(warehouse_id);

ALTER TABLE public.inventory_levels ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View inventory levels in company"
  ON public.inventory_levels FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.current_company_id()
  );

CREATE POLICY "Company admins manage inventory levels"
  ON public.inventory_levels FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  );

-- -------------------------------------------------------------------------
-- Inventory movements (append-only ledger)
-- -------------------------------------------------------------------------
CREATE TABLE public.inventory_movements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid NOT NULL REFERENCES public.warehouses(id) ON DELETE CASCADE,
  movement_type public.inventory_movement_type NOT NULL,
  quantity numeric NOT NULL,
  reference_type text,
  reference_id uuid,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_mov_company ON public.inventory_movements(company_id);
CREATE INDEX idx_inv_mov_product ON public.inventory_movements(product_id);
CREATE INDEX idx_inv_mov_warehouse ON public.inventory_movements(warehouse_id);
CREATE INDEX idx_inv_mov_reference ON public.inventory_movements(reference_type, reference_id);

ALTER TABLE public.inventory_movements ENABLE ROW LEVEL SECURITY;

-- Only super admins and company admins can read the raw ledger
CREATE POLICY "View inventory movements as admin"
  ON public.inventory_movements FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  );

CREATE POLICY "Company admins insert inventory movements"
  ON public.inventory_movements FOR INSERT TO authenticated
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  );

-- Movements are append-only: no UPDATE / DELETE policies = denied.

-- -------------------------------------------------------------------------
-- Lightweight event sink (consumed later by Notification Engine in Phase 3)
-- -------------------------------------------------------------------------
CREATE TABLE public.inventory_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  warehouse_id uuid REFERENCES public.warehouses(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_inv_events_company ON public.inventory_events(company_id);
CREATE INDEX idx_inv_events_type ON public.inventory_events(event_type);

ALTER TABLE public.inventory_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View inventory events as admin"
  ON public.inventory_events FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'))
  );

-- =========================================================================
-- TRIGGER: recalc inventory_levels from movements + emit low-stock event
-- =========================================================================
CREATE OR REPLACE FUNCTION public.apply_inventory_movement()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta_on_hand numeric := 0;
  delta_reserved numeric := 0;
  new_on_hand numeric;
  new_reserved numeric;
  new_available numeric;
  threshold int;
BEGIN
  -- Map movement type to deltas
  CASE NEW.movement_type
    WHEN 'purchase'    THEN delta_on_hand :=  NEW.quantity;
    WHEN 'return'      THEN delta_on_hand :=  NEW.quantity;
    WHEN 'sale'        THEN delta_on_hand := -NEW.quantity;
                            delta_reserved := -NEW.quantity;
    WHEN 'reservation' THEN delta_reserved :=  NEW.quantity;
    WHEN 'release'     THEN delta_reserved := -NEW.quantity;
    WHEN 'adjustment'  THEN delta_on_hand :=  NEW.quantity; -- signed by caller
    WHEN 'transfer'    THEN delta_on_hand :=  NEW.quantity; -- signed by caller (negative on source row)
  END CASE;

  INSERT INTO public.inventory_levels (
    company_id, product_id, warehouse_id,
    quantity_on_hand, quantity_reserved, quantity_available, updated_at
  )
  VALUES (
    NEW.company_id, NEW.product_id, NEW.warehouse_id,
    GREATEST(delta_on_hand, 0),
    GREATEST(delta_reserved, 0),
    GREATEST(delta_on_hand - GREATEST(delta_reserved, 0), 0),
    now()
  )
  ON CONFLICT (company_id, product_id, warehouse_id) DO UPDATE
    SET quantity_on_hand   = inventory_levels.quantity_on_hand   + delta_on_hand,
        quantity_reserved  = GREATEST(inventory_levels.quantity_reserved + delta_reserved, 0),
        quantity_available = (inventory_levels.quantity_on_hand + delta_on_hand)
                             - GREATEST(inventory_levels.quantity_reserved + delta_reserved, 0),
        updated_at = now()
    RETURNING quantity_on_hand, quantity_reserved, quantity_available
    INTO new_on_hand, new_reserved, new_available;

  -- Emit low-stock event if available drops at/under product threshold
  IF new_available IS NOT NULL THEN
    SELECT low_stock_threshold INTO threshold FROM public.products WHERE id = NEW.product_id;
    IF threshold IS NOT NULL AND new_available <= threshold THEN
      INSERT INTO public.inventory_events (
        company_id, event_type, product_id, warehouse_id, payload
      ) VALUES (
        NEW.company_id, 'low_stock', NEW.product_id, NEW.warehouse_id,
        jsonb_build_object(
          'available', new_available,
          'on_hand', new_on_hand,
          'reserved', new_reserved,
          'threshold', threshold
        )
      );
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_apply_inventory_movement
  AFTER INSERT ON public.inventory_movements
  FOR EACH ROW EXECUTE FUNCTION public.apply_inventory_movement();

-- =========================================================================
-- ORDER INTEGRATION
-- =========================================================================
-- Helper: pick the default warehouse for a company (or any one as fallback)
CREATE OR REPLACE FUNCTION public.default_warehouse_for_company(_company_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.warehouses
  WHERE company_id = _company_id
  ORDER BY is_default DESC, created_at ASC
  LIMIT 1;
$$;

-- On order_items INSERT → reserve stock
CREATE OR REPLACE FUNCTION public.reserve_stock_on_order_item()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  ord_company uuid;
  ord_status public.order_status;
  wh uuid;
BEGIN
  SELECT company_id, status INTO ord_company, ord_status
    FROM public.orders WHERE id = NEW.order_id;
  IF ord_company IS NULL THEN RETURN NEW; END IF;

  -- Only reserve while order is still operational
  IF ord_status IN ('cancelled','delivered') THEN
    RETURN NEW;
  END IF;

  wh := public.default_warehouse_for_company(ord_company);
  IF wh IS NULL THEN
    -- No warehouse configured yet → skip silently (legacy data path)
    RETURN NEW;
  END IF;

  INSERT INTO public.inventory_movements (
    company_id, product_id, warehouse_id, movement_type, quantity,
    reference_type, reference_id, metadata
  ) VALUES (
    ord_company, NEW.product_id, wh, 'reservation', NEW.quantity,
    'order', NEW.order_id,
    jsonb_build_object('order_item_id', NEW.id)
  );
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_reserve_stock_on_order_item
  AFTER INSERT ON public.order_items
  FOR EACH ROW EXECUTE FUNCTION public.reserve_stock_on_order_item();

-- On order status change → convert reservation to sale or release it
CREATE OR REPLACE FUNCTION public.handle_order_status_inventory()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  itm record;
  wh uuid;
BEGIN
  IF NEW.status IS NOT DISTINCT FROM OLD.status THEN RETURN NEW; END IF;

  wh := public.default_warehouse_for_company(NEW.company_id);
  IF wh IS NULL THEN RETURN NEW; END IF;

  -- Shipped/Delivered → record sale (also clears reservation via trigger logic)
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

  -- Cancelled → release any active reservation
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

CREATE TRIGGER trg_handle_order_status_inventory
  AFTER UPDATE OF status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.handle_order_status_inventory();

-- =========================================================================
-- BACKFILL: ensure every existing company has at least one warehouse
-- =========================================================================
INSERT INTO public.warehouses (company_id, name, city, is_default)
SELECT c.id, 'المستودع الرئيسي', NULL, true
FROM public.companies c
WHERE NOT EXISTS (SELECT 1 FROM public.warehouses w WHERE w.company_id = c.id);
