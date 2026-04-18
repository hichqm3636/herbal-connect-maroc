
-- Pricing tiers table
CREATE TABLE public.pricing_tiers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  name text NOT NULL,
  discount_percentage numeric NOT NULL DEFAULT 0 CHECK (discount_percentage >= 0 AND discount_percentage <= 100),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, name)
);

CREATE INDEX idx_pricing_tiers_company ON public.pricing_tiers(company_id);

ALTER TABLE public.pricing_tiers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View company pricing tiers"
  ON public.pricing_tiers
  FOR SELECT
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR company_id = public.current_company_id());

CREATE POLICY "Manage company pricing tiers"
  ON public.pricing_tiers
  FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()) OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)))
  WITH CHECK (public.is_super_admin(auth.uid()) OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role)));

CREATE TRIGGER update_pricing_tiers_updated_at
  BEFORE UPDATE ON public.pricing_tiers
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Link distributor profiles to a pricing tier
ALTER TABLE public.profiles
  ADD COLUMN pricing_tier_id uuid REFERENCES public.pricing_tiers(id) ON DELETE SET NULL;

CREATE INDEX idx_profiles_pricing_tier ON public.profiles(pricing_tier_id);
