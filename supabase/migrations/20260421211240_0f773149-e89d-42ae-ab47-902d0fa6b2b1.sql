-- Storage bucket for payment reference uploads (receipts, transfer slips, etc.)
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-references', 'payment-references', false)
ON CONFLICT (id) DO NOTHING;

-- View own company's payment references
CREATE POLICY "View payment references in company"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'payment-references'
  AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = public.current_company_id()::text
  )
);

-- Upload payment references into own company's folder
CREATE POLICY "Upload payment references in company"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'payment-references'
  AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = public.current_company_id()::text
  )
);

-- Update payment references in own company
CREATE POLICY "Update payment references in company"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'payment-references'
  AND (
    public.is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = public.current_company_id()::text
  )
);

-- Delete payment references in own company (admins only)
CREATE POLICY "Delete payment references in company"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'payment-references'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      (storage.foldername(name))[1] = public.current_company_id()::text
      AND public.has_role(auth.uid(), 'admin'::public.app_role)
    )
  )
);

-- Allow distributors to insert payments for their OWN invoices
-- (existing policy only allowed admins to insert)
CREATE POLICY "Distributors record own invoice payments"
ON public.payments FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.invoices i
    WHERE i.id = invoice_id
      AND i.distributor_id = auth.uid()
      AND i.company_id = payments.company_id
  )
);
