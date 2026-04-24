
-- ============================================================
-- Multi-Supplier Architecture (Phase 1: schema + backfill)
-- ============================================================
-- Adds per-company suppliers with their own WooCommerce credentials,
-- a webhook delivery dedupe table, and a supplier_id pointer on products.
-- Backfills a "Default Supplier" row per company that already has products,
-- so existing flows keep working with no code changes required.
-- ============================================================

-- 1. Suppliers table (per-company) -----------------------------------------
CREATE TABLE IF NOT EXISTS public.suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name            text NOT NULL,
  domain          text NOT NULL,
  consumer_key    text NOT NULL,
  consumer_secret text NOT NULL,
  webhook_secret  text NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_active       boolean NOT NULL DEFAULT true,
  is_default      boolean NOT NULL DEFAULT false,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_suppliers_company ON public.suppliers(company_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_webhook_secret ON public.suppliers(webhook_secret);
CREATE UNIQUE INDEX IF NOT EXISTS idx_suppliers_one_default_per_company
  ON public.suppliers(company_id) WHERE is_default = true;

ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Company admins manage suppliers"
  ON public.suppliers FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role)));

CREATE POLICY "View suppliers in company"
  ON public.suppliers FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR company_id = public.current_company_id());

CREATE TRIGGER trg_suppliers_updated_at
  BEFORE UPDATE ON public.suppliers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2. Add supplier_id to products -------------------------------------------
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_supplier ON public.products(supplier_id);

-- Same SKU across suppliers is allowed; uniqueness must be per (company, supplier, external_id)
-- to prevent suppliers from overwriting each other during sync.
CREATE UNIQUE INDEX IF NOT EXISTS idx_products_company_supplier_external
  ON public.products(company_id, supplier_id, external_id)
  WHERE supplier_id IS NOT NULL;

-- 3. Webhook delivery idempotency ------------------------------------------
CREATE TABLE IF NOT EXISTS public.woo_webhook_deliveries (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  supplier_id   uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  delivery_id   text NOT NULL,
  topic         text,
  resource_id   text,
  status        text NOT NULL DEFAULT 'received',
  error         text,
  payload_hash  text,
  received_at   timestamptz NOT NULL DEFAULT now(),
  processed_at  timestamptz,
  UNIQUE (supplier_id, delivery_id)
);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_supplier ON public.woo_webhook_deliveries(supplier_id, received_at DESC);

ALTER TABLE public.woo_webhook_deliveries ENABLE ROW LEVEL SECURITY;

-- Read-only for company admins (writes happen via service role from the webhook route)
CREATE POLICY "Admins view webhook deliveries"
  ON public.woo_webhook_deliveries FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = woo_webhook_deliveries.supplier_id
        AND s.company_id = public.current_company_id()
        AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  );

-- 4. Backfill: create one Default Supplier per company that has products ---
-- Credentials use placeholders; the existing env vars stay as the runtime
-- fallback for the first/default supplier so nothing breaks today.
DO $$
DECLARE
  c record;
  new_supplier_id uuid;
BEGIN
  FOR c IN
    SELECT DISTINCT company_id FROM public.products WHERE supplier_id IS NULL
  LOOP
    -- Skip if a default already exists for this company
    SELECT id INTO new_supplier_id
    FROM public.suppliers
    WHERE company_id = c.company_id AND is_default = true
    LIMIT 1;

    IF new_supplier_id IS NULL THEN
      INSERT INTO public.suppliers (company_id, name, domain, consumer_key, consumer_secret, is_default)
      VALUES (c.company_id, 'Default Supplier', 'env://default', 'env://default', 'env://default', true)
      RETURNING id INTO new_supplier_id;
    END IF;

    UPDATE public.products
    SET supplier_id = new_supplier_id
    WHERE company_id = c.company_id AND supplier_id IS NULL;
  END LOOP;
END $$;
