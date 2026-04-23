ALTER TABLE public.user_roles
ADD COLUMN IF NOT EXISTS is_enabled boolean NOT NULL DEFAULT true;

UPDATE public.user_roles
SET is_enabled = true
WHERE is_enabled IS DISTINCT FROM true;

CREATE INDEX IF NOT EXISTS idx_user_roles_user_role_enabled
ON public.user_roles (user_id, role, is_enabled);