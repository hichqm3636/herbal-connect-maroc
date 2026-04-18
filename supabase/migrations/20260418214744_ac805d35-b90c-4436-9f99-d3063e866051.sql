-- Unban admin user fdil.hm@gmail.com and reactivate profile
UPDATE auth.users
SET banned_until = NULL
WHERE email = 'fdil.hm@gmail.com';

UPDATE public.profiles
SET is_active = true
WHERE id = '3e4996c1-fdc3-4586-a36e-606a5ec7c6ef';