-- 1) Add 'partner' to the app_role enum (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum e
    JOIN pg_type t ON t.oid = e.enumtypid
    WHERE t.typname = 'app_role' AND e.enumlabel = 'partner'
  ) THEN
    ALTER TYPE public.app_role ADD VALUE 'partner';
  END IF;
END$$;

-- 2) Link orders to a partner (nullable; existing orders unaffected)
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS partner_id uuid;

CREATE INDEX IF NOT EXISTS idx_orders_partner_id ON public.orders(partner_id);

-- 3) Commission status enum
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'commission_status') THEN
    CREATE TYPE public.commission_status AS ENUM ('pending','approved','paid','rejected');
  END IF;
END$$;

-- 4) partner_commissions table
CREATE TABLE IF NOT EXISTS public.partner_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  partner_id uuid NOT NULL,                 -- references auth user (partner)
  order_id uuid NOT NULL,
  base_amount_mad numeric NOT NULL DEFAULT 0,   -- amount commission is computed from
  rate_percent numeric NOT NULL DEFAULT 0,      -- e.g. 10.00 = 10%
  amount_mad numeric NOT NULL DEFAULT 0,        -- final commission amount snapshot
  status public.commission_status NOT NULL DEFAULT 'pending',
  notes text,
  approved_at timestamptz,
  approved_by uuid,
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_partner_commissions_company ON public.partner_commissions(company_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_partner ON public.partner_commissions(partner_id);
CREATE INDEX IF NOT EXISTS idx_partner_commissions_order ON public.partner_commissions(order_id);
CREATE UNIQUE INDEX IF NOT EXISTS uniq_partner_commission_per_order
  ON public.partner_commissions(order_id, partner_id);

-- updated_at trigger (reuses existing helper if present)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at_column') THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at_column()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql SET search_path = public;
  END IF;
END$$;

DROP TRIGGER IF EXISTS trg_partner_commissions_updated_at ON public.partner_commissions;
CREATE TRIGGER trg_partner_commissions_updated_at
BEFORE UPDATE ON public.partner_commissions
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5) RLS
ALTER TABLE public.partner_commissions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Partner views own commissions" ON public.partner_commissions;
CREATE POLICY "Partner views own commissions"
ON public.partner_commissions
FOR SELECT
TO authenticated
USING (
  partner_id = auth.uid()
  OR is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

DROP POLICY IF EXISTS "Company admins manage commissions" ON public.partner_commissions;
CREATE POLICY "Company admins manage commissions"
ON public.partner_commissions
FOR ALL
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);