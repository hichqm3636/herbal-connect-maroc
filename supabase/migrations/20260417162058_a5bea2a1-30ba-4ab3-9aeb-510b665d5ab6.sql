-- Temporarily reset admin password for end-to-end testing
UPDATE auth.users
SET encrypted_password = crypt('Admin12345!', gen_salt('bf')),
    updated_at = now()
WHERE email = 'fdil.hm@gmail.com';