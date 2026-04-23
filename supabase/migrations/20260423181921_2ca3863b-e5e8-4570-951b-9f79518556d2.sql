ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS request_id text;
CREATE UNIQUE INDEX IF NOT EXISTS orders_company_request_id_uniq
  ON public.orders (company_id, request_id)
  WHERE request_id IS NOT NULL;