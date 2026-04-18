ALTER TABLE public.territories DROP CONSTRAINT IF EXISTS territories_name_key;
DROP INDEX IF EXISTS public.territories_name_key;
CREATE UNIQUE INDEX IF NOT EXISTS territories_company_name_key ON public.territories (company_id, lower(name));