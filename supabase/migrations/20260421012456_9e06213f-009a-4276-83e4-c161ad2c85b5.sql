-- Allow global pricing tiers (company_id IS NULL = platform-wide)
ALTER TABLE public.pricing_tiers ALTER COLUMN company_id DROP NOT NULL;

-- Update SELECT policy so company members see their own tiers AND global tiers
DROP POLICY IF EXISTS "View company pricing tiers" ON public.pricing_tiers;
CREATE POLICY "View company and global pricing tiers"
ON public.pricing_tiers
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR company_id IS NULL
  OR company_id = current_company_id()
);

-- Update management policy: company admins manage their own tiers,
-- super admins manage global (NULL) tiers
DROP POLICY IF EXISTS "Company admins manage pricing tiers" ON public.pricing_tiers;

CREATE POLICY "Super admins manage global pricing tiers"
ON public.pricing_tiers
FOR ALL
TO authenticated
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Company admins manage own pricing tiers"
ON public.pricing_tiers
FOR ALL
TO authenticated
USING (
  company_id IS NOT NULL
  AND company_id = current_company_id()
  AND has_role(auth.uid(), 'admin'::app_role)
)
WITH CHECK (
  company_id IS NOT NULL
  AND company_id = current_company_id()
  AND has_role(auth.uid(), 'admin'::app_role)
);