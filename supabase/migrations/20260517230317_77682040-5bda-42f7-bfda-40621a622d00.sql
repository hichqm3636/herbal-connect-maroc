
-- ============================================================
-- product-images bucket: scope writes to own-company products.
-- Files are stored under {company_id}/{product_id}/... — enforce
-- folder[1] = current_company_id() for non-super admins.
-- ============================================================
DROP POLICY IF EXISTS "Vendors update product images" ON storage.objects;
DROP POLICY IF EXISTS "Vendors delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Vendors upload product images" ON storage.objects;

CREATE POLICY "Company admins upload own product images"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

CREATE POLICY "Company admins update own product images"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

CREATE POLICY "Company admins delete own product images"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
    )
  );

-- ============================================================
-- user_roles: prevent company admins from minting super_admin.
-- Replace the catch-all "Manage roles in own company" policy with
-- scoped policies that exclude the super_admin role for non-supers.
-- ============================================================
DROP POLICY IF EXISTS "Manage roles in own company" ON public.user_roles;

CREATE POLICY "Super admins manage all roles"
  ON public.user_roles FOR ALL TO public
  USING (is_super_admin(auth.uid()))
  WITH CHECK (is_super_admin(auth.uid()));

CREATE POLICY "Company admins manage non-privileged roles"
  ON public.user_roles FOR ALL TO public
  USING (
    company_id = current_company_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
  )
  WITH CHECK (
    company_id = current_company_id()
    AND has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
  );
