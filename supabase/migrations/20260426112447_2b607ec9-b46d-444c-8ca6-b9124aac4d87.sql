-- Helper to check if a user has the partner role
CREATE OR REPLACE FUNCTION public.is_partner(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'partner'::app_role
      AND is_enabled = true
  );
$$;

-- Allow a partner to create an order in their own company,
-- where they are both the distributor (seller-of-record) and the partner_id.
DROP POLICY IF EXISTS "Partners create own orders" ON public.orders;
CREATE POLICY "Partners create own orders"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND public.is_partner(auth.uid())
  AND distributor_id = auth.uid()
  AND partner_id = auth.uid()
  AND company_id IN (
    SELECT p.company_id FROM public.profiles p WHERE p.id = auth.uid()
  )
);

-- Allow partners to insert order_items for orders they own
DROP POLICY IF EXISTS "Partners insert items for own orders" ON public.order_items;
CREATE POLICY "Partners insert items for own orders"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.partner_id = auth.uid()
      AND o.distributor_id = auth.uid()
      AND public.is_partner(auth.uid())
  )
);