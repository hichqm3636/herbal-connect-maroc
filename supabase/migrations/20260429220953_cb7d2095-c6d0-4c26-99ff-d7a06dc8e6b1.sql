-- =========================================================
-- PHASE 1 COMPLETION — DB MIGRATION
-- =========================================================

-- ---------- 1. ADD FISCAL FIELDS ON COMPANIES ----------
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS ice text,
  ADD COLUMN IF NOT EXISTS if_number text,
  ADD COLUMN IF NOT EXISTS rc text,
  ADD COLUMN IF NOT EXISTS tva text,
  ADD COLUMN IF NOT EXISTS contact_email text;

-- ---------- 2. ADD payment_proof_url ON INVOICES ----------
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS payment_proof_url text;

-- ---------- 3. FOREIGN KEYS (DEFERRABLE INITIALLY DEFERRED) ----------
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_orders_company') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_company FOREIGN KEY (company_id)
      REFERENCES public.companies(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_orders_buyer') THEN
    ALTER TABLE public.orders
      ADD CONSTRAINT fk_orders_buyer FOREIGN KEY (buyer_id)
      REFERENCES public.profiles(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_order_items_order') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT fk_order_items_order FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE CASCADE
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_order_items_product') THEN
    ALTER TABLE public.order_items
      ADD CONSTRAINT fk_order_items_product FOREIGN KEY (product_id)
      REFERENCES public.products(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_order') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT fk_invoices_order FOREIGN KEY (order_id)
      REFERENCES public.orders(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_company') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT fk_invoices_company FOREIGN KEY (company_id)
      REFERENCES public.companies(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_invoices_buyer') THEN
    ALTER TABLE public.invoices
      ADD CONSTRAINT fk_invoices_buyer FOREIGN KEY (buyer_id)
      REFERENCES public.profiles(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_payments_invoice') THEN
    ALTER TABLE public.payments
      ADD CONSTRAINT fk_payments_invoice FOREIGN KEY (invoice_id)
      REFERENCES public.invoices(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inv_movements_product') THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT fk_inv_movements_product FOREIGN KEY (product_id)
      REFERENCES public.products(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inv_movements_warehouse') THEN
    ALTER TABLE public.inventory_movements
      ADD CONSTRAINT fk_inv_movements_warehouse FOREIGN KEY (warehouse_id)
      REFERENCES public.warehouses(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inv_levels_product') THEN
    ALTER TABLE public.inventory_levels
      ADD CONSTRAINT fk_inv_levels_product FOREIGN KEY (product_id)
      REFERENCES public.products(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='fk_inv_levels_warehouse') THEN
    ALTER TABLE public.inventory_levels
      ADD CONSTRAINT fk_inv_levels_warehouse FOREIGN KEY (warehouse_id)
      REFERENCES public.warehouses(id) ON DELETE RESTRICT
      DEFERRABLE INITIALLY DEFERRED;
  END IF;
END $$;

-- ---------- 4. SUBSCRIPTION LIMIT FUNCTIONS + TRIGGERS ----------
-- Products limit
CREATE OR REPLACE FUNCTION public.check_products_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
  max_allowed integer;
BEGIN
  SELECT sp.max_products INTO max_allowed
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = NEW.company_id
    AND cs.status IN ('active','trial')
  ORDER BY cs.created_at DESC LIMIT 1;

  IF max_allowed IS NULL THEN
    RETURN NEW; -- no plan or unlimited
  END IF;

  SELECT COUNT(*) INTO current_count
  FROM public.products WHERE company_id = NEW.company_id;

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED: products_limit_%_%', current_count, max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_products_limit ON public.products;
CREATE TRIGGER enforce_products_limit
  BEFORE INSERT ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.check_products_limit();

-- Users limit (vendor + admin roles)
CREATE OR REPLACE FUNCTION public.check_users_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_count integer;
  max_allowed integer;
BEGIN
  IF NEW.company_id IS NULL OR NEW.role NOT IN ('vendor'::app_role, 'admin'::app_role) THEN
    RETURN NEW;
  END IF;

  SELECT sp.max_users INTO max_allowed
  FROM public.company_subscriptions cs
  JOIN public.subscription_plans sp ON sp.id = cs.plan_id
  WHERE cs.company_id = NEW.company_id
    AND cs.status IN ('active','trial')
  ORDER BY cs.created_at DESC LIMIT 1;

  IF max_allowed IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT COUNT(DISTINCT user_id) INTO current_count
  FROM public.user_roles
  WHERE company_id = NEW.company_id
    AND role IN ('vendor'::app_role, 'admin'::app_role);

  IF current_count >= max_allowed THEN
    RAISE EXCEPTION 'LIMIT_EXCEEDED: users_limit_%_%', current_count, max_allowed
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS enforce_users_limit ON public.user_roles;
CREATE TRIGGER enforce_users_limit
  BEFORE INSERT ON public.user_roles
  FOR EACH ROW EXECUTE FUNCTION public.check_users_limit();

-- ---------- 5. PDF GENERATION TRIGGER ----------
CREATE OR REPLACE FUNCTION public.trigger_generate_invoice_pdf()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  fn_url text;
  service_key text;
BEGIN
  IF NEW.status = 'issued'
     AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM 'issued')
     AND NEW.pdf_path IS NULL THEN
    -- Use vault if available; otherwise fall back to setting
    BEGIN
      fn_url := current_setting('app.supabase_url', true) || '/functions/v1/generate-invoice-pdf';
      service_key := current_setting('app.service_role_key', true);
    EXCEPTION WHEN OTHERS THEN
      fn_url := NULL;
    END;

    IF fn_url IS NULL OR fn_url = '/functions/v1/generate-invoice-pdf' THEN
      -- Hardcoded URL as fallback (project-specific)
      fn_url := 'https://jarlejsbrxtrusfjklkg.supabase.co/functions/v1/generate-invoice-pdf';
    END IF;

    PERFORM net.http_post(
      url := fn_url,
      headers := jsonb_build_object(
        'Content-Type','application/json',
        'Authorization','Bearer ' || COALESCE(service_key, '')
      ),
      body := jsonb_build_object('invoice_id', NEW.id)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invoice_issued ON public.invoices;
CREATE TRIGGER on_invoice_issued
  AFTER INSERT OR UPDATE OF status ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.trigger_generate_invoice_pdf();

-- ---------- 6. PAYMENT PROOF NOTIFY VENDOR ----------
CREATE OR REPLACE FUNCTION public.notify_admin_on_payment_proof()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  admin_row record;
  buyer_name text;
BEGIN
  IF NEW.payment_proof_url IS NULL OR NEW.payment_proof_url = '' THEN
    RETURN NEW;
  END IF;
  IF OLD.payment_proof_url IS NOT DISTINCT FROM NEW.payment_proof_url THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(NULLIF(trim(full_name),''),'عميل') INTO buyer_name
  FROM public.profiles WHERE id = NEW.buyer_id;

  FOR admin_row IN
    SELECT user_id FROM public.user_roles
    WHERE role IN ('admin'::app_role,'vendor'::app_role)
      AND company_id = NEW.company_id
  LOOP
    INSERT INTO public.notifications (company_id, recipient_id, kind, title, body, link, metadata)
    VALUES (
      NEW.company_id, admin_row.user_id, 'payment_proof_uploaded',
      'إيصال دفع جديد — ' || NEW.invoice_number,
      'العميل ' || buyer_name || ' رفع إيصال دفع بقيمة ' || to_char(NEW.total_mad,'FM999G999G990D00') || ' MAD',
      '/vendor/invoices?focus=' || NEW.id,
      jsonb_build_object('invoice_id', NEW.id, 'invoice_number', NEW.invoice_number,
                         'total_mad', NEW.total_mad, 'buyer_id', NEW.buyer_id,
                         'payment_proof_url', NEW.payment_proof_url)
    );
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_invoice_payment_proof ON public.invoices;
CREATE TRIGGER on_invoice_payment_proof
  AFTER UPDATE OF payment_proof_url ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.notify_admin_on_payment_proof();

-- ---------- 7. STORAGE POLICIES FOR invoices BUCKET ----------
-- Path layout: {company_id}/{year}/{invoice_number}.pdf
DROP POLICY IF EXISTS "Invoices: company members read own" ON storage.objects;
CREATE POLICY "Invoices: company members read own" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'invoices' AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1]::uuid = public.current_company_id()
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.pdf_path = name AND i.buyer_id = auth.uid()
    )
  )
);

-- ---------- 8. STORAGE POLICIES FOR payment-references BUCKET ----------
-- Path layout: {company_id}/{invoice_id}/{filename}
DROP POLICY IF EXISTS "Payment proofs: buyer upload own" ON storage.objects;
CREATE POLICY "Payment proofs: buyer upload own" ON storage.objects
FOR INSERT TO authenticated WITH CHECK (
  bucket_id = 'payment-references' AND
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id::text = (storage.foldername(name))[2]
      AND i.company_id::text = (storage.foldername(name))[1]
      AND i.buyer_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Payment proofs: read by buyer or company admin" ON storage.objects;
CREATE POLICY "Payment proofs: read by buyer or company admin" ON storage.objects
FOR SELECT TO authenticated USING (
  bucket_id = 'payment-references' AND (
    public.is_super_admin(auth.uid())
    OR (
      (storage.foldername(name))[1]::uuid = public.current_company_id()
      AND public.has_role(auth.uid(), 'admin'::app_role)
    )
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.id::text = (storage.foldername(name))[2]
        AND i.buyer_id = auth.uid()
    )
  )
);
