-- Make company-logos bucket publicly readable (branding data)
DROP POLICY IF EXISTS "Company members read company logos" ON storage.objects;
DROP POLICY IF EXISTS "Public read company logos" ON storage.objects;

CREATE POLICY "Public read company logos"
ON storage.objects
FOR SELECT
TO anon, authenticated
USING (bucket_id = 'company-logos');

UPDATE storage.buckets SET public = true WHERE id = 'company-logos';