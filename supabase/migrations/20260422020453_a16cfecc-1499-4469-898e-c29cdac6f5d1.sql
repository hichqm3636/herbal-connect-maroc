-- Remove broad SELECT policies on public buckets to prevent file listing.
-- Public buckets continue to serve files directly via their public URLs without needing a storage.objects SELECT policy.
DROP POLICY IF EXISTS "Avatars are publicly accessible" ON storage.objects;
DROP POLICY IF EXISTS "Company logos are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Public read product images" ON storage.objects;