CREATE OR REPLACE FUNCTION public.level_for_points(pts integer)
RETURNS public.distributor_level
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN pts >= 10000 THEN 'world_team'::public.distributor_level
    WHEN pts >= 4000  THEN 'supervisor'::public.distributor_level
    WHEN pts >= 1500  THEN 'success_builder'::public.distributor_level
    WHEN pts >= 500   THEN 'senior_consultant'::public.distributor_level
    ELSE 'distributor'::public.distributor_level
  END;
$$;

CREATE OR REPLACE FUNCTION public.auto_promote_level()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.level := public.level_for_points(NEW.loyalty_points);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_promote_level ON public.profiles;
CREATE TRIGGER trg_auto_promote_level
BEFORE INSERT OR UPDATE OF loyalty_points ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.auto_promote_level();

-- Backfill existing rows
UPDATE public.profiles
SET level = public.level_for_points(loyalty_points)
WHERE level IS DISTINCT FROM public.level_for_points(loyalty_points);