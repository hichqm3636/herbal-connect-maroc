
-- 1) Add slug to companies (unique, backfilled from name)
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS slug text;

UPDATE public.companies
SET slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
WHERE slug IS NULL;

ALTER TABLE public.companies
  ALTER COLUMN slug SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS companies_slug_key ON public.companies (slug);

-- 2) Insert default Herbialife company only if none exist
INSERT INTO public.companies (name, display_name, slug)
SELECT 'Herbialife', 'Herbialife', 'herbialife'
WHERE NOT EXISTS (SELECT 1 FROM public.companies);

-- 3) Add company_id to pricing_tiers
ALTER TABLE public.pricing_tiers
  ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE;

-- Backfill: assign all existing global tiers to the first available company
UPDATE public.pricing_tiers
SET company_id = (SELECT id FROM public.companies ORDER BY created_at ASC LIMIT 1)
WHERE company_id IS NULL;

-- Make company_id required going forward
ALTER TABLE public.pricing_tiers
  ALTER COLUMN company_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS pricing_tiers_company_id_idx ON public.pricing_tiers (company_id);

-- 4) Update RLS on pricing_tiers to be company-scoped
DROP POLICY IF EXISTS "Anyone authenticated can view tiers" ON public.pricing_tiers;
DROP POLICY IF EXISTS "Super admins manage tiers" ON public.pricing_tiers;

CREATE POLICY "View company pricing tiers"
ON public.pricing_tiers
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR company_id = public.current_company_id()
);

CREATE POLICY "Company admins manage pricing tiers"
ON public.pricing_tiers
FOR ALL
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
)
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (company_id = public.current_company_id() AND public.has_role(auth.uid(), 'admin'::public.app_role))
);
