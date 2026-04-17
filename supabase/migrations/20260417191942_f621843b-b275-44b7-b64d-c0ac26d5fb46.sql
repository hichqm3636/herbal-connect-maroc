-- Sequence for order numbers
CREATE SEQUENCE IF NOT EXISTS public.orders_number_seq START 1;

-- Add order_number column
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS order_number text UNIQUE;

-- Backfill existing rows in created_at order
WITH ordered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at ASC) AS rn
  FROM public.orders
  WHERE order_number IS NULL
)
UPDATE public.orders o
SET order_number = 'ORD-' || LPAD(ordered.rn::text, 4, '0')
FROM ordered
WHERE o.id = ordered.id;

-- Advance sequence past backfilled values
SELECT setval(
  'public.orders_number_seq',
  GREATEST((SELECT COUNT(*) FROM public.orders), 1)
);

-- Trigger to auto-assign order_number on insert
CREATE OR REPLACE FUNCTION public.assign_order_number()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.order_number IS NULL THEN
    NEW.order_number := 'ORD-' || LPAD(nextval('public.orders_number_seq')::text, 4, '0');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS set_order_number ON public.orders;
CREATE TRIGGER set_order_number
BEFORE INSERT ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.assign_order_number();

-- Make column NOT NULL now that all rows are populated
ALTER TABLE public.orders ALTER COLUMN order_number SET NOT NULL;