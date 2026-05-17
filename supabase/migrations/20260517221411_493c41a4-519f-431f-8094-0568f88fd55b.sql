
-- Phase 1: Restore the multi-role invariant on user_roles.

-- 1) Drop the over-restrictive UNIQUE(user_id) constraint that prevented a
--    company creator from holding both `vendor` and `admin` roles. The
--    marketplace partial unique index (vendor XOR client) and the
--    UNIQUE(user_id, role) constraint remain in place.
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS one_role_per_user;
DROP INDEX IF EXISTS public.one_role_per_user;

-- 2) Backfill: for every company that has at least one `vendor` role but no
--    `admin` role, insert a matching `admin` role for each of its vendors.
INSERT INTO public.user_roles (user_id, role, company_id)
SELECT v.user_id, 'admin'::app_role, v.company_id
FROM public.user_roles v
WHERE v.role = 'vendor'
  AND v.company_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles a
    WHERE a.company_id = v.company_id AND a.role = 'admin'
  )
ON CONFLICT (user_id, role) DO NOTHING;

-- 3) Defensive trigger: whenever a `vendor` role is inserted, ensure the
--    same user also has a matching `admin` role for the same company.
--    This restores the invariant going forward without widening RLS.
CREATE OR REPLACE FUNCTION public.ensure_vendor_has_admin_role()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.role = 'vendor' AND NEW.company_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = NEW.user_id
        AND company_id = NEW.company_id
        AND role = 'admin'
    ) THEN
      RAISE WARNING 'Vendor role inserted without matching admin role (user=%, company=%); auto-provisioning admin.',
        NEW.user_id, NEW.company_id;
      INSERT INTO public.user_roles (user_id, role, company_id)
      VALUES (NEW.user_id, 'admin', NEW.company_id)
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_roles_ensure_admin ON public.user_roles;
CREATE TRIGGER trg_user_roles_ensure_admin
AFTER INSERT ON public.user_roles
FOR EACH ROW EXECUTE FUNCTION public.ensure_vendor_has_admin_role();

-- 4) Database-side invariant assertion. Returns the set of tenants that
--    have vendor users but no admin role. CI calls this via service-role
--    and fails the build if any rows are returned.
CREATE OR REPLACE FUNCTION public.assert_tenant_admin_invariant()
RETURNS TABLE(company_id uuid, vendor_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.company_id, count(*)::bigint AS vendor_count
  FROM public.user_roles v
  WHERE v.role = 'vendor'
    AND v.company_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1 FROM public.user_roles a
      WHERE a.company_id = v.company_id AND a.role = 'admin'
    )
  GROUP BY v.company_id;
$$;

REVOKE ALL ON FUNCTION public.assert_tenant_admin_invariant() FROM public, anon, authenticated;

-- 5) Harden the signup RPC: switch the admin insert from `ON CONFLICT DO
--    NOTHING` (which silently swallowed the previous UNIQUE(user_id)
--    violation) to an explicit `(user_id, role)` conflict target, and
--    warn loudly if the admin row ends up missing after provisioning.
CREATE OR REPLACE FUNCTION public.public_signup_company(
  _company_name text,
  _company_slug text,
  _admin_full_name text,
  _admin_email text,
  _admin_password text,
  _brand_color text DEFAULT '#16a34a'::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'auth', 'extensions'
AS $function$
DECLARE
  reserved text[] := ARRAY['app','www','api','admin','super','nexora','root','platform','dashboard','login','signup'];
  clean_slug text;
  clean_email text;
  new_user_id uuid;
  new_company_id uuid;
  encrypted_pw text;
BEGIN
  IF _company_name IS NULL OR length(trim(_company_name)) < 2 THEN
    RAISE EXCEPTION 'اسم الشركة قصير جداً' USING ERRCODE = 'check_violation';
  END IF;

  clean_slug := lower(coalesce(_company_slug, _company_name));
  clean_slug := regexp_replace(clean_slug, '\s+', '-', 'g');
  clean_slug := regexp_replace(clean_slug, '[^a-z0-9-]', '', 'g');
  clean_slug := regexp_replace(clean_slug, '-+', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);
  IF clean_slug IS NULL OR length(clean_slug) < 2 THEN
    RAISE EXCEPTION 'النطاق الفرعي غير صالح' USING ERRCODE = 'check_violation';
  END IF;
  IF clean_slug = ANY(reserved) THEN
    RAISE EXCEPTION 'هذا النطاق محجوز' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE slug = clean_slug OR name = clean_slug) THEN
    RAISE EXCEPTION 'النطاق "%" مستخدم بالفعل', clean_slug USING ERRCODE = 'unique_violation';
  END IF;

  clean_email := lower(trim(_admin_email));
  IF clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'بريد المسؤول غير صالح' USING ERRCODE = 'check_violation';
  END IF;
  IF _admin_password IS NULL OR length(_admin_password) < 8
     OR _admin_password !~ '[A-Za-z]' OR _admin_password !~ '[0-9]' THEN
    RAISE EXCEPTION 'كلمة المرور يجب 8 أحرف على الأقل وحروف وأرقام' USING ERRCODE = 'check_violation';
  END IF;
  IF _admin_full_name IS NULL OR length(trim(_admin_full_name)) < 2 THEN
    RAISE EXCEPTION 'اسم المسؤول مطلوب' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = clean_email) THEN
    RAISE EXCEPTION 'البريد % مستخدم بالفعل', clean_email USING ERRCODE = 'unique_violation';
  END IF;

  new_user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(_admin_password, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
    confirmation_token, recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id, 'authenticated', 'authenticated', clean_email,
    encrypted_pw, now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name', trim(_admin_full_name)),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', clean_email, 'email_verified', true),
    'email', clean_email, now(), now(), now()
  );

  INSERT INTO public.companies (name, slug, display_name, brand_color)
  VALUES (clean_slug, clean_slug, trim(_company_name), coalesce(_brand_color, '#16a34a'))
  RETURNING id INTO new_company_id;

  INSERT INTO public.profiles (id, full_name, company_id)
  VALUES (new_user_id, trim(_admin_full_name), new_company_id);

  -- Vendor tenant invariant: creator MUST hold both vendor + admin roles.
  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new_user_id, 'vendor', new_company_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new_user_id, 'admin', new_company_id)
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Defensive post-condition: log loudly if the admin row is missing.
  IF NOT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE company_id = new_company_id AND role = 'admin'
  ) THEN
    RAISE WARNING 'Vendor tenant % provisioned without admin role (user=%)', new_company_id, new_user_id;
  END IF;

  RETURN jsonb_build_object(
    'company_id', new_company_id,
    'admin_user_id', new_user_id,
    'slug', clean_slug
  );
END;
$function$;
