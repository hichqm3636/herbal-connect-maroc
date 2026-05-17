
-- 1. payment-references UPDATE: admin or original buyer only
DROP POLICY IF EXISTS "Update payment references in company" ON storage.objects;
CREATE POLICY "Admins or buyer update own payment references"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'payment-references'
    AND (
      is_super_admin(auth.uid())
      OR (
        (storage.foldername(name))[1] = (current_company_id())::text
        AND has_role(auth.uid(), 'admin'::app_role)
      )
      OR EXISTS (
        SELECT 1 FROM public.invoices i
        WHERE (i.id)::text = (storage.foldername(name))[2]
          AND i.buyer_id = auth.uid()
      )
    )
  );

-- 2. activity_logs: admin-only SELECT
DROP POLICY IF EXISTS "View activity logs in company" ON public.activity_logs;
CREATE POLICY "Admins view activity logs in company"
  ON public.activity_logs FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- 3. inventory_levels: admin-only SELECT
DROP POLICY IF EXISTS "View inventory levels in company" ON public.inventory_levels;
CREATE POLICY "Admins view inventory levels in company"
  ON public.inventory_levels FOR SELECT TO authenticated
  USING (
    is_super_admin(auth.uid())
    OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
  );

-- 4. warehouses: admin-only SELECT (drop broad policy if present, leave admin ALL policy)
DROP POLICY IF EXISTS "View warehouses in company" ON public.warehouses;
