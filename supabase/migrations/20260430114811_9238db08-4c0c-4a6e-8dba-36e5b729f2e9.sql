-- ============= ENUM للمراجعات =============
DO $$ BEGIN
  CREATE TYPE public.review_status AS ENUM ('pending', 'approved', 'rejected');
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============= WISHLISTS =============
CREATE TABLE IF NOT EXISTS public.wishlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.wishlists ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own wishlist"
ON public.wishlists FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE INDEX IF NOT EXISTS idx_wishlists_user ON public.wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product ON public.wishlists(product_id);

-- ============= PRODUCT REVIEWS =============
CREATE TABLE IF NOT EXISTS public.product_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  product_id uuid NOT NULL,
  company_id uuid NOT NULL,
  order_id uuid,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title text NOT NULL DEFAULT '',
  body text NOT NULL DEFAULT '',
  status public.review_status NOT NULL DEFAULT 'pending',
  vendor_response text,
  vendor_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, product_id)
);

ALTER TABLE public.product_reviews ENABLE ROW LEVEL SECURITY;

-- Public can read approved reviews
CREATE POLICY "Public view approved product reviews"
ON public.product_reviews FOR SELECT
TO anon, authenticated
USING (status = 'approved');

-- Owner sees own reviews regardless of status
CREATE POLICY "Owner views own product reviews"
ON public.product_reviews FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Vendor admin sees all reviews of their company
CREATE POLICY "Vendor admin views company product reviews"
ON public.product_reviews FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

-- Authenticated user can create their own review
CREATE POLICY "Users create own product reviews"
ON public.product_reviews FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

-- Owner can update their own review (only while pending)
CREATE POLICY "Owner updates own pending product reviews"
ON public.product_reviews FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'pending');

-- Vendor admin can update (approve/reject/respond) reviews of their company
CREATE POLICY "Vendor admin manages product reviews"
ON public.product_reviews FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

-- Owner can delete own
CREATE POLICY "Owner deletes own product reviews"
ON public.product_reviews FOR DELETE
TO authenticated
USING (user_id = auth.uid());

-- Vendor admin can delete reviews of their company
CREATE POLICY "Vendor admin deletes company product reviews"
ON public.product_reviews FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

CREATE INDEX IF NOT EXISTS idx_product_reviews_product ON public.product_reviews(product_id, status);
CREATE INDEX IF NOT EXISTS idx_product_reviews_company ON public.product_reviews(company_id, status);
CREATE INDEX IF NOT EXISTS idx_product_reviews_user ON public.product_reviews(user_id);

CREATE TRIGGER trg_product_reviews_updated_at
BEFORE UPDATE ON public.product_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============= VENDOR REVIEWS =============
CREATE TABLE IF NOT EXISTS public.vendor_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  company_id uuid NOT NULL,
  order_id uuid,
  rating int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  body text NOT NULL DEFAULT '',
  status public.review_status NOT NULL DEFAULT 'pending',
  vendor_response text,
  vendor_responded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, company_id)
);

ALTER TABLE public.vendor_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public view approved vendor reviews"
ON public.vendor_reviews FOR SELECT
TO anon, authenticated
USING (status = 'approved');

CREATE POLICY "Owner views own vendor reviews"
ON public.vendor_reviews FOR SELECT
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Vendor admin views own company reviews"
ON public.vendor_reviews FOR SELECT
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Users create own vendor reviews"
ON public.vendor_reviews FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

CREATE POLICY "Owner updates own pending vendor reviews"
ON public.vendor_reviews FOR UPDATE
TO authenticated
USING (user_id = auth.uid() AND status = 'pending')
WITH CHECK (user_id = auth.uid() AND status = 'pending');

CREATE POLICY "Vendor admin manages own vendor reviews"
ON public.vendor_reviews FOR UPDATE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

CREATE POLICY "Owner deletes own vendor reviews"
ON public.vendor_reviews FOR DELETE
TO authenticated
USING (user_id = auth.uid());

CREATE POLICY "Vendor admin deletes vendor reviews"
ON public.vendor_reviews FOR DELETE
TO authenticated
USING (
  is_super_admin(auth.uid())
  OR (company_id = current_company_id() AND has_role(auth.uid(), 'admin'::app_role))
);

CREATE INDEX IF NOT EXISTS idx_vendor_reviews_company ON public.vendor_reviews(company_id, status);
CREATE INDEX IF NOT EXISTS idx_vendor_reviews_user ON public.vendor_reviews(user_id);

CREATE TRIGGER trg_vendor_reviews_updated_at
BEFORE UPDATE ON public.vendor_reviews
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();