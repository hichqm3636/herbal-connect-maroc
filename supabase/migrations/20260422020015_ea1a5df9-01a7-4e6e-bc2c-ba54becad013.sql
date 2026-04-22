-- Public self-service company signup. Runs as SECURITY DEFINER so anonymous
-- visitors can call it without bypassing other RLS rules.
CREATE OR REPLACE FUNCTION public.public_signup_company(
  _company_name text,
  _company_slug text,
  _admin_full_name text,
  _admin_email text,
  _admin_password text,
  _brand_color text DEFAULT '#16a34a'
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
  default_territory_id uuid;
  encrypted_pw text;
BEGIN
  -- Validate company name
  IF _company_name IS NULL OR length(trim(_company_name)) < 2 THEN
    RAISE EXCEPTION 'اسم الشركة قصير جداً' USING ERRCODE = 'check_violation';
  END IF;

  -- Normalize slug
  clean_slug := lower(coalesce(_company_slug, _company_name));
  clean_slug := regexp_replace(clean_slug, '\s+', '-', 'g');
  clean_slug := regexp_replace(clean_slug, '[^a-z0-9-]', '', 'g');
  clean_slug := regexp_replace(clean_slug, '-+', '-', 'g');
  clean_slug := trim(both '-' from clean_slug);
  IF clean_slug IS NULL OR length(clean_slug) < 2 THEN
    RAISE EXCEPTION 'النطاق الفرعي غير صالح' USING ERRCODE = 'check_violation';
  END IF;
  IF clean_slug = ANY(reserved) THEN
    RAISE EXCEPTION 'هذا النطاق محجوز، الرجاء اختيار اسم آخر' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM public.companies WHERE slug = clean_slug OR name = clean_slug) THEN
    RAISE EXCEPTION 'النطاق "%" مستخدم بالفعل' , clean_slug USING ERRCODE = 'unique_violation';
  END IF;

  -- Validate admin email & password
  clean_email := lower(trim(_admin_email));
  IF clean_email !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' THEN
    RAISE EXCEPTION 'بريد المسؤول غير صالح' USING ERRCODE = 'check_violation';
  END IF;
  IF _admin_password IS NULL OR length(_admin_password) < 8
     OR _admin_password !~ '[A-Za-z]' OR _admin_password !~ '[0-9]' THEN
    RAISE EXCEPTION 'كلمة المرور يجب أن تكون 8 أحرف على الأقل وتحتوي على حروف وأرقام' USING ERRCODE = 'check_violation';
  END IF;
  IF _admin_full_name IS NULL OR length(trim(_admin_full_name)) < 2 THEN
    RAISE EXCEPTION 'اسم المسؤول مطلوب' USING ERRCODE = 'check_violation';
  END IF;
  IF EXISTS (SELECT 1 FROM auth.users WHERE email = clean_email) THEN
    RAISE EXCEPTION 'البريد % مستخدم بالفعل', clean_email USING ERRCODE = 'unique_violation';
  END IF;

  -- Create auth user (email pre-confirmed for instant access)
  new_user_id := gen_random_uuid();
  encrypted_pw := extensions.crypt(_admin_password, extensions.gen_salt('bf'));

  INSERT INTO auth.users (
    instance_id, id, aud, role, email,
    encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data,
    created_at, updated_at, confirmation_token,
    recovery_token, email_change_token_new, email_change
  ) VALUES (
    '00000000-0000-0000-0000-000000000000',
    new_user_id, 'authenticated', 'authenticated',
    clean_email,
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
    'email', clean_email,
    now(), now(), now()
  );

  -- Create company
  INSERT INTO public.companies (name, slug, display_name, brand_color)
  VALUES (clean_slug, clean_slug, trim(_company_name), coalesce(_brand_color, '#16a34a'))
  RETURNING id INTO new_company_id;

  -- Default "unassigned" territory
  INSERT INTO public.territories (company_id, name, slug)
  VALUES (new_company_id, 'غير محدد', 'unassigned-' || substr(new_company_id::text, 1, 8))
  RETURNING id INTO default_territory_id;

  -- Profile + admin role
  INSERT INTO public.profiles (id, full_name, territory_id, company_id)
  VALUES (new_user_id, trim(_admin_full_name), default_territory_id, new_company_id);

  INSERT INTO public.user_roles (user_id, role, company_id)
  VALUES (new_user_id, 'admin', new_company_id);

  RETURN jsonb_build_object(
    'company_id', new_company_id,
    'admin_user_id', new_user_id,
    'slug', clean_slug
  );
END;
$function$;

-- Allow anonymous + authenticated callers to invoke the signup function
GRANT EXECUTE ON FUNCTION public.public_signup_company(text, text, text, text, text, text) TO anon, authenticated;