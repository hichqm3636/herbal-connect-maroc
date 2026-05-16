-- S1.4: Restrict sensitive columns of public.companies from anonymous role
-- RLS row policy "Public can browse vendor directory" stays as-is for is_listed=true,
-- but we tighten column-level SELECT grants so anon cannot read sensitive fields
-- even if they craft a SELECT * query.

REVOKE SELECT ON public.companies FROM anon;

GRANT SELECT (
  id,
  name,
  display_name,
  logo_url,
  brand_color,
  slug,
  is_listed,
  company_type,
  created_at,
  updated_at
) ON public.companies TO anon;

-- authenticated keeps full SELECT (still filtered by row-level policies)
-- so members/admins/super_admins behavior is unchanged.
