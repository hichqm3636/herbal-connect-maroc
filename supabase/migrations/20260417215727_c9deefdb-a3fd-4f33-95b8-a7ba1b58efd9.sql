-- 1. Partner type enum + column on profiles
CREATE TYPE public.partner_type AS ENUM ('pharmacy', 'parapharmacy', 'distributor', 'master_distributor');

ALTER TABLE public.profiles
  ADD COLUMN partner_type public.partner_type NOT NULL DEFAULT 'distributor';

-- 2. Wholesale pricing fields on products
ALTER TABLE public.products
  ADD COLUMN rrp_price numeric,
  ADD COLUMN pharmacy_price numeric,
  ADD COLUMN map_price numeric,
  ADD COLUMN minimum_order integer NOT NULL DEFAULT 1,
  ADD COLUMN price_tiers jsonb NOT NULL DEFAULT '[]'::jsonb;

-- 3. Backfill existing products: treat current price_mad as RRP, derive the rest
UPDATE public.products
SET
  rrp_price = price_mad,
  pharmacy_price = ROUND(price_mad * 0.70),
  map_price = ROUND(price_mad * 0.90),
  price_tiers = jsonb_build_array(
    jsonb_build_object('min_qty', 6,  'price', ROUND(price_mad * 0.68)),
    jsonb_build_object('min_qty', 12, 'price', ROUND(price_mad * 0.65)),
    jsonb_build_object('min_qty', 24, 'price', ROUND(price_mad * 0.60))
  )
WHERE rrp_price IS NULL;

-- 4. Sanity constraints
ALTER TABLE public.products
  ADD CONSTRAINT products_minimum_order_positive CHECK (minimum_order >= 1);