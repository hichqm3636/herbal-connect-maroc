-- 1. Add is_listed flag (controls visibility in the public directory).
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS is_listed boolean NOT NULL DEFAULT true;

-- 2. Allow anyone (anon + authenticated) to read listed vendors.
DROP POLICY IF EXISTS "Public can browse vendor directory" ON public.companies;
CREATE POLICY "Public can browse vendor directory"
ON public.companies
FOR SELECT
TO anon, authenticated
USING (is_listed = true);