-- 1. Drop any existing unique constraint on sku (keep sku as a non-unique column)
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_unique;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_sku_key;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_company_sku_unique;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_company_id_sku_key;

-- Drop any unique indexes on sku as well
DROP INDEX IF EXISTS public.products_sku_unique;
DROP INDEX IF EXISTS public.products_sku_key;
DROP INDEX IF EXISTS public.products_company_sku_unique;
DROP INDEX IF EXISTS public.products_company_id_sku_key;

-- 2. Ensure uniqueness is based on (company_id, external_id)
-- Use a partial unique index so multiple rows with NULL external_id are allowed
DROP INDEX IF EXISTS public.products_external_unique;
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_external_unique;

CREATE UNIQUE INDEX products_external_unique
  ON public.products (company_id, external_id)
  WHERE external_id IS NOT NULL;