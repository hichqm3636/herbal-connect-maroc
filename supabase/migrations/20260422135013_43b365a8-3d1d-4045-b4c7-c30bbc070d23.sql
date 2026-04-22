ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS supplier_partner_id uuid NULL
  REFERENCES public.partners(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_orders_supplier_partner_id
  ON public.orders(supplier_partner_id)
  WHERE supplier_partner_id IS NOT NULL;