-- Products: track external (WooCommerce) provenance
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'internal';

CREATE INDEX IF NOT EXISTS idx_products_external_id
  ON public.products(external_id) WHERE external_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_products_source
  ON public.products(source);

-- Orders: track outbound sync to supplier
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS external_status text,
  ADD COLUMN IF NOT EXISTS sync_error text;

CREATE INDEX IF NOT EXISTS idx_orders_external_id
  ON public.orders(external_id) WHERE external_id IS NOT NULL;