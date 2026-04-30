-- Allow public catalog browsing: any visitor or signed-in user can see ACTIVE products
-- from any vendor. Inactive products remain restricted to the owning company's admins.
DROP POLICY IF EXISTS "View company products" ON public.products;

CREATE POLICY "Public can view active products"
  ON public.products
  FOR SELECT
  USING (active = true);

CREATE POLICY "Company admins view all own products"
  ON public.products
  FOR SELECT
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );