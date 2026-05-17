DROP POLICY IF EXISTS "View suppliers in company" ON public.suppliers;

CREATE POLICY "View suppliers in company"
ON public.suppliers
FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);