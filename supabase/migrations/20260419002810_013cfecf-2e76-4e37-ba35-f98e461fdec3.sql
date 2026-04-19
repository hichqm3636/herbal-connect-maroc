-- Add product cost (admin-only field, used to compute profit margins).
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS cost numeric;

-- Snapshot of product cost at order time, so historical margins remain correct
-- even if the admin updates cost later.
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS cost_snapshot numeric;

COMMENT ON COLUMN public.products.cost IS 'Internal product cost (MAD). Used to compute profit margins. Not exposed to non-admin partners.';
COMMENT ON COLUMN public.order_items.cost_snapshot IS 'Snapshot of products.cost at the moment the order was placed. Drives historical profit calculations.';