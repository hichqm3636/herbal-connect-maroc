CREATE OR REPLACE FUNCTION public.default_commission_rate()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$ SELECT 10.00::numeric $$;