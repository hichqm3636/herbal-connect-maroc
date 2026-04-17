CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  default_territory uuid;
BEGIN
  SELECT id INTO default_territory FROM public.territories WHERE slug = 'unassigned' LIMIT 1;

  INSERT INTO public.profiles (id, full_name, phone, city, territory_id)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', ''),
    NEW.raw_user_meta_data ->> 'phone',
    NEW.raw_user_meta_data ->> 'city',
    default_territory
  );

  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'distributor');

  RETURN NEW;
END;
$function$;