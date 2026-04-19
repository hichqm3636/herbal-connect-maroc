-- 1) Convert pricing_tiers to global, deduplicating by name (keep lowest id per name).
-- Build a name -> canonical id map and rewrite references first.

-- Create temp mapping table
CREATE TEMP TABLE _tier_map AS
SELECT
  pt.id AS old_id,
  (SELECT pt2.id FROM public.pricing_tiers pt2 WHERE pt2.name = pt.name ORDER BY pt2.created_at ASC, pt2.id ASC LIMIT 1) AS new_id,
  pt.name,
  pt.discount_percentage
FROM public.pricing_tiers pt;

-- 2) Create company_distributor_pricing BEFORE dropping profiles.pricing_tier_id so we can backfill
CREATE TABLE public.company_distributor_pricing (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  distributor_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pricing_tier_id uuid NOT NULL,
  custom_discount_percent numeric NULL CHECK (custom_discount_percent IS NULL OR (custom_discount_percent >= 0 AND custom_discount_percent <= 100)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (company_id, distributor_id)
);

CREATE INDEX idx_cdp_company ON public.company_distributor_pricing(company_id);
CREATE INDEX idx_cdp_distributor ON public.company_distributor_pricing(distributor_id);
CREATE INDEX idx_cdp_tier ON public.company_distributor_pricing(pricing_tier_id);

-- Backfill from existing profiles.pricing_tier_id (mapped to canonical tier ids)
INSERT INTO public.company_distributor_pricing (company_id, distributor_id, pricing_tier_id)
SELECT p.company_id, p.id, m.new_id
FROM public.profiles p
JOIN _tier_map m ON m.old_id = p.pricing_tier_id
WHERE p.company_id IS NOT NULL AND p.pricing_tier_id IS NOT NULL
ON CONFLICT (company_id, distributor_id) DO NOTHING;

-- 3) Drop FK + column on profiles
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_pricing_tier_id_fkey;
ALTER TABLE public.profiles DROP COLUMN IF EXISTS pricing_tier_id;

-- 4) Delete duplicate tier rows (keep canonical)
DELETE FROM public.pricing_tiers pt
USING _tier_map m
WHERE pt.id = m.old_id AND m.old_id <> m.new_id;

-- 5) Drop company_id from pricing_tiers, rename discount column, drop policies first
DROP POLICY IF EXISTS "Manage company pricing tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "View company pricing tiers" ON public.pricing_tiers;

ALTER TABLE public.pricing_tiers DROP CONSTRAINT IF EXISTS pricing_tiers_company_id_fkey;
ALTER TABLE public.pricing_tiers DROP COLUMN IF EXISTS company_id;
ALTER TABLE public.pricing_tiers RENAME COLUMN discount_percentage TO base_discount_percent;

-- Ensure name uniqueness now that tiers are global
ALTER TABLE public.pricing_tiers ADD CONSTRAINT pricing_tiers_name_unique UNIQUE (name);

-- 6) Add FK from cdp to pricing_tiers
ALTER TABLE public.company_distributor_pricing
  ADD CONSTRAINT cdp_pricing_tier_fk FOREIGN KEY (pricing_tier_id)
  REFERENCES public.pricing_tiers(id) ON DELETE RESTRICT;

-- 7) RLS for pricing_tiers: all authenticated SELECT, super_admin only writes
CREATE POLICY "Anyone authenticated can view tiers"
  ON public.pricing_tiers FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Super admins manage tiers"
  ON public.pricing_tiers FOR ALL
  TO authenticated
  USING (public.is_super_admin(auth.uid()))
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 8) RLS for company_distributor_pricing
ALTER TABLE public.company_distributor_pricing ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View own company distributor pricing"
  ON public.company_distributor_pricing FOR SELECT
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND (
      public.has_role(auth.uid(), 'admin'::app_role)
      OR distributor_id = auth.uid()
    ))
  );

CREATE POLICY "Company admins manage distributor pricing"
  ON public.company_distributor_pricing FOR ALL
  TO authenticated
  USING (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  )
  WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::app_role))
  );

-- 9) updated_at trigger
CREATE TRIGGER trg_cdp_updated_at
  BEFORE UPDATE ON public.company_distributor_pricing
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();