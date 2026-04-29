-- Strict role correction for fdiliskar@gmail.com: vendor only
DELETE FROM public.user_roles
WHERE user_id = (SELECT id FROM auth.users WHERE email = 'fdiliskar@gmail.com')
  AND role IN ('admin', 'super_admin');

INSERT INTO public.user_roles (user_id, role, company_id, is_enabled)
SELECT u.id, 'vendor'::app_role, '311d71a7-28d0-4843-bc9b-a240165ecef5', true
FROM auth.users u
WHERE u.email = 'fdiliskar@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.user_roles r
    WHERE r.user_id = u.id AND r.role = 'vendor'
  );

-- Enforce single role per user (one row per user_id)
ALTER TABLE public.user_roles
  ADD CONSTRAINT one_role_per_user UNIQUE (user_id);
