
-- Allow admins/super admins to manage PDFs in the invoices bucket, scoped by company folder.
CREATE POLICY "Admins insert invoice pdfs"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'invoices'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (storage.foldername(name))[1] = public.current_company_id()::text
    )
  )
);

CREATE POLICY "Admins update invoice pdfs"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoices'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (storage.foldername(name))[1] = public.current_company_id()::text
    )
  )
);

CREATE POLICY "Admins read invoice pdfs"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'invoices'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (storage.foldername(name))[1] = public.current_company_id()::text
    )
    OR EXISTS (
      SELECT 1 FROM public.invoices i
      WHERE i.pdf_path = storage.objects.name
        AND i.distributor_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins delete invoice pdfs"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'invoices'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.has_role(auth.uid(), 'admin'::public.app_role)
      AND (storage.foldername(name))[1] = public.current_company_id()::text
    )
  )
);
