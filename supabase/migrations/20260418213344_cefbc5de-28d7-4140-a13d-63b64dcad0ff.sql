ALTER TABLE public.products
ADD COLUMN IF NOT EXISTS low_stock_threshold integer NOT NULL DEFAULT 5;