ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS pack_size integer NOT NULL DEFAULT 1;