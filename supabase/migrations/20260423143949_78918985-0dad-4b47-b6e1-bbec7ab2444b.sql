-- 1) Remove order_items referencing internal products (orders themselves stay).
DELETE FROM public.order_items
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

-- 2) Remove invoice_items referencing internal products (invoices themselves stay).
DELETE FROM public.invoice_items
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

-- 3) Remove inventory rows referencing internal products.
DELETE FROM public.inventory_levels
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

DELETE FROM public.inventory_movements
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

DELETE FROM public.inventory_events
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

-- 4) Remove product_zones / product_images for internal products.
DELETE FROM public.product_zones
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

DELETE FROM public.product_images
WHERE product_id IN (SELECT id FROM public.products WHERE external_id IS NULL);

-- 5) Now safe to delete the internal products.
DELETE FROM public.products WHERE external_id IS NULL;

-- 6) Enforce: every product must have an external_id from now on.
ALTER TABLE public.products ALTER COLUMN external_id SET NOT NULL;