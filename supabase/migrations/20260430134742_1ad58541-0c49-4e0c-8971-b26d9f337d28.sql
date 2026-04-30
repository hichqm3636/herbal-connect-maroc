CREATE OR REPLACE FUNCTION public.product_reviews_page(
  _product_id uuid,
  _sort text DEFAULT 'newest',
  _limit int DEFAULT 10,
  _cursor_created_at timestamptz DEFAULT NULL,
  _cursor_id uuid DEFAULT NULL,
  _cursor_rating int DEFAULT NULL,
  _min_rating int DEFAULT 1,
  _max_rating int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  rating int,
  title text,
  body text,
  created_at timestamptz,
  order_id uuid,
  user_id uuid,
  author_name text,
  author_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    r.id, r.rating, r.title, r.body, r.created_at, r.order_id, r.user_id,
    p.full_name AS author_name,
    p.avatar_url AS author_avatar_url
  FROM public.product_reviews r
  LEFT JOIN public.profiles p ON p.id = r.user_id
  WHERE r.product_id = _product_id
    AND r.status = 'approved'
    AND r.rating >= COALESCE(_min_rating, 1)
    AND r.rating <= COALESCE(_max_rating, 5)
    AND (
      _sort = 'newest' AND (
        _cursor_created_at IS NULL
        OR (r.created_at, r.id) < (_cursor_created_at, _cursor_id)
      )
      OR
      _sort = 'highest' AND (
        _cursor_rating IS NULL
        OR (r.rating, r.created_at, r.id) < (_cursor_rating, _cursor_created_at, _cursor_id)
      )
    )
  ORDER BY
    CASE WHEN _sort = 'highest' THEN r.rating END DESC NULLS LAST,
    r.created_at DESC,
    r.id DESC
  LIMIT GREATEST(1, LEAST(_limit, 50));
$$;

GRANT EXECUTE ON FUNCTION public.product_reviews_page(uuid, text, int, timestamptz, uuid, int, int, int) TO anon, authenticated;