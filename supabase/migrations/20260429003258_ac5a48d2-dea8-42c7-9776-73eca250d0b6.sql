-- Wipe legacy role assignments
DELETE FROM public.user_roles
WHERE role NOT IN ('super_admin', 'admin');

-- Each user can have at most one marketplace role
CREATE UNIQUE INDEX IF NOT EXISTS user_roles_one_marketplace_role_per_user
  ON public.user_roles (user_id)
  WHERE role IN ('vendor', 'client');

-- Self-assign role at signup
DROP POLICY IF EXISTS "Users assign self marketplace role" ON public.user_roles;
CREATE POLICY "Users assign self marketplace role"
  ON public.user_roles
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND role IN ('vendor', 'client')
    AND (is_enabled IS NULL OR is_enabled = true)
  );

-- Read own role
DROP POLICY IF EXISTS "Users view own roles" ON public.user_roles;
CREATE POLICY "Users view own roles"
  ON public.user_roles
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR is_super_admin(auth.uid()));

-- Vendors see clients that ordered from them
DROP POLICY IF EXISTS "Vendors view their clients" ON public.profiles;
CREATE POLICY "Vendors view their clients"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.distributor_id = profiles.id
        AND o.company_id = current_company_id()
        AND has_role(auth.uid(), 'admin'::app_role)
    )
  );
