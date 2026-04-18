DO $$
BEGIN
  UPDATE auth.users
  SET encrypted_password = crypt('Temp1234!', gen_salt('bf')),
      email_confirmed_at = COALESCE(email_confirmed_at, now()),
      updated_at = now()
  WHERE email = 'fdil.hm@gmail.com';
END $$;