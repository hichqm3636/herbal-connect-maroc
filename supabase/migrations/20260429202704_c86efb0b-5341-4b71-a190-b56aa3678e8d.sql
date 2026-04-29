
CREATE TABLE IF NOT EXISTS public.super_admin_login_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  ip text,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sal_user_time ON public.super_admin_login_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_sal_ip_time ON public.super_admin_login_attempts (ip, created_at DESC);

ALTER TABLE public.super_admin_login_attempts ENABLE ROW LEVEL SECURITY;

-- Only super_admins can view their own attempts; service role manages writes from server fns
CREATE POLICY "Super admins can view their attempts"
ON public.super_admin_login_attempts
FOR SELECT
TO authenticated
USING (public.is_super_admin(auth.uid()) AND user_id = auth.uid());
