CREATE OR REPLACE FUNCTION public._tmp_check_auth_user(_email text)
RETURNS TABLE(id uuid, email text, created_at timestamptz, raw_user_meta_data jsonb)
LANGUAGE sql SECURITY DEFINER SET search_path = public, auth
AS $$
  SELECT id, email::text, created_at, raw_user_meta_data
  FROM auth.users WHERE email = _email;
$$;