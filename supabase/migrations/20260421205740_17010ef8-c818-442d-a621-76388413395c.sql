-- =========================================================
-- PHASE 2: BILLING ENGINE
-- =========================================================

-- 1) Extend invoice_status enum with 'overdue'
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'invoice_status' AND e.enumlabel = 'overdue'
  ) THEN
    ALTER TYPE public.invoice_status ADD VALUE 'overdue';
  END IF;
END$$;

-- 2) Extend invoices: currency + issued_at (keep existing financial columns)
ALTER TABLE public.invoices
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'MAD',
  ADD COLUMN IF NOT EXISTS issued_at timestamptz;

UPDATE public.invoices SET issued_at = created_at WHERE issued_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_invoices_company    ON public.invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_invoices_order      ON public.invoices(order_id);
CREATE INDEX IF NOT EXISTS idx_invoices_distributor ON public.invoices(distributor_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status     ON public.invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_due_date   ON public.invoices(due_date);

-- =========================================================
-- 3) invoice_items
-- =========================================================
CREATE TABLE IF NOT EXISTS public.invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  description text NOT NULL DEFAULT '',
  quantity numeric NOT NULL CHECK (quantity > 0),
  unit_price numeric NOT NULL CHECK (unit_price >= 0),
  total_price numeric NOT NULL CHECK (total_price >= 0),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_invoice_items_company ON public.invoice_items(company_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice ON public.invoice_items(invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoice_items_product ON public.invoice_items(product_id);

ALTER TABLE public.invoice_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View invoice items in company"
  ON public.invoice_items FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.current_company_id()
      AND EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.id = invoice_items.invoice_id
          AND (auth.uid() = i.distributor_id OR public.has_role(auth.uid(), 'admin'::public.app_role))
      )
    )
  );

CREATE POLICY "Company admins manage invoice items"
  ON public.invoice_items FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- Enforce invoice/company consistency
CREATE OR REPLACE FUNCTION public.enforce_invoice_item_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  inv_company uuid;
BEGIN
  SELECT company_id INTO inv_company FROM public.invoices WHERE id = NEW.invoice_id;
  IF inv_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'invoice_items.company_id must match invoices.company_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_invoice_item_consistency ON public.invoice_items;
CREATE TRIGGER trg_invoice_item_consistency
BEFORE INSERT OR UPDATE ON public.invoice_items
FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_item_consistency();

-- =========================================================
-- 4) payments
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'payment_method') THEN
    CREATE TYPE public.payment_method AS ENUM ('cash','bank_transfer','card','stripe','manual');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  amount numeric NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'MAD',
  payment_method public.payment_method NOT NULL DEFAULT 'manual',
  payment_reference text,
  paid_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_company ON public.payments(company_id);
CREATE INDEX IF NOT EXISTS idx_payments_invoice ON public.payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_payments_paid_at ON public.payments(paid_at);

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View payments in company"
  ON public.payments FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (
      company_id = public.current_company_id()
      AND (
        public.has_role(auth.uid(), 'admin'::public.app_role)
        OR EXISTS (
          SELECT 1 FROM public.invoices i
          WHERE i.id = payments.invoice_id AND i.distributor_id = auth.uid()
        )
      )
    )
  );

CREATE POLICY "Company admins manage payments"
  ON public.payments FOR ALL TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
  );

-- Enforce invoice/company consistency on payment
CREATE OR REPLACE FUNCTION public.enforce_payment_consistency()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  inv_company uuid;
BEGIN
  SELECT company_id INTO inv_company FROM public.invoices WHERE id = NEW.invoice_id;
  IF inv_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'payments.company_id must match invoices.company_id';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_payment_consistency ON public.payments;
CREATE TRIGGER trg_payment_consistency
BEFORE INSERT OR UPDATE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.enforce_payment_consistency();

-- Auto-mark invoice as paid when payments cover the total
CREATE OR REPLACE FUNCTION public.update_invoice_paid_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  inv_id uuid;
  inv_total numeric;
  paid_sum numeric;
BEGIN
  inv_id := COALESCE(NEW.invoice_id, OLD.invoice_id);
  SELECT total_mad INTO inv_total FROM public.invoices WHERE id = inv_id;
  SELECT COALESCE(SUM(amount),0) INTO paid_sum FROM public.payments WHERE invoice_id = inv_id;

  IF inv_total IS NOT NULL AND paid_sum >= inv_total THEN
    UPDATE public.invoices
    SET status = 'paid', paid_at = COALESCE(paid_at, now())
    WHERE id = inv_id AND status <> 'paid';
  END IF;
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_payments_update_invoice_status ON public.payments;
CREATE TRIGGER trg_payments_update_invoice_status
AFTER INSERT OR UPDATE OR DELETE ON public.payments
FOR EACH ROW EXECUTE FUNCTION public.update_invoice_paid_status();

-- =========================================================
-- 5) subscription_plans
-- =========================================================
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  monthly_price numeric NOT NULL DEFAULT 0 CHECK (monthly_price >= 0),
  currency text NOT NULL DEFAULT 'MAD',
  max_products integer,
  max_clients integer,
  max_users integer,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_subscription_plans_active ON public.subscription_plans(active);

ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated views plans"
  ON public.subscription_plans FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "Super admins manage plans"
  ON public.subscription_plans FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_subscription_plans_updated_at ON public.subscription_plans;
CREATE TRIGGER trg_subscription_plans_updated_at
BEFORE UPDATE ON public.subscription_plans
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- =========================================================
-- 6) company_subscriptions
-- =========================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'subscription_status') THEN
    CREATE TYPE public.subscription_status AS ENUM ('trial','active','past_due','cancelled','expired');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.company_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
  status public.subscription_status NOT NULL DEFAULT 'trial',
  trial_ends_at timestamptz,
  started_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_company_subscription_one_active
  ON public.company_subscriptions(company_id)
  WHERE status IN ('trial','active','past_due');

CREATE INDEX IF NOT EXISTS idx_company_subscriptions_company ON public.company_subscriptions(company_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_plan    ON public.company_subscriptions(plan_id);
CREATE INDEX IF NOT EXISTS idx_company_subscriptions_status  ON public.company_subscriptions(status);

ALTER TABLE public.company_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company subscription"
  ON public.company_subscriptions FOR SELECT TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR company_id = public.current_company_id()
  );

CREATE POLICY "Super admins manage subscriptions"
  ON public.company_subscriptions FOR ALL TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

DROP TRIGGER IF EXISTS trg_company_subscriptions_updated_at ON public.company_subscriptions;
CREATE TRIGGER trg_company_subscriptions_updated_at
BEFORE UPDATE ON public.company_subscriptions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
