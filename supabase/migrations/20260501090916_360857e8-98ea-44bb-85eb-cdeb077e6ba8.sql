-- FIX 1: Remove duplicate triggers
DROP TRIGGER IF EXISTS trg_audit_order_items ON public.order_items;
DROP TRIGGER IF EXISTS trg_cod_autopay_on_delivered ON public.orders;

-- FIX 2: trg_payments_update_invoice_status already exists on payments — no action needed.
-- (Verified: AFTER INSERT OR UPDATE OR DELETE calls update_invoice_paid_status())

-- FIX 3: Restrict public listing on product-images / avatars / company-logos.
-- Storage: SELECT permission on storage.objects governs both reading single
-- objects (via known path) AND listing. To keep public READ-by-known-URL
-- working but prevent enumeration/listing, we drop the broad anon SELECT
-- policy and add policies that only allow SELECT when caller is the owner
-- (for avatars), member of the company (for company-logos), or vendor admin
-- (for product-images). Public reads continue to work via the public CDN
-- URL because Supabase serves objects in PUBLIC buckets through the
-- /storage/v1/object/public/ endpoint, which bypasses RLS.

-- product-images
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;

CREATE POLICY "Authenticated vendors read product images"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'product-images'
  AND (
    is_super_admin(auth.uid())
    OR has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'vendor'::app_role)
  )
);

-- avatars: only owner can list / read via authenticated API
CREATE POLICY "Users read own avatar"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'avatars'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);

-- company-logos: only members of the company can list via authenticated API
CREATE POLICY "Company members read company logos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (
    is_super_admin(auth.uid())
    OR (storage.foldername(name))[1] = (current_company_id())::text
  )
);