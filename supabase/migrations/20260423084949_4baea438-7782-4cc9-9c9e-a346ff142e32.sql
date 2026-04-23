-- Allow stock to be null (means: available, quantity unknown)
ALTER TABLE public.products ALTER COLUMN stock DROP NOT NULL;
ALTER TABLE public.products ALTER COLUMN stock DROP DEFAULT;