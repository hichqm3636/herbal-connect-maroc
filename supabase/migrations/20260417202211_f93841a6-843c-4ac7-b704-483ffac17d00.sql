ALTER TABLE public.products ADD COLUMN IF NOT EXISTS sku text;
CREATE UNIQUE INDEX IF NOT EXISTS products_sku_unique ON public.products (sku) WHERE sku IS NOT NULL;