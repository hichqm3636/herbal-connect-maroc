-- =========================================================================
-- INVOICING MODULE
-- =========================================================================

-- 1) Status enum
DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM ('draft', 'issued', 'paid', 'cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) Per-company per-year sequence tracker
CREATE TABLE IF NOT EXISTS public.invoice_sequences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  year int NOT NULL,
  next_number int NOT NULL DEFAULT 1,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (company_id, year)
);

ALTER TABLE public.invoice_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Read sequences in company"
  ON public.invoice_sequences FOR SELECT
  USING (is_super_admin(auth.uid()) OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role)));

-- 3) Invoices table
CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE RESTRICT,
  distributor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  invoice_number text NOT NULL,
  status public.invoice_status NOT NULL DEFAULT 'issued',
  issue_date date NOT NULL DEFAULT (now() AT TIME ZONE 'UTC')::date,
  due_date date,
  subtotal_mad numeric(12,2) NOT NULL DEFAULT 0,
  vat_rate numeric(5,2) NOT NULL DEFAULT 20.00,
  vat_amount_mad numeric(12,2) NOT NULL DEFAULT 0,
  total_mad numeric(12,2) NOT NULL DEFAULT 0,
  payment_method text,
  paid_at timestamptz,
  notes text,
  pdf_path text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, invoice_number),
  UNIQUE (order_id)
);

CREATE INDEX IF NOT EXISTS idx_invoices_company ON public.invoices(company_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_distributor ON public.invoices(distributor_id, issue_date DESC);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON public.invoices(status);

ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View invoices in company"
  ON public.invoices FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND (
      auth.uid() = distributor_id OR has_role(auth.uid(), 'admin'::app_role)
    ))
  );

CREATE POLICY "Company admins manage invoices"
  ON public.invoices FOR ALL
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- 4) Auto-assign sequential invoice number
CREATE OR REPLACE FUNCTION public.assign_invoice_number()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  yr int;
  n int;
BEGIN
  IF NEW.invoice_number IS NOT NULL AND NEW.invoice_number <> '' THEN
    RETURN NEW;
  END IF;

  yr := EXTRACT(YEAR FROM NEW.issue_date)::int;

  INSERT INTO public.invoice_sequences (company_id, year, next_number)
  VALUES (NEW.company_id, yr, 2)
  ON CONFLICT (company_id, year)
  DO UPDATE SET next_number = invoice_sequences.next_number + 1, updated_at = now()
  RETURNING next_number - 1 INTO n;

  NEW.invoice_number := 'INV-' || yr || '-' || lpad(n::text, 5, '0');
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_assign_invoice_number ON public.invoices;
CREATE TRIGGER trg_assign_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.assign_invoice_number();

-- 5) Updated-at trigger
DROP TRIGGER IF EXISTS trg_invoices_updated_at ON public.invoices;
CREATE TRIGGER trg_invoices_updated_at
  BEFORE UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 6) Consistency: invoice's order/distributor must belong to invoice's company
CREATE OR REPLACE FUNCTION public.enforce_invoice_consistency()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  ord_company uuid;
  ord_distributor uuid;
BEGIN
  SELECT company_id, distributor_id INTO ord_company, ord_distributor
  FROM public.orders WHERE id = NEW.order_id;

  IF ord_company IS DISTINCT FROM NEW.company_id THEN
    RAISE EXCEPTION 'invoice company must match order company';
  END IF;
  IF ord_distributor IS DISTINCT FROM NEW.distributor_id THEN
    RAISE EXCEPTION 'invoice distributor must match order distributor';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_invoice_consistency ON public.invoices;
CREATE TRIGGER trg_enforce_invoice_consistency
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.enforce_invoice_consistency();

-- 7) Storage bucket for PDFs (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('invoices', 'invoices', false)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Company admins upload invoice PDFs"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'invoices'
    AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Company admins update invoice PDFs"
  ON storage.objects FOR UPDATE
  USING (
    bucket_id = 'invoices'
    AND (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'::app_role))
  );

CREATE POLICY "Read invoice PDFs in company"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'invoices'
    AND (
      is_super_admin(auth.uid())
      OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE i.pdf_path = storage.objects.name
          AND (
            (i.company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
            OR i.distributor_id = auth.uid()
          )
      )
    )
  );