
CREATE OR REPLACE FUNCTION public.provision_company_with_admin(
  _name text,
  _display_name text,
  _admin_email text,
  _admin_password text,
  _admin_full_name text,
  _brand_color text DEFAULT '#16a34a'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth, extensions
AS $$
DECLARE
  new_user_id uuid;
  new_company_id uuid;
  encrypted_pw text;
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admins can provision companies';
  END IF;

  IF EXISTS (SELECT 1 FROM auth.users WHERE email = lower(_admin_email)) THEN
    RAISE EXCEPTION 'البريد % مستخدم بالفعل', _admin_email;
  END IF;

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
    lower(_admin_email),
    encrypted_pw, now(),
    jsonb_build_object('provider','email','providers',jsonb_build_array('email')),
    jsonb_build_object('full_name', _admin_full_name),
    now(), now(), '', '', '', ''
  );

  INSERT INTO auth.identities (
    id, user_id, identity_data, provider, provider_id,
    last_sign_in_at, created_at, updated_at
  ) VALUES (
    gen_random_uuid(), new_user_id,
    jsonb_build_object('sub', new_user_id::text, 'email', lower(_admin_email), 'email_verified', true),
    'email', lower(_admin_email),
    now(), now(), now()
  );

  new_company_id := public.provision_company(
    _name, _display_name, new_user_id, _brand_color, NULL
  );

  UPDATE public.profiles SET full_name = _admin_full_name WHERE id = new_user_id;

  RETURN jsonb_build_object('company_id', new_company_id, 'admin_user_id', new_user_id);
END;
$$;

REVOKE ALL ON FUNCTION public.provision_company_with_admin(text,text,text,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.provision_company_with_admin(text,text,text,text,text,text) TO authenticated;
