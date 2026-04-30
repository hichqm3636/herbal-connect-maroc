-- 1. Fix storage policies for product-images: accept admin OR vendor role
DROP POLICY IF EXISTS "Admins upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins update product images" ON storage.objects;
DROP POLICY IF EXISTS "Admins delete product images" ON storage.objects;

CREATE POLICY "Vendors upload product images"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-images'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'vendor'::app_role)
    OR is_super_admin(auth.uid())
  )
);

CREATE POLICY "Vendors update product images"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'vendor'::app_role)
    OR is_super_admin(auth.uid())
  )
);

CREATE POLICY "Vendors delete product images"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'vendor'::app_role)
    OR is_super_admin(auth.uid())
  )
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname='storage' AND tablename='objects'
      AND policyname='Public read product images'
  ) THEN
    CREATE POLICY "Public read product images"
    ON storage.objects FOR SELECT TO anon, authenticated
    USING (bucket_id = 'product-images');
  END IF;
END$$;

-- 2. Promote existing vendor users to 'admin' (one role per user constraint)
-- so they can manage products/orders/invoices in their company.
UPDATE public.user_roles
SET role = 'admin'::app_role
WHERE role = 'vendor'::app_role
  AND company_id IS NOT NULL;