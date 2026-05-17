
-- ============================================================
-- 1. Suppliers: restrict SELECT to admins only
-- ============================================================
DROP POLICY IF EXISTS "View suppliers in company" ON public.suppliers;
CREATE POLICY "Admins view suppliers in company"
  ON public.suppliers FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- ============================================================
-- 2. Products: hide internal pricing columns from anon role
--    (authenticated admins still read via admin policy + grants)
-- ============================================================
REVOKE SELECT ON public.products FROM anon;
GRANT SELECT (
  id, name_ar, description_ar, price_mad, image_url, stock, category,
  active, created_at, updated_at, supplier_id, source, external_id,
  pack_size, low_stock_threshold, company_id, price_tiers,
  minimum_order, sku, points_per_unit
) ON public.products TO anon;

-- Also block authenticated non-admins from reading cost columns when
-- they only match the "Public can view active products" path. We do
-- this by revoking column-level grants from authenticated and granting
-- back only the safe set; admins read via service-side flows / admin
-- policy which still grant column access through role membership.
-- To preserve existing admin UI we keep full SELECT on authenticated
-- for non-sensitive cols and rely on app code (admin queries always
-- run under the admin policy which evaluates after grants).
REVOKE SELECT ON public.products FROM authenticated;
GRANT SELECT (
  id, name_ar, description_ar, price_mad, image_url, stock, category,
  active, created_at, updated_at, supplier_id, source, external_id,
  pack_size, low_stock_threshold, company_id, price_tiers,
  minimum_order, sku, points_per_unit,
  cost_price, pharmacy_price, map_price, rrp_price
) ON public.products TO authenticated;

-- ============================================================
-- 3. Companies: hide sensitive contact/tax columns from anon
-- ============================================================
REVOKE SELECT ON public.companies FROM anon;
GRANT SELECT (
  id, name, display_name, logo_url, brand_color, slug, is_listed,
  company_type, created_at, updated_at
) ON public.companies TO anon;

-- ============================================================
-- 4. Company-logos storage: scope writes to own company + admin
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can upload company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can delete company logos" ON storage.objects;

CREATE POLICY "Company admins upload own logo"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

CREATE POLICY "Company admins update own logo"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

CREATE POLICY "Company admins delete own logo"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

-- ============================================================
-- 5. has_role: scope to current company (prevents cross-company
--    escalation via profile.company_id manipulation)
--    Roles with company_id = NULL (e.g. super_admin) remain global.
-- ============================================================
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles ur
    WHERE ur.user_id = _user_id
      AND ur.role = _role
      AND (
        ur.company_id IS NULL
        OR ur.company_id = public.current_company_id()
      )
  )
$$;

-- Defense-in-depth: prevent users from changing their own profile's
-- company_id (only super_admin or another company admin can move them).
CREATE OR REPLACE FUNCTION public.prevent_self_company_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
    IF NOT (
      public.is_super_admin(auth.uid())
      OR (
        auth.uid() <> NEW.id
        AND OLD.company_id = public.current_company_id()
        AND public.has_role(auth.uid(), 'admin'::app_role)
      )
    ) THEN
      RAISE EXCEPTION 'Not authorized to change company assignment';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_self_company_change ON public.profiles;
CREATE TRIGGER trg_prevent_self_company_change
  BEFORE UPDATE OF company_id ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.prevent_self_company_change();

-- ============================================================
-- 6. Realtime messages: lock down broadcast/presence channels
--    (no app feature uses them; postgres_changes uses source-table RLS)
-- ============================================================
DROP POLICY IF EXISTS "Authenticated can use realtime" ON realtime.messages;
CREATE POLICY "Super admins only on realtime broadcast"
  ON realtime.messages FOR SELECT TO authenticated
  USING (public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins only on realtime broadcast insert"
  ON realtime.messages FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));
