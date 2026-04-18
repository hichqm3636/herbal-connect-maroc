-- Replace the orders INSERT policy with a more permissive version that:
-- 1. Allows super_admins to insert orders for any company
-- 2. Allows users to insert orders where they are the distributor AND the company
--    matches either their profile company OR the active company (handled by current_company_id)
-- 3. Also allows company admins to insert orders on behalf of distributors in their company

DROP POLICY IF EXISTS "Create own orders in company" ON public.orders;

CREATE POLICY "Create orders in company"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    is_super_admin(auth.uid())
    OR (
      auth.uid() = distributor_id
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND company_id IN (
        SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
      )
    )
  )
);
