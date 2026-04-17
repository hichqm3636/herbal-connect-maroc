CREATE OR REPLACE FUNCTION public.level_for_points(pts integer)
RETURNS public.distributor_level
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN pts >= 10000 THEN 'world_team'::public.distributor_level
    WHEN pts >= 4000  THEN 'supervisor'::public.distributor_level
    WHEN pts >= 1500  THEN 'success_builder'::public.distributor_level
    WHEN pts >= 500   THEN 'senior_consultant'::public.distributor_level
    ELSE 'distributor'::public.distributor_level
  END;
$$;