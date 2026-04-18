-- Backfill missing profile rows for any users who already placed orders.
INSERT INTO public.profiles (id, full_name, territory_id, company_id)
SELECT DISTINCT
  o.distributor_id,
  COALESCE((SELECT u.raw_user_meta_data->>'full_name' FROM auth.users u WHERE u.id = o.distributor_id), ''),
  (SELECT t.id FROM public.territories t WHERE t.company_id = o.company_id ORDER BY t.created_at LIMIT 1),
  o.company_id
FROM public.orders o
LEFT JOIN public.profiles p ON p.id = o.distributor_id
WHERE p.id IS NULL
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_distributor_fk
  FOREIGN KEY (distributor_id)
  REFERENCES public.profiles(id)
  ON DELETE RESTRICT;

NOTIFY pgrst, 'reload schema';