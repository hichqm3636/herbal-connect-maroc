-- Remove duplicate FKs on public.orders to fix PostgREST relationship ambiguity.
-- Keep one canonical FK per column.

ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_company;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS fk_orders_buyer;
ALTER TABLE public.orders DROP CONSTRAINT IF EXISTS orders_distributor_id_fkey;