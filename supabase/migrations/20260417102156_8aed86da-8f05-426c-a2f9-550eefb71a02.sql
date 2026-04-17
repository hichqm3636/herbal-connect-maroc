-- Gallery table
CREATE TABLE public.product_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  url text NOT NULL,
  position integer NOT NULL DEFAULT 0,
  is_primary boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_product_images_product ON public.product_images(product_id, position);

-- Only one primary per product
CREATE UNIQUE INDEX uniq_product_images_primary
ON public.product_images(product_id)
WHERE is_primary;

ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view images of active products; admins see all
CREATE POLICY "View images of active products"
ON public.product_images FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin')
  OR EXISTS (SELECT 1 FROM public.products p WHERE p.id = product_id AND p.active)
);

CREATE POLICY "Admins manage product images"
ON public.product_images FOR ALL
USING (public.has_role(auth.uid(), 'admin'))
WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Sync products.image_url with the primary image
CREATE OR REPLACE FUNCTION public.sync_product_primary_image()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_product uuid;
  primary_url text;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_product := OLD.product_id;
  ELSE
    target_product := NEW.product_id;
  END IF;

  SELECT url INTO primary_url
  FROM public.product_images
  WHERE product_id = target_product AND is_primary
  LIMIT 1;

  IF primary_url IS NULL THEN
    SELECT url INTO primary_url
    FROM public.product_images
    WHERE product_id = target_product
    ORDER BY position ASC, created_at ASC
    LIMIT 1;
  END IF;

  UPDATE public.products
  SET image_url = primary_url
  WHERE id = target_product;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_sync_product_primary_image
AFTER INSERT OR UPDATE OR DELETE ON public.product_images
FOR EACH ROW
EXECUTE FUNCTION public.sync_product_primary_image();

-- Backfill: migrate existing products.image_url into the gallery
INSERT INTO public.product_images (product_id, url, position, is_primary)
SELECT id, image_url, 0, true
FROM public.products
WHERE image_url IS NOT NULL AND image_url <> '';