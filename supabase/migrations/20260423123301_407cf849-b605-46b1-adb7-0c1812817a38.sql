-- ============================================================
-- Distributor-enabled RLS guard for write operations
-- ============================================================
-- Goal: prevent any user whose distributor role row has
-- is_enabled=false from inserting into orders, order_items, or
-- quick_order_templates. Admin / super_admin always bypass.
--
-- This is a defence-in-depth layer that complements the
-- requireEnabledDistributorRole middleware (server functions)
-- and the client-side fallback UI in _app.tsx. Even if a
-- disabled distributor crafts a direct REST/RPC call to the
-- Supabase REST API, RLS will reject the write.

-- Helper: returns true when the user has at least one ENABLED
-- distributor-style role (buyer / seller / sales_agent /
-- distributor). SECURITY DEFINER so it can be used in policies
-- without triggering recursive RLS on user_roles.
CREATE OR REPLACE FUNCTION public.has_enabled_distributor_role(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND is_enabled = true
      AND role IN ('buyer', 'seller', 'sales_agent', 'distributor')
  );
$$;

-- ---------- orders ----------
-- Replace the existing INSERT policy so distributors must have
-- an enabled role. Admin / super_admin paths are unchanged.
DROP POLICY IF EXISTS "Create orders in company" ON public.orders;
CREATE POLICY "Create orders in company"
ON public.orders
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() IS NOT NULL
  AND (
    -- super_admin: unrestricted
    is_super_admin(auth.uid())
    -- admin: must belong to the same company
    OR (
      has_role(auth.uid(), 'admin'::app_role)
      AND company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
    )
    -- distributor: must be the order owner AND have an enabled distributor role
    OR (
      auth.uid() = distributor_id
      AND company_id IN (SELECT p.company_id FROM profiles p WHERE p.id = auth.uid())
      AND has_enabled_distributor_role(auth.uid())
    )
  )
);

-- ---------- order_items ----------
-- Same idea: a disabled distributor cannot insert order_items
-- against their own order.
DROP POLICY IF EXISTS "Insert order items for own order" ON public.order_items;
CREATE POLICY "Insert order items for own order"
ON public.order_items
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1
    FROM public.orders o
    WHERE o.id = order_items.order_id
      AND o.distributor_id = auth.uid()
      AND o.company_id = current_company_id()
  )
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_enabled_distributor_role(auth.uid())
  )
);

-- ---------- quick_order_templates ----------
-- Disabled distributors cannot save / overwrite templates.
DROP POLICY IF EXISTS "Insert own templates in company" ON public.quick_order_templates;
CREATE POLICY "Insert own templates in company"
ON public.quick_order_templates
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND company_id = current_company_id()
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_enabled_distributor_role(auth.uid())
  )
);

DROP POLICY IF EXISTS "Update own templates in company" ON public.quick_order_templates;
CREATE POLICY "Update own templates in company"
ON public.quick_order_templates
FOR UPDATE
TO authenticated
USING (
  auth.uid() = user_id
  AND company_id = current_company_id()
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_enabled_distributor_role(auth.uid())
  )
);
