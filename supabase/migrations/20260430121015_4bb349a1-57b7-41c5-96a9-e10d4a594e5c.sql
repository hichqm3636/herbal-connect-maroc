-- 1. Add FK so PostgREST embed works for profiles join
ALTER TABLE public.product_reviews
  ADD CONSTRAINT product_reviews_user_id_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;

-- 2. Prevent duplicate reviews per user/product
CREATE UNIQUE INDEX IF NOT EXISTS uniq_product_review
  ON public.product_reviews (user_id, product_id);

-- 3. Enforce verified purchase: if order_id is set, the order must belong to the reviewer
CREATE OR REPLACE FUNCTION public.enforce_review_order_ownership()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.order_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.orders o
      WHERE o.id = NEW.order_id
        AND o.buyer_id = NEW.user_id
        AND o.company_id = NEW.company_id
    ) THEN
      RAISE EXCEPTION 'order_id does not belong to the reviewing user'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_product_review_order ON public.product_reviews;
CREATE TRIGGER trg_enforce_product_review_order
  BEFORE INSERT OR UPDATE ON public.product_reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_order_ownership();

DROP TRIGGER IF EXISTS trg_enforce_vendor_review_order ON public.vendor_reviews;
CREATE TRIGGER trg_enforce_vendor_review_order
  BEFORE INSERT OR UPDATE ON public.vendor_reviews
  FOR EACH ROW EXECUTE FUNCTION public.enforce_review_order_ownership();