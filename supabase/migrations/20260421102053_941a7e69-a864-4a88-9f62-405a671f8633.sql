CREATE OR REPLACE FUNCTION public.provision_company(_name text, _display_name text, _admin_user_id uuid, _brand_color text DEFAULT '#16a34a'::text, _logo_url text DEFAULT NULL::text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  new_company_id uuid;
  default_territory_id uuid;
  computed_slug text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can provision companies';
  END IF;

  -- Derive a URL-friendly slug from _name: lowercase, spaces -> '-', strip invalid chars.
  computed_slug := lower(_name);
  computed_slug := regexp_replace(computed_slug, '\s+', '-', 'g');
  computed_slug := regexp_replace(computed_slug, '[^a-z0-9-]', '', 'g');
  computed_slug := regexp_replace(computed_slug, '-+', '-', 'g');
  computed_slug := trim(both '-' from computed_slug);
  IF computed_slug IS NULL OR computed_slug = '' THEN
    computed_slug := 'company-' || substr(gen_random_uuid()::text, 1, 8);
  END IF;

  INSERT INTO public.companies (name, slug, display_name, brand_color, logo_url)
  VALUES (_name, computed_slug, COALESCE(NULLIF(_display_name, ''), _name), _brand_color, _logo_url)
  RETURNING id INTO new_company_id;

  INSERT INTO public.territories (company_id, name, slug)
  VALUES (new_company_id, 'غير محدد', 'unassigned-' || substr(new_company_id::text, 1, 8))
  RETURNING id INTO default_territory_id;

  INSERT INTO public.profiles (id, full_name, territory_id, company_id)
  VALUES (_admin_user_id, '', default_territory_id, new_company_id)
  ON CONFLICT (id) DO UPDATE
    SET company_id = EXCLUDED.company_id,
        territory_id = EXCLUDED.territory_id;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (_admin_user_id, 'admin', new_company_id)
  ON CONFLICT DO NOTHING;

  RETURN new_company_id;
END;
$function$;